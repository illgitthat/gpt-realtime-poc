import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationStore } from '../public/conversation-store.js';

const key = 'voice-chat.recent.v1';
const value = (text = 'Hello') => ({
  config: { mode: 'general' }, history: [{ role: 'user', text }], cards: [], hasStarted: true,
});

class Storage {
  data = new Map();
  writes = [];
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, raw) { this.writes.push({ key, raw }); this.data.set(key, raw); }
  removeItem(key) { this.data.delete(key); }
}

class Locks {
  queues = new Map();
  requests = [];

  request(name, _options, callback) {
    this.requests.push(name);
    const result = (this.queues.get(name) ?? Promise.resolve()).then(callback);
    this.queues.set(name, result.catch(() => {}));
    return result;
  }
}

function fixture(t) {
  const storage = new Storage();
  const locks = new Locks();
  storage.data.set(key, JSON.stringify(value()));
  for (const [name, value] of Object.entries({ localStorage: storage, navigator: { locks } })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  }
  const tab = () => new ConversationStore();
  return { storage, locks, tab };
}

test('two restored tabs cannot resurrect a deleted conversation, even before a storage event', async t => {
  const { storage, tab } = fixture(t);
  const first = tab(), second = tab();
  first.read();
  second.read();
  assert.equal(await first.clear(), true);
  assert.equal(await second.save(value('Stale pagehide snapshot')), false);
  assert.equal(second.stale, true);
  assert.equal(storage.getItem(key), null);
  assert.equal(storage.writes.length, 0);
  assert.equal(await second.clear(), false);
});

test('new claims block old saves and clears, even when the payload is identical', async t => {
  const { storage, tab } = fixture(t);
  const first = tab(), saver = tab(), deleter = tab();
  first.read();
  saver.read();
  deleter.read();
  assert.equal(await first.claim(value()), true);
  const claimed = storage.getItem(key);
  assert.equal(await saver.save(value('Old history')), false);
  assert.equal(await deleter.clear(), false);
  assert.equal(storage.getItem(key), claimed);
  assert.equal(saver.stale, true);
  assert.equal(deleter.stale, true);
});

test('saving newer history blocks another restored writer', async t => {
  const { storage, tab } = fixture(t);
  const first = tab(), second = tab();
  await first.claim(value());
  second.read();
  assert.equal(await first.save(value('Newer history')), true);
  assert.equal(await second.save(value('Older history')), false);
  assert.equal(JSON.parse(storage.getItem(key)).history[0].text, 'Newer history');
});

test('clear rejects queued old saves until a subsequent explicit claim', async t => {
  const { storage, tab } = fixture(t);
  const store = tab();
  store.read();
  const clearing = store.clear();
  const saving = store.save(value('Queued old snapshot'));
  assert.deepEqual(await Promise.all([clearing, saving]), [true, false]);
  assert.equal(storage.getItem(key), null);
  assert.equal(store.stale, true);
  assert.equal(store.read(), null);
  assert.equal(await store.save(value()), false);
  assert.equal(await store.claim(value('New conversation')), true);
  assert.equal(store.stale, false);
  assert.equal(await store.save(value('New conversation continued')), true);
});

test('storage observation invalidates ownership permanently even if storage returns to the baseline', async t => {
  const { storage, tab } = fixture(t);
  const store = tab();
  store.read();
  const baseline = storage.getItem(key);
  storage.data.clear();
  assert.equal(store.observe(), true);
  assert.equal(store.observe(), false);
  storage.data.set(key, baseline);
  assert.equal(store.observe(), false);
  assert.deepEqual(store.read(), value());
  assert.equal(store.stale, true);
  assert.equal(await store.save(value('Old snapshot')), false);
  assert.equal(await store.clear(), false);
});

test('delayed storage events do not invalidate a successful newer own claim', async t => {
  const { storage, tab } = fixture(t);
  const first = tab(), second = tab();
  first.read();
  second.read();
  await second.claim(value('Other tab'));
  await first.claim(value('My new conversation'));
  assert.equal(first.observe(), false);
  assert.equal(first.stale, false);
  assert.equal(await first.save(value('My next turn')), true);
  assert.equal(JSON.parse(storage.getItem(key)).history[0].text, 'My next turn');
});

test('concurrent saves keep local turn order and reject a stale tab', async t => {
  const { storage, tab } = fixture(t);
  const first = tab(), second = tab();
  first.read();
  second.read();
  assert.deepEqual(await Promise.all([
    first.save(value('First turn')),
    first.save(value('Second turn')),
    second.save(value('Conflicting turn')),
  ]), [true, true, false]);
  assert.deepEqual(storage.writes.map(write => JSON.parse(write.raw).history[0].text), [
    'First turn', 'Second turn',
  ]);
});

test('queued saves and deletion retain their order while another tab holds the lock', async t => {
  const { storage, locks, tab } = fixture(t);
  const store = tab();
  store.read();
  await store.save(value());
  const name = locks.requests[0];
  const baseline = storage.getItem(key);
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  t.after(() => release.resolve());
  const blocker = locks.request(name, { mode: 'exclusive' }, () => {
    entered.resolve();
    return release.promise;
  });
  await entered.promise;
  const first = store.save(value('Before deletion'));
  const clear = store.clear();
  const stale = store.save(value('After deletion'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(storage.getItem(key), baseline);
  release.resolve();
  await blocker;
  assert.deepEqual(await Promise.all([first, clear, stale]), [true, true, false]);
  assert.equal(storage.getItem(key), null);
});

test('corrupt or oversized stored data can be cleared unless another tab replaces it', async t => {
  const { storage, tab } = fixture(t);
  for (const raw of ['{broken JSON', '', '{'.repeat(100001)]) {
    storage.setItem(key, raw);
    const store = tab(), stale = tab();
    assert.throws(() => store.read(), raw.length > 100000 ? /too large/ : SyntaxError);
    assert.throws(() => stale.read());
    assert.equal(await store.clear(), true);
    assert.equal(storage.getItem(key), null);
    await store.claim(value('Replacement'));
    assert.equal(await stale.clear(), false);
    assert.equal(JSON.parse(storage.getItem(key)).history[0].text, 'Replacement');
  }
});

test('storage read, observation, quota, and deletion failures propagate without poisoning the queue', async t => {
  const { storage, tab } = fixture(t);
  const store = tab();
  const failure = new Error('Storage denied');
  storage.getItem = () => { throw failure; };
  assert.throws(() => store.read(), error => error === failure);
  assert.throws(() => store.observe(), error => error === failure);
  delete storage.getItem;
  store.read();
  const baseline = storage.getItem(key);
  storage.setItem = () => { throw failure; };
  await assert.rejects(store.save(value('Quota exceeded')), error => error === failure);
  await assert.rejects(store.claim(value('Blocked claim')), error => error === failure);
  assert.equal(storage.getItem(key), baseline);
  assert.equal(store.stale, false);
  delete storage.setItem;
  storage.removeItem = () => { throw failure; };
  await assert.rejects(store.clear(), error => error === failure);
  assert.equal(store.stale, false);
  delete storage.removeItem;
  storage.getItem = () => { throw failure; };
  await assert.rejects(store.save(value()), error => error === failure);
  await assert.rejects(store.clear(), error => error === failure);
  delete storage.getItem;
  assert.equal(await store.save(value('Retry')), true);
  assert.equal(await store.clear(), true);
});

test('oversized writes reject without losing saved history or blocking later saves', async t => {
  const { storage, tab } = fixture(t);
  const store = tab();
  store.read();
  const baseline = storage.getItem(key);
  await assert.rejects(store.claim(value('x'.repeat(100001))), /too large/);
  assert.equal(storage.getItem(key), baseline);
  assert.equal(store.stale, false);
  assert.equal(await store.save(value('Recovered')), true);
});

test('missing Web Locks leaves saved text readable but rejects changes', async t => {
  const { storage, tab } = fixture(t);
  navigator.locks = undefined;
  const store = tab();
  const baseline = storage.getItem(key);
  assert.deepEqual(store.read(), value());
  await assert.rejects(store.claim(value()), /Web Locks.*required/);
  await assert.rejects(store.save(value()), /Web Locks.*required/);
  await assert.rejects(store.clear(), /Web Locks.*required/);
  assert.equal(storage.writes.length, 0);
  assert.equal(storage.getItem(key), baseline);
});

test('lock request errors propagate and a later mutation can retry', async t => {
  const { locks, tab } = fixture(t);
  const failure = new Error('Lock request denied');
  const request = locks.request;
  locks.request = () => { throw failure; };
  const store = tab();
  store.read();
  await assert.rejects(store.save(value()), error => error === failure);
  locks.request = request;
  assert.equal(await store.save(value('Retry')), true);
});
