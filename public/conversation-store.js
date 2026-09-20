export const storageKey = 'voice-chat.recent.v1';

function snapshot(value) {
  const raw = JSON.stringify({ ...value, _revision: crypto.randomUUID() });
  if (raw.length > 100000) throw new Error('Saved conversation is too large.');
  return raw;
}

export class ConversationStore {
  #baseline;
  #stale = false;
  #pending = Promise.resolve();

  get stale() { return this.#stale; }

  read() {
    const raw = localStorage.getItem(storageKey);
    // Only the initial read establishes ownership; reading again cannot revive a stale writer.
    if (this.#baseline === undefined) this.#baseline = raw;
    else if (raw !== this.#baseline) this.#stale = true;
    if (raw !== null && raw.length > 100000) throw new Error('Saved conversation is too large.');
    return raw === null ? null : JSON.parse(raw);
  }

  observe() {
    const raw = localStorage.getItem(storageKey);
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
      return this.#write(saved);
    });
  }

  clear() {
    return this.#enqueue(() => {
      this.observe();
      if (this.#stale || this.#baseline === undefined) return false;
      if (this.#baseline !== null) localStorage.removeItem(storageKey);
      this.#baseline = null;
      // Queued old saves must stay invalid even after the record has disappeared.
      this.#stale = true;
      return true;
    });
  }

  #write(raw) {
    localStorage.setItem(storageKey, raw);
    this.#baseline = raw;
    this.#stale = false;
    return true;
  }

  #enqueue(mutate) {
    const result = this.#pending.then(() => {
      if (typeof navigator.locks?.request !== 'function') {
        throw new Error('Web Locks are required to safely change saved conversation history.');
      }
      return navigator.locks.request(`conversation-store:${storageKey}`, { mode: 'exclusive' }, mutate);
    });
    // Preserve invocation order without letting one rejected mutation poison the queue.
    this.#pending = result.catch(() => {});
    return result;
  }
}
