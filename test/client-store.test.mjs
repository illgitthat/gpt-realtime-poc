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
  removals = [];
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, raw) { this.writes.push({ key, raw }); this.data.set(key, raw); }
  removeItem(key) { this.removals.push(key); this.data.delete(key); }
}

class Locks {
  queues = new Map();
  requests = [];
  active = 0;
  maxActive = 0;

  request(name, options, callback) {
    assert.equal(options.mode, 'exclusive');
    this.requests.push(name);
    const result = (this.queues.get(name) ?? Promise.resolve()).then(async () => {
      this.active++;
      this.maxActive = Math.max(this.maxActive, this.active);
      try { return await callback(); }
      finally { this.active--; }
    });
    this.queues.set(name, result.catch(() => {}));
    return result;
  }
}

function fixture(raw = JSON.stringify(value())) {
  const storage = new Storage();
  const locks = new Locks();
  if (raw !== null) storage.data.set(key, raw);
  const tab = () => new ConversationStore({ storage, locks });
  return { storage, locks, tab };
}

test('two restored tabs cannot resurrect a deleted conversation, even before a storage event', async () => {
  const { storage, tab } = fixture();
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

test('new claims block old saves and clears, even when the payload is identical', async () => {
  const { storage, tab } = fixture();
  const first = tab(), saver = tab(), deleter = tab();
  first.read();
  saver.read();
  deleter.read();
  assert.equal(await first.claim(value()), true);
  const claimed = storage.getItem(key);
  assert.match(JSON.parse(claimed)._revision, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(await saver.save(value('Old history')), false);
  assert.equal(await deleter.clear(), false);
  assert.equal(storage.getItem(key), claimed);
  assert.equal(saver.stale, true);
  assert.equal(deleter.stale, true);
});

test('a changed save assigns a new revision and blocks another restored writer', async () => {
  const { storage, tab } = fixture();
  const first = tab(), second = tab();
  await first.claim(value());
  second.read();
  const revision = JSON.parse(storage.getItem(key))._revision;
  assert.equal(await first.save(value('Newer history')), true);
  assert.notEqual(JSON.parse(storage.getItem(key))._revision, revision);
  assert.equal(await second.save(value('Older history')), false);
  assert.equal(JSON.parse(storage.getItem(key)).history[0].text, 'Newer history');
});

test('unchanged saves write neither a revision nor a storage event, including legacy records', async () => {
  const { storage, tab } = fixture(JSON.stringify(value(), null, 2));
  const store = tab();
  store.read();
  const legacy = storage.getItem(key);
  assert.equal(await store.save(value()), true);
  assert.equal(storage.getItem(key), legacy);
  assert.equal(storage.writes.length, 0);
  await store.claim(value());
  const claimed = storage.getItem(key);
  const restored = store.read();
  assert.equal(await store.save(restored), true);
  assert.equal(await store.save({ ...value(), _revision: 'ignored-caller-revision' }), true);
  assert.equal(storage.getItem(key), claimed);
  assert.equal(storage.writes.length, 1);
  await store.claim(value());
  assert.notEqual(storage.getItem(key), claimed);
});

test('unchanged values ignore object key order but retain history and card array order', async () => {
  const original = {
    ...value(), config: { mode: 'tutor', language: 'Spanish' },
    history: [{ role: 'user', text: 'Hola' }, { role: 'assistant', text: '¡Hola!' }],
  };
  const { storage, tab } = fixture(JSON.stringify(original));
  const store = tab();
  store.read();
  const reordered = {
    hasStarted: original.hasStarted, cards: original.cards,
    history: original.history.map(({ role, text }) => ({ text, role })),
    config: { language: 'Spanish', mode: 'tutor' },
  };
  assert.equal(await store.save(reordered), true);
  assert.equal(storage.writes.length, 0);
  reordered.history.reverse();
  assert.equal(await store.save(reordered), true);
  assert.equal(storage.writes.length, 1);
});

test('clear rejects queued old saves until a subsequent explicit claim', async () => {
  const { storage, tab } = fixture();
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

test('storage observation invalidates ownership permanently even if storage returns to the baseline', async () => {
  const { storage, tab } = fixture();
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

test('delayed storage events do not invalidate a successful newer own claim', async () => {
  const { storage, tab } = fixture();
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

test('reading a replacement reports its value without silently taking its ownership', async () => {
  const { storage, tab } = fixture();
  const first = tab(), second = tab();
  first.read();
  await second.claim(value('Replacement'));
  assert.equal(first.read().history[0].text, 'Replacement');
  assert.equal(first.stale, true);
  assert.equal(await first.save(value('Old snapshot')), false);
  assert.equal(await first.clear(), false);
  await second.clear();
  assert.equal(first.read(), null);
  assert.equal(await first.save(value('Old snapshot')), false);
  assert.equal(storage.getItem(key), null);
});

test('fresh or unobserved empty stores cannot save without an explicit claim', async () => {
  const { storage, tab } = fixture(null);
  const unobserved = tab(), empty = tab(), other = tab();
  assert.equal(await unobserved.save(value()), false);
  assert.equal(await unobserved.clear(), false);
  assert.equal(empty.read(), null);
  await other.claim(value('Another generation'));
  await other.clear();
  assert.equal(await empty.save(value('Old empty snapshot')), false);
  assert.equal(storage.getItem(key), null);
  assert.equal(await empty.claim(value('Explicit new generation')), true);
});

test('shared exclusive locks and each store queue serialize concurrent mutations', async () => {
  const { storage, locks, tab } = fixture();
  const first = tab(), second = tab();
  first.read();
  second.read();
  assert.deepEqual(await Promise.all([
    first.save(value('First turn')),
    first.save(value('Second turn')),
    second.save(value('Conflicting turn')),
  ]), [true, true, false]);
  assert.equal(locks.maxActive, 1);
  assert.equal(new Set(locks.requests).size, 1);
  assert.ok(locks.requests[0].includes(key));
  assert.deepEqual(storage.writes.map(write => JSON.parse(write.raw).history[0].text), [
    'First turn', 'Second turn',
  ]);
});

test('same-tab operations wait their turn before requesting a shared lock', async t => {
  const { storage, locks, tab } = fixture();
  const store = tab();
  store.read();
  await store.save(value());
  const name = locks.requests[0];
  locks.requests.length = 0;
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
  assert.equal(locks.requests.length, 2);
  assert.equal(storage.writes.length, 0);
  release.resolve();
  await blocker;
  assert.deepEqual(await Promise.all([first, clear, stale]), [true, true, false]);
  assert.equal(locks.requests.length, 4);
  assert.equal(locks.maxActive, 1);
  assert.equal(storage.getItem(key), null);
});

test('queued claim/save values are snapshotted at invocation and do not mutate caller metadata', async () => {
  const { storage, tab } = fixture(null);
  const store = tab();
  const original = { ...value('Initial turn'), _revision: 'caller-owned' };
  const claiming = store.claim(original);
  original.history[0].text = 'Mutated later';
  const saving = store.save(value('Next turn'));
  assert.deepEqual(await Promise.all([claiming, saving]), [true, true]);
  assert.deepEqual(storage.writes.map(write => JSON.parse(write.raw).history[0].text), [
    'Initial turn', 'Next turn',
  ]);
  assert.equal(original._revision, 'caller-owned');
});

test('corrupt or oversized stored data retains the raw baseline so it can be cleared', async () => {
  for (const raw of ['{broken JSON', '', '{'.repeat(100001)]) {
    const { storage, tab } = fixture(raw);
    const store = tab();
    assert.throws(() => store.read(), raw.length > 100000 ? /too large/ : SyntaxError);
    assert.equal(await store.clear(), true);
    assert.equal(storage.getItem(key), null);
  }
});

test('read accepts the 100000-character limit and legacy objects without revision metadata', async () => {
  const raw = JSON.stringify(value());
  const { storage, tab } = fixture(raw.padEnd(100000, ' '));
  const store = tab();
  assert.deepEqual(store.read(), value());
  assert.equal(await store.save(value()), true);
  assert.equal(storage.writes.length, 0);
});

test('a corrupt observed record cannot be cleared after another tab replaces it', async () => {
  const { storage, tab } = fixture('{broken JSON');
  const first = tab(), second = tab();
  assert.throws(() => first.read(), SyntaxError);
  await second.claim(value('Replacement'));
  assert.equal(await first.clear(), false);
  assert.equal(JSON.parse(storage.getItem(key)).history[0].text, 'Replacement');
});

test('storage read, observation, quota, and deletion failures propagate without poisoning the queue', async () => {
  const { storage, tab } = fixture();
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

test('JSON errors and oversized writes reject without losing current ownership', async () => {
  const { storage, tab } = fixture();
  const store = tab();
  store.read();
  const baseline = storage.getItem(key);
  const circular = value();
  circular.history.push(circular);
  await assert.rejects(store.save(circular), TypeError);
  await assert.rejects(store.claim({ ...value(), count: 1n }), TypeError);
  await assert.rejects(store.claim(null), TypeError);
  await assert.rejects(store.claim(value('x'.repeat(100001))), /too large/);
  assert.equal(storage.getItem(key), baseline);
  assert.equal(store.stale, false);
  assert.equal(await store.save(value('Recovered')), true);
});

test('missing Web Locks leaves reads usable but every mutation fails explicitly', async () => {
  const { storage } = fixture();
  for (const locks of [undefined, null, {}, { request: false }]) {
    const store = new ConversationStore({ storage, locks });
    assert.deepEqual(store.read(), value());
    await assert.rejects(store.claim(value()), /Web Locks.*required/);
    await assert.rejects(store.save(value()), /Web Locks.*required/);
    await assert.rejects(store.clear(), /Web Locks.*required/);
    assert.equal(store.stale, false);
  }
  assert.equal(storage.writes.length, 0);
  assert.equal(storage.removals.length, 0);
});

test('lock request errors propagate and a later mutation can retry', async () => {
  const { storage, locks } = fixture();
  const failure = new Error('Lock request denied');
  const request = locks.request;
  locks.request = () => { throw failure; };
  const store = new ConversationStore({ storage, locks });
  store.read();
  await assert.rejects(store.save(value()), error => error === failure);
  locks.request = request;
  assert.equal(await store.save(value('Retry')), true);
});

test('custom storage keys use distinct deterministic locks and do not touch the default record', async () => {
  const { storage, locks } = fixture();
  const customKey = 'custom.recent';
  const first = new ConversationStore({ storage, locks, key: customKey });
  const second = new ConversationStore({ storage, locks, key: customKey });
  const original = storage.getItem(key);
  await first.claim(value('Custom'));
  second.read();
  await first.save(value('Custom update'));
  assert.equal(await second.clear(), false);
  assert.equal(new Set(locks.requests).size, 1);
  assert.ok(locks.requests[0].includes(customKey));
  assert.equal(storage.getItem(key), original);
});
