import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveSession } from '../public/live-session.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
let fixtureId = 0;
async function fixture(t, saved = null, {
  deferredStop = false,
  locks = { request: async (_name, _options, callback) => callback() },
} = {}) {
  const scrolls = [];
  const downloads = [];
  let exportedBlob;
  let controls;
  class Element extends EventTarget {
    children = [];
    attributes = new Map();
    style = {};
    dataset = {};
    value = '';
    textContent = '';
    hidden = false;
    bottom = 400;
    append(child) { child.remove(); child.parent = this; this.children.push(child); }
    insertBefore(child, next) {
      child.remove();
      child.parent = this;
      const index = next ? this.children.indexOf(next) : this.children.length;
      this.children.splice(index, 0, child);
    }
    remove() {
      if (!this.parent) return;
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = null;
    }
    get lastElementChild() { return this.children.at(-1) || null; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    contains(target) { return target === this || this.children.some(child => child.contains(target)); }
    getBoundingClientRect() { return { bottom: this.bottom }; }
    querySelector() { return this.children[0]; }
    scrollIntoView(options) {
      scrolls.push({ element: this, options });
      this.bottom = 844 - controls.offsetHeight - 20;
    }
    click() {
      if (this.disabled) return;
      if (this.download) downloads.push({ download: this.download, href: this.href });
      this.dispatchEvent(new Event('click'));
    }
    focus() { this.focused = true; }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
  }
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  controls = new Element();
  controls.offsetHeight = 180;
  const modes = ['general', 'tutor', 'interview'].map(mode => {
    const button = new Element();
    button.dataset.mode = mode;
    return button;
  });
  const document = Object.assign(new EventTarget(), {
    body: new Element(), visibilityState: 'visible',
    getElementById: element, createElement: () => new Element(),
    querySelector: () => controls, querySelectorAll: () => modes,
  });
  let nextFrame = 0;
  const frames = new Map();
  const window = Object.assign(new EventTarget(), {
    innerHeight: 844, scrollY: 0,
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  const frame = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(callback => callback());
  };
  let stored = saved;
  let writes = 0;
  const storage = {
    getItem: () => stored,
    setItem(_key, value) { stored = value; writes++; },
    removeItem() { stored = null; },
  };
  const globals = new Map();
  for (const [key, value] of Object.entries({
    document, window,
    navigator: { onLine: true, locks },
    localStorage: storage,
    URL: {
      createObjectURL(blob) { exportedBlob = blob; return 'blob:voice-conversation'; },
      revokeObjectURL() {},
    },
  })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  element('welcome').append(new Element());
  element('conversation-actions').append(new Element());
  element('voice').value = 'marin';
  element('remote-audio').play = async () => {};
  element('remote-audio').pause = () => {};
  let live, finishStop;
  const starts = [];
  t.mock.method(LiveSession.prototype, 'start', async function (config, history, options) {
    starts.push({ config, history, options });
    live = this;
    this.connection = { ready: true };
    this.setState('active');
    return true;
  });
  t.mock.method(LiveSession.prototype, 'stop', function ({ immediate = false } = {}) {
    if (deferredStop && this.connection && !immediate) {
      this.connection.closing = true;
      this.setState('closing');
      return new Promise(resolve => {
        finishStop = () => { this.connection = null; this.setState('ended'); resolve(); };
      });
    }
    this.connection = null;
    this.setState('ended');
    return Promise.resolve();
  });
  t.after(async () => {
    window.dispatchEvent(new Event('pagehide'));
    await flush();
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await import(`../public/app.js?fixture=${++fixtureId}`);
  return {
    element, controls, scrolls, document, window, modes, starts, storage, frame,
    get live() { return live; }, stored: () => stored, writes: () => writes,
    downloads, exportedBlob: () => exportedBlob,
    finishStop: () => finishStop(),
  };
}

test('new transcript turns follow inline cards instead of staying pinned to an old card', async t => {
  const f = await fixture(t);
  const { element, scrolls, frame } = f;
  element('start').click();
  const { live } = f;
  live.onTranscript({ type: 'session.output_transcript.delta', delta: 'Try this.', start_ms: 0, end_ms: 100 });
  frame();
  live.onCard({ language: 'Chinese', term: '你好', reading: 'nǐ hǎo', meaning: 'Hello' });
  frame();
  const card = element('transcript').lastElementChild;
  assert.equal(card.className, 'learning-card');
  assert.equal(card.children[1].textContent, '你好');
  assert.equal(card.children[1].lang, 'zh');
  assert.equal(scrolls.at(-1).element, card);
  live.onTranscript({ type: 'session.input_transcript.delta', delta: '你好', start_ms: 300, end_ms: 500 });
  frame();
  const reply = element('transcript').lastElementChild;
  assert.equal(reply.className, 'message message-user');
  assert.equal(scrolls.at(-1).element, reply);
  assert.ok(element('transcript').children.indexOf(card) < element('transcript').children.indexOf(reply));
});

test('start feedback remains busy until ready and cancellation returns editable settings', async t => {
  const f = await fixture(t);
  const { element } = f;
  element('start').click();
  for (const [state, label] of [['permission', 'Allow microphone access…'], ['connecting', 'Connecting…']]) {
    f.live.setState(state);
    assert.equal(element('start').hidden, false);
    assert.equal(element('start').disabled, true);
    assert.equal(element('start').attributes.get('aria-label'), label);
    assert.equal(element('start').attributes.get('aria-busy'), 'true');
    assert.equal(element('settings').disabled, true);
  }
  assert.equal(element('control-note').hidden, true);
  f.live.onWorking(true);
  assert.equal(element('working').hidden, true);
  f.live.setState('active');
  assert.equal(element('working').hidden, false);
  element('end').click();
  assert.equal(element('start').disabled, false);
  assert.equal(element('settings').disabled, false);
});

test('End unlocks settings while closing, and one click starts a fresh session with the selected mode', async t => {
  const f = await fixture(t, null, { deferredStop: true });
  f.element('start').click();
  f.live.onTranscript({ type: 'session.input_transcript.delta', delta: 'Old topic.', start_ms: 0, end_ms: 200 });
  f.element('end').click();
  assert.equal(f.element('settings').disabled, false);
  assert.equal(f.element('start').disabled, true);
  f.modes[1].click();
  f.element('language').value = 'Chinese';
  f.finishStop();
  await flush();
  assert.equal(f.element('start').attributes.get('aria-label'), 'Start new conversation');
  f.element('start').click();
  assert.equal(f.starts.length, 2);
  assert.equal(f.starts[1].config.mode, 'tutor');
  assert.deepEqual(f.starts[1].history, []);
  assert.equal(f.starts[1].options.opening, true);
  assert.equal(f.element('transcript').children.length, 0);
});

test('call controls reflect microphone mute and keep session status separate from connection feedback', async t => {
  const f = await fixture(t);
  t.mock.method(LiveSession.prototype, 'setMuted', function (muted) {
    this.muted = muted;
    this.onMute(muted);
  });
  assert.equal(f.element('session-status').hidden, true);
  f.element('start').click();
  assert.equal(f.element('session-status').hidden, false);
  assert.equal(f.element('status-text').textContent, 'Listening');
  assert.equal(f.element('end-label').textContent, 'End');
  f.element('mute').click();
  assert.equal(f.live.muted, true);
  assert.equal(f.element('mute').attributes.get('aria-pressed'), 'true');
  assert.equal(f.element('status-text').textContent, 'Mic muted');
  assert.equal(f.document.body.dataset.listening, 'false');
  f.element('mute').click();
  assert.equal(f.live.muted, false);
  assert.equal(f.element('mute').attributes.get('aria-pressed'), 'false');
  assert.equal(f.element('status-text').textContent, 'Listening');
  f.live.setState('disconnected');
  assert.equal(f.element('mute').disabled, true);
  assert.equal(f.element('end').hidden, false);
  f.live.setState('connecting');
  assert.equal(f.element('session-status').hidden, true);
  assert.equal(f.element('end-label').textContent, 'Cancel');
  f.element('end').click();
  assert.equal(f.element('session-status').hidden, true);
  assert.equal(f.element('mute').hidden, true);
  assert.equal(f.element('end').hidden, true);
});

const savedConversation = JSON.stringify({
  config: { mode: 'tutor', settings: { language: 'Spanish' }, instructions: '' },
  history: [{ role: 'user', text: 'Help me order a coffee.' }],
  cards: [], hasStarted: true,
});

test('saved conversations expire after 30 days', async t => {
  const expired = JSON.parse(savedConversation);
  expired.savedAt = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const f = await fixture(t, JSON.stringify(expired));
  await flush();
  assert.equal(f.stored(), null);
  assert.equal(f.element('transcript').children.length, 0);
  assert.equal(f.element('continue').hidden, true);
});

test('restored history does not lock settings or require an extra new-conversation click', async t => {
  const f = await fixture(t, savedConversation);
  assert.equal(f.element('settings').disabled, false);
  assert.equal(f.element('start').attributes.get('aria-label'), 'Start new conversation');
  assert.equal(f.element('continue').hidden, false);
  f.modes[2].click();
  assert.equal(f.element('interview-settings').hidden, false);
  assert.equal(f.element('continue').hidden, true);
  f.element('start').click();
  assert.equal(f.starts.length, 1);
  assert.equal(f.starts[0].config.mode, 'interview');
  assert.deepEqual(f.starts[0].history, []);
});

test('Continue deliberately restores context; editing settings instead prepares a new call', async t => {
  const f = await fixture(t, savedConversation);
  f.element('continue').click();
  assert.equal(f.starts.length, 1);
  assert.deepEqual(f.starts[0].history, [{ role: 'user', text: 'Help me order a coffee.' }]);
  assert.equal(f.starts[0].config.mode, 'tutor');
  await f.live.stop();
  f.element('language').value = 'Chinese';
  f.element('settings').dispatchEvent(new Event('input'));
  assert.equal(f.element('continue').hidden, true);
  f.element('continue').click();
  assert.equal(f.starts.length, 1);
});

test('mode settings open separately, retain edits, and stay read-only during a call', async t => {
  const f = await fixture(t);
  f.modes[1].click();
  assert.notEqual(f.element('settings-dialog').open, true);
  assert.equal(f.element('settings-summary').textContent, 'Language & level');
  f.element('open-settings').click();
  assert.equal(f.element('settings-dialog').open, true);
  assert.equal(f.element('settings-title').textContent, 'Language tutor settings');
  f.element('language').value = 'Spanish';
  f.element('voice').value = 'quartz';
  f.element('settings').dispatchEvent(new Event('input'));
  f.element('close-settings').click();
  assert.equal(f.element('settings-dialog').open, false);
  assert.equal(f.element('open-settings').focused, true);
  assert.equal(f.element('settings-summary').textContent, 'Spanish');
  f.modes[0].click();
  f.modes[1].click();
  assert.equal(f.element('language').value, 'Spanish');
  f.element('start').click();
  assert.equal(f.starts[0].config.settings.language, 'Spanish');
  assert.equal(f.starts[0].config.voice, 'quartz');
  f.element('open-settings').click();
  assert.equal(f.element('settings-dialog').open, true);
  assert.equal(f.element('settings').disabled, true);
  assert.equal(f.element('settings-lock-note').hidden, false);
  f.modes[0].click();
  assert.equal(f.element('settings-title').textContent, 'Language tutor settings');
  await f.live.stop();
  assert.equal(f.element('settings').disabled, false);
  assert.equal(f.element('settings-lock-note').hidden, true);
});

test('ending before any speech does not offer a meaningless Continue action', async t => {
  const f = await fixture(t);
  f.element('start').click();
  f.element('end').click();
  await flush();
  assert.equal(f.element('settings').disabled, false);
  assert.equal(f.element('continue').hidden, true);
  f.element('start').click();
  assert.equal(f.starts.length, 2);
  assert.deepEqual(f.starts[1].history, []);
});

test('saved learning cards stay beside their exchange when the conversation continues', async t => {
  const saved = JSON.parse(savedConversation);
  saved.history.push({ role: 'assistant', text: 'Try saying this phrase.' });
  saved.cards = [{ language: 'Spanish', term: 'Un café, por favor.', reading: '', meaning: 'A coffee, please.', after: 0 }];
  const f = await fixture(t, JSON.stringify(saved));
  assert.deepEqual(f.element('transcript').children.map(row => row.className), [
    'message message-user', 'learning-card', 'message message-assistant',
  ]);
  f.element('continue').click();
  f.live.onTranscript({ type: 'session.input_transcript.delta', delta: 'Un café, por favor.', start_ms: 0, end_ms: 500 });
  f.element('end').click();
  await flush();
  assert.equal(f.element('transcript').lastElementChild.className, 'message message-user');
  assert.equal(JSON.parse(f.stored()).cards[0].after, 0);
});

test('an untouched tab never re-saves deleted history when hidden or closed', async t => {
  const f = await fixture(t, savedConversation);
  f.storage.removeItem('voice-chat.recent.v1');
  f.document.visibilityState = 'hidden';
  f.document.dispatchEvent(new Event('visibilitychange'));
  f.window.dispatchEvent(new Event('pagehide'));
  await flush();
  assert.equal(f.stored(), null);
  assert.equal(f.writes(), 0);
});

test('a storage event invalidates active-tab autosaves without interrupting its call', async t => {
  const f = await fixture(t, savedConversation);
  f.element('continue').click();
  f.storage.removeItem('voice-chat.recent.v1');
  f.window.dispatchEvent(Object.assign(new Event('storage'), { key: 'voice-chat.recent.v1' }));
  f.live.onTranscript({ type: 'session.input_transcript.delta', delta: 'Do not restore this.', start_ms: 0, end_ms: 300 });
  f.document.visibilityState = 'hidden';
  f.document.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(f.stored(), null);
  assert.equal(f.live.state, 'active');
  assert.match(f.element('notice').textContent, /another tab/);
});

test('a fresh claim finishing after an external change resumes saving the latest local text', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let release;
  let first = true;
  const locks = { request: async (_name, _options, callback) => {
    if (first) {
      first = false;
      await new Promise(resolve => { release = resolve; });
    }
    return callback();
  } };
  const f = await fixture(t, null, { locks });
  f.element('start').click();
  await flush();
  f.storage.setItem('voice-chat.recent.v1', savedConversation);
  f.window.dispatchEvent(Object.assign(new Event('storage'), { key: 'voice-chat.recent.v1' }));
  f.live.onTranscript({ type: 'session.input_transcript.delta', delta: 'My fresh conversation.', start_ms: 0, end_ms: 300 });
  release();
  await flush();
  t.mock.timers.tick(500);
  await flush();
  assert.equal(JSON.parse(f.stored()).history[0].text, 'My fresh conversation.');
  assert.equal(f.element('notice').hidden, true);
});

test('deleting corrupt saved data needs neither a microphone nor a paid session', async t => {
  const f = await fixture(t, '{invalid saved history');
  assert.match(f.element('notice').textContent, /Could not restore/);
  assert.equal(f.element('conversation-actions').hidden, false);
  f.element('delete').click();
  await flush();
  assert.equal(f.stored(), null);
  assert.equal(f.element('notice').hidden, true);
  assert.equal(f.starts.length, 0);
});

test('failed deletion preserves displayed text and export until deletion can be retried', async t => {
  const f = await fixture(t, savedConversation);
  const remove = f.storage.removeItem;
  f.storage.removeItem = () => { throw new Error('Storage unavailable'); };
  f.element('delete').click();
  await flush();
  assert.equal(f.stored(), savedConversation);
  assert.equal(f.element('transcript').children.length, 1);
  assert.match(f.element('notice').textContent, /Could not delete/);
  assert.equal(f.element('export').disabled, false);
  f.element('export').click();
  assert.match(await f.exportedBlob().text(), /Help me order a coffee\./);
  f.storage.removeItem = remove;
  f.element('delete').click();
  await flush();
  assert.equal(f.stored(), null);
  assert.equal(f.element('transcript').children.length, 0);
  assert.equal(f.element('export').disabled, true);
  assert.equal(f.element('notice').hidden, true);
});

test('conversation actions dismiss on outside tap or Escape, with keyboard focus returned', async t => {
  const { element, document } = await fixture(t);
  const menu = element('conversation-actions');
  menu.open = true;
  document.dispatchEvent(new Event('pointerdown'));
  assert.equal(menu.open, false);
  menu.open = true;
  document.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
  assert.equal(menu.open, false);
  assert.equal(menu.querySelector('summary').focused, true);
});

test('conversation export downloads readable Markdown', async t => {
  const saved = JSON.parse(savedConversation);
  saved.history.push({ role: 'assistant', text: 'Try saying “Un café, por favor.”' });
  saved.cards = [{
    language: 'Spanish', term: 'Un café, por favor.', reading: '',
    meaning: 'A coffee, please.', after: 1,
  }];
  const f = await fixture(t, JSON.stringify(saved));
  f.element('export').click();
  assert.equal(f.downloads.length, 1);
  assert.match(f.downloads[0].download, /^voice-conversation-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.md$/);
  assert.equal(f.exportedBlob().type, 'text/markdown;charset=utf-8');
  const markdown = await f.exportedBlob().text();
  assert.match(markdown, /## You\s+Help me order a coffee\.[\s\S]+## Assistant\s+Try saying “Un café, por favor.”/);
  assert.match(markdown, /### Un café, por favor\./);
  assert.match(markdown, /Spanish/);
  assert.match(markdown, /A coffee, please\./);
});
