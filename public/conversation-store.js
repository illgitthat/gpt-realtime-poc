function parse(raw) {
  if (raw.length > 100000) throw new Error('Saved conversation is too large.');
  return JSON.parse(raw);
}

function snapshot(value) {
  const saved = JSON.parse(JSON.stringify(value));
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
    throw new TypeError('Saved conversation must be an object.');
  }
  delete saved._revision;
  return saved;
}

function equal(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' ||
      Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every(key => Object.hasOwn(right, key) && equal(left[key], right[key]));
}

export class ConversationStore {
  #storage;
  #locks;
  #key;
  #baseline;
  #stale = false;
  #pending = Promise.resolve();

  constructor({ storage, locks, key = 'voice-chat.recent.v1' }) {
    this.#storage = storage;
    this.#locks = locks;
    this.#key = key;
  }

  get stale() { return this.#stale; }

  read() {
    const raw = this.#storage.getItem(this.#key);
    // Only the initial read establishes ownership; reading again cannot revive a stale writer.
    if (this.#baseline === undefined) this.#baseline = raw;
    else if (raw !== this.#baseline) this.#stale = true;
    return raw === null ? null : parse(raw);
  }

  observe() {
    const raw = this.#storage.getItem(this.#key);
    // Events may be delayed: compare actual storage, not an event's obsolete newValue.
    if (this.#baseline === undefined || raw === this.#baseline || this.#stale) return false;
    this.#stale = true;
    return true;
  }

  async claim(value) {
    const saved = snapshot(value);
    return this.#enqueue(() => this.#write(saved));
  }

  async save(value) {
    const saved = snapshot(value);
    return this.#enqueue(() => {
      this.observe();
      // Empty storage is not a generation. Only an explicit claim may start one.
      if (this.#stale || this.#baseline == null) return false;
      if (equal(saved, snapshot(parse(this.#baseline)))) return true;
      return this.#write(saved);
    });
  }

  clear() {
    return this.#enqueue(() => {
      this.observe();
      if (this.#stale || this.#baseline === undefined) return false;
      if (this.#baseline !== null) this.#storage.removeItem(this.#key);
      this.#baseline = null;
      // Queued old saves must stay invalid even after the record has disappeared.
      this.#stale = true;
      return true;
    });
  }

  #write(saved) {
    const raw = JSON.stringify({ ...saved, _revision: crypto.randomUUID() });
    if (raw.length > 100000) throw new Error('Saved conversation is too large.');
    this.#storage.setItem(this.#key, raw);
    this.#baseline = raw;
    this.#stale = false;
    return true;
  }

  #enqueue(mutate) {
    const result = this.#pending.then(() => {
      if (typeof this.#locks?.request !== 'function') {
        throw new Error('Web Locks are required to safely change saved conversation history.');
      }
      return this.#locks.request(`conversation-store:${this.#key}`, { mode: 'exclusive' }, mutate);
    });
    // Preserve invocation order without letting one rejected mutation poison the queue.
    this.#pending = result.catch(() => {});
    return result;
  }
}
