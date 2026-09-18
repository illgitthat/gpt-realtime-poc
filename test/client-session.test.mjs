import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveSession } from '../public/live-session.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

class Events extends EventTarget {
  emit(type, props = {}) { this.dispatchEvent(Object.assign(new Event(type), props)); }
}
class Track extends Events {
  readyState = 'live';
  enabled = true;
  stop() { this.readyState = 'ended'; this.enabled = false; }
}
class Stream {
  constructor(tracks = []) { this.tracks = tracks; }
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks; }
  addTrack(track) { this.tracks.push(track); }
}
class Channel extends Events {
  readyState = 'open';
  sent = [];
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 'closed'; this.emit('close'); }
  server(event) { this.emit('message', { data: JSON.stringify(event) }); }
}
class Peer extends Events {
  connectionState = 'new';
  iceGatheringState = 'complete';
  receivers = [];
  channel = new Channel();
  createDataChannel(label) { this.label = label; return this.channel; }
  addTrack(track) { this.track = track; }
  async createOffer() { return { type: 'offer', sdp: 'offer' }; }
  async setLocalDescription(offer) { this.localDescription = { ...offer, sdp: 'offer-with-candidates' }; }
  async setRemoteDescription(answer) { this.answer = answer; }
  getReceivers() { return this.receivers; }
  close() { this.connectionState = 'closed'; }
  state(state) { this.connectionState = state; this.emit('connectionstatechange'); }
}

function fixture(t, { permission, fetcher, peerFactory } = {}) {
  const originals = new Map();
  function global(name, value) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  const tracks = [];
  const peers = [];
  const requests = [];
  let mediaRequests = 0;
  global('navigator', { onLine: true, mediaDevices: { getUserMedia: async () => {
    mediaRequests++;
    if (permission) return permission.promise;
    const track = new Track();
    tracks.push(track);
    return new Stream([track]);
  } } });
  global('MediaStream', Stream);
  global('RTCPeerConnection', class {
    constructor() {
      const peer = peerFactory ? peerFactory() : new Peer();
      peers.push(peer);
      return peer;
    }
  });
  global('fetch', async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body), signal: options.signal });
    return fetcher ? fetcher(url, options) : new Response(JSON.stringify({
      session: { id: 'live_test' }, transport: { type: 'webrtc', sdp: 'answer' },
    }), { status: 201 });
  });
  const states = [], errors = [], transcripts = [], cards = [], working = [], playback = [], closed = [];
  const audio = { srcObject: null, muted: false, paused: false,
    play: async () => { audio.paused = false; }, pause: () => { audio.paused = true; } };
  const live = new LiveSession({
    audio, onState: value => states.push(value), onError: value => errors.push(value),
    onTranscript: value => transcripts.push(value), onCard: value => cards.push(value),
    onWorking: value => working.push(value), onPlayback: value => playback.push(value),
    onClosed: value => closed.push(value),
  });
  t.after(async () => {
    await live.stop({ immediate: true });
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  async function start(config = { mode: 'general' }, history = [], options = {}) {
    const promise = live.start(config, history, options);
    await flush();
    return { promise, peer: peers.at(-1), channel: peers.at(-1)?.channel };
  }
  async function ready(config, history, options) {
    const result = await start(config, history, options);
    result.channel.server({ type: 'session.started' });
    assert.equal(await result.promise, true);
    return result;
  }
  return { live, audio, tracks, peers, requests, states, errors, transcripts, cards, working, playback, closed, start, ready, mediaRequests: () => mediaRequests };
}

test('WebRTC connects once, sends gathered SDP and bounded history, and gates commands on session.started', async t => {
  const f = fixture(t);
  const { promise, peer, channel } = await f.start({ mode: 'general' }, [{ role: 'user', text: 'Remember Spanish.' }]);
  assert.equal(peer.label, 'oai-events');
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, '/connect');
  assert.equal(f.requests[0].body.sdp, 'offer-with-candidates');
  assert.deepEqual(f.requests[0].body.history, [{ role: 'user', text: 'Remember Spanish.' }]);
  assert.deepEqual(peer.answer, { type: 'answer', sdp: 'answer' });
  assert.equal(peer.track.enabled, false);
  assert.equal(channel.sent.length, 0);
  assert.equal(await f.live.start({ mode: 'tutor' }), false);
  assert.equal(f.mediaRequests(), 1);
  channel.server({ type: 'session.started' });
  assert.equal(await promise, true);
  assert.equal(f.live.state, 'active');
  assert.equal(peer.track.enabled, true);
  assert.equal(channel.sent.length, 0);
});

test('connect sends no more than 7600 UTF-8 bytes of multilingual history', async t => {
  const f = fixture(t);
  await f.ready({ mode: 'tutor', settings: { language: 'Chinese' } }, [
    { role: 'assistant', text: 'Earlier context' },
    { role: 'user', text: '你好😀'.repeat(2000) },
  ]);
  const history = f.requests[0].body.history;
  assert.equal(history.length, 1);
  assert.ok(new TextEncoder().encode(history[0].text).length <= 7600);
  assert.ok('你好😀'.repeat(2000).endsWith(history[0].text));
});

test('cancel during microphone permission stops late media without connecting or reviving state', async t => {
  const permission = deferred();
  const f = fixture(t, { permission });
  const pending = f.live.start({ mode: 'general' });
  await f.live.stop();
  const track = new Track();
  permission.resolve(new Stream([track]));
  assert.equal(await pending, false);
  assert.equal(track.readyState, 'ended');
  assert.equal(f.peers.length, 0);
  assert.equal(f.requests.length, 0);
  assert.equal(f.live.state, 'ended');
});

test('cancel aborts an in-flight connect request and cleans every microphone track', async t => {
  const f = fixture(t, { fetcher: (_url, { signal }) => new Promise((_resolve, reject) =>
    signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })) });
  const { promise, peer } = await f.start();
  await f.live.stop();
  assert.equal(await promise, false);
  assert.equal(f.requests[0].signal.aborted, true);
  assert.equal(peer.connectionState, 'closed');
  assert.equal(f.tracks[0].readyState, 'ended');
  assert.deepEqual(f.errors, []);
});

test('ICE and ready waits time out and clean up instead of leaving a live microphone', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t, { peerFactory: () => { const peer = new Peer(); peer.iceGatheringState = 'gathering'; return peer; } });
  const { promise } = await f.start();
  assert.equal(f.requests.length, 0);
  t.mock.timers.tick(10000);
  await flush();
  assert.equal(await promise, false);
  assert.equal(f.live.state, 'error');
  assert.equal(f.tracks[0].readyState, 'ended');
  assert.match(f.errors[0], /Network setup timed out/);
});

test('waiting for session.started is bounded even with an open data channel', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t);
  const { promise } = await f.start();
  t.mock.timers.tick(20000);
  assert.equal(await promise, false);
  assert.equal(f.live.state, 'error');
  assert.equal(f.tracks[0].readyState, 'ended');
  assert.match(f.errors[0], /did not become ready/);
});

test('tutor opening runs once after ready, never on explicit history recovery', async t => {
  const f = fixture(t);
  const first = await f.ready({ mode: 'tutor', settings: { language: 'Chinese' } }, [], { opening: true });
  first.channel.server({ type: 'session.started' });
  assert.equal(first.channel.sent.length, 1);
  assert.equal(first.channel.sent[0].type, 'session.instructions.append');
  assert.equal(first.channel.sent[0].delegation_id, null);
  await f.live.stop({ immediate: true });
  const second = await f.ready({ mode: 'tutor', settings: { language: 'Chinese' } }, [{ role: 'user', text: '你好' }], { opening: false });
  assert.equal(second.channel.sent.length, 0);
});

test('known tutor language opens with a goal question in the beginner support language', async t => {
  const f = fixture(t);
  const { channel } = await f.ready({
    mode: 'tutor', settings: { language: 'Mandarin Chinese', supportLanguage: 'English', level: 'Beginner' },
  }, [], { opening: true });
  const opening = channel.sent.find(event => event.type === 'session.instructions.append');
  assert.match(opening.content, /already selected "Mandarin Chinese"/);
  assert.match(opening.content, /Do not ask which language/);
  assert.match(opening.content, /practice goal or preferred topic/);
  assert.match(opening.content, /setup question in "English"/);
});

test('unspecified tutor level uses support language for setup, while advanced uses target language', async t => {
  const f = fixture(t);
  const settings = { language: 'Spanish', supportLanguage: 'English' };
  const first = await f.ready({ mode: 'tutor', settings }, [], { opening: true });
  assert.match(first.channel.sent[0].content, /setup question in "English"/);
  await f.live.stop({ immediate: true });
  const second = await f.ready({ mode: 'tutor', settings: { ...settings, level: 'Advanced' } }, [], { opening: true });
  assert.match(second.channel.sent[0].content, /setup question in "Spanish"/);
});

test('missing tutor language requests it without inventing a selected language', async t => {
  const f = fixture(t);
  const { channel } = await f.ready({ mode: 'tutor', settings: { supportLanguage: 'English' } }, [], { opening: true });
  assert.match(channel.sent[0].content, /which language would they like to practice/);
  assert.doesNotMatch(channel.sent[0].content, /already selected/);
});

test('end silences mic immediately, drains session.closed and ignores delayed tool calls', async t => {
  const f = fixture(t);
  const { peer, channel } = await f.ready();
  const remote = new Track();
  peer.receivers.push({ track: remote });
  peer.emit('track', { track: remote });
  await flush();
  const ended = f.live.stop();
  assert.equal(f.tracks[0].readyState, 'ended');
  assert.equal(f.audio.paused, true);
  assert.notEqual(peer.connectionState, 'closed');
  assert.equal(channel.sent.at(-1).type, 'session.close');
  channel.server({ type: 'response.event', event: { type: 'response.output_item.done', item: {
    type: 'function_call', call_id: 'late', name: 'show_learning_card',
    arguments: '{"language":"Spanish","term":"hola","reading":"","meaning":"hello"}',
  } } });
  assert.equal(f.cards.length, 0);
  channel.server({ type: 'session.closed', usage: { seconds: 52 } });
  await ended;
  assert.equal(peer.connectionState, 'closed');
  assert.equal(remote.readyState, 'ended');
  assert.equal(f.audio.srcObject, null);
  assert.equal(f.live.connection, null);
  assert.deepEqual(f.closed[0].usage, { seconds: 52 });
  assert.equal(f.closed[0].confirmed, true);
});

test('graceful close fallback reports unconfirmed finalization and frees resources', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t);
  const { peer } = await f.ready();
  const ended = f.live.stop();
  t.mock.timers.tick(5000);
  await ended;
  assert.equal(peer.connectionState, 'closed');
  assert.deepEqual(f.errors, []);
  assert.equal(f.closed[0].confirmed, false);
});

test('expected data-channel errors and close during intentional ending do not become reconnect alerts', async t => {
  const f = fixture(t);
  const { channel, peer } = await f.ready();
  const ended = f.live.stop();
  channel.emit('error');
  assert.equal(f.live.state, 'closing');
  assert.deepEqual(f.errors, []);
  channel.close();
  await ended;
  assert.deepEqual(f.errors, []);
  assert.equal(f.live.state, 'ended');
  assert.equal(peer.connectionState, 'closed');
  assert.equal(f.closed[0].confirmed, false);
});

test('ending cancels pending microphone confirmation timers while final usage drains', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t);
  await f.ready();
  f.live.setMuted(true);
  t.mock.timers.tick(7000);
  const ended = f.live.stop();
  t.mock.timers.tick(5000);
  await ended;
  assert.deepEqual(f.errors, []);
  assert.equal(f.live.state, 'ended');
});

test('network disconnect has a grace period and never creates billable retry loops', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t);
  const { peer } = await f.ready();
  peer.state('disconnected');
  t.mock.timers.tick(4999);
  assert.equal(f.live.state, 'disconnected');
  peer.state('connected');
  t.mock.timers.tick(2);
  assert.equal(f.live.state, 'active');
  peer.state('disconnected');
  t.mock.timers.tick(5000);
  assert.equal(f.live.state, 'error');
  f.live.checkHealth(true);
  assert.equal(f.requests.length, 1);
});

test('transport recovery before session.started cancels the startup disconnect deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t);
  const { promise, peer, channel } = await f.start();
  peer.state('disconnected');
  t.mock.timers.tick(3000);
  peer.state('connected');
  channel.server({ type: 'session.started' });
  assert.equal(await promise, true);
  t.mock.timers.tick(5000);
  assert.equal(f.live.state, 'active');
  assert.equal(peer.track.enabled, true);
  assert.deepEqual(f.errors, []);
  assert.equal(f.requests.length, 1);
});

test('mute gates local media, uses Live commands, and survives explicit replacement', async t => {
  const f = fixture(t);
  const first = await f.ready();
  f.live.setMuted(true);
  assert.equal(first.peer.track.enabled, false);
  assert.equal(first.channel.sent.at(-1).type, 'session.input_audio.mute');
  await f.live.stop({ immediate: true });
  const second = await f.ready();
  assert.equal(second.peer.track.enabled, false);
  assert.equal(second.channel.sent.at(-1).type, 'session.input_audio.mute');
  f.live.setMuted(false);
  assert.equal(second.peer.track.enabled, true);
  assert.equal(second.channel.sent.at(-1).type, 'session.input_audio.unmute');
  second.channel.server({ type: 'error', error: { message: 'Unmute rejected', client_event_id: second.channel.sent.at(-1).event_id } });
  assert.equal(second.peer.track.enabled, false);
  assert.equal(f.live.muted, true);
  assert.equal(f.errors.at(-1), 'Unmute rejected');
});

test('late events from an old channel cannot mutate its replacement', async t => {
  const f = fixture(t);
  const first = await f.ready();
  await f.live.stop({ immediate: true });
  await f.ready();
  first.channel.server({ type: 'session.closed' });
  first.channel.server({ type: 'session.input_transcript.delta', delta: 'old' });
  assert.equal(f.live.state, 'active');
  assert.deepEqual(f.transcripts, []);
});

test('blocked autoplay exposes explicit playback recovery without ending the conversation', async t => {
  const f = fixture(t);
  const { peer } = await f.ready();
  f.audio.play = async () => { throw Object.assign(new Error('Tap required'), { name: 'NotAllowedError' }); };
  peer.emit('track', { track: new Track() });
  await flush();
  assert.equal(f.playback.at(-1), true);
  f.audio.play = async () => {};
  await f.live.resumePlayback();
  assert.equal(f.playback.at(-1), false);
  assert.equal(f.live.state, 'active');
});

test('function outputs are deduplicated and response continuation waits for completion, not empty snapshots', async t => {
  const f = fixture(t);
  const { channel } = await f.ready({ mode: 'tutor' });
  const nested = event => channel.server({ type: 'response.event', delegation_id: 'd1', event });
  channel.server({ type: 'session.delegation.created', delegation: { id: 'd1' } });
  nested({ type: 'response.created', response: { id: 'r1', output: [] } });
  const item = { type: 'function_call', call_id: 'call1', name: 'show_learning_card',
    arguments: '{"language":"Chinese","term":"你好","reading":"nǐ hǎo","meaning":"Hello"}' };
  nested({ type: 'response.output_item.done', response_id: 'r1', item });
  nested({ type: 'response.output_item.done', response_id: 'r1', item });
  assert.equal(f.cards.length, 1);
  assert.equal(channel.sent.length, 1);
  assert.equal(channel.sent[0].type, 'response.item.create');
  assert.deepEqual(JSON.parse(channel.sent[0].item.output), { shown: true });
  nested({ type: 'response.completed', response: { id: 'r1', output: [] } });
  nested({ type: 'response.completed', response: { id: 'r1', output: [] } });
  assert.equal(channel.sent.filter(event => event.type === 'response.create').length, 1);
  assert.equal('delegation_id' in channel.sent[1], false);
  nested({ type: 'response.created', response: { id: 'r2', output: [] } });
  nested({ type: 'response.completed', response: { id: 'r2', output: [] } });
  assert.equal(f.working.at(-1), false);
});

test('invalid and unknown tools get explicit failure output and can finish without stale working state', async t => {
  const f = fixture(t);
  const { channel } = await f.ready({ mode: 'tutor' });
  const nested = event => channel.server({ type: 'response.event', delegation_id: 'd1', event });
  nested({ type: 'response.created', response: { id: 'r1' } });
  nested({ type: 'response.output_item.done', item: {
    type: 'function_call', call_id: 'bad', name: 'unknown', arguments: '{}',
  } });
  assert.equal(JSON.parse(channel.sent[0].item.output).shown, false);
  assert.equal(f.cards.length, 0);
  nested({ type: 'response.failed', response: { id: 'r1', error: { message: 'Backend failed' } } });
  assert.equal(f.working.at(-1), false);
  assert.equal(f.errors.at(-1), 'Backend failed');
  assert.equal(channel.sent.filter(event => event.type === 'response.create').length, 0);
});

test('server connection errors surface their message and release microphone resources', async t => {
  const f = fixture(t, { fetcher: async () => new Response(JSON.stringify({ error: 'Voice service unavailable' }), { status: 503 }) });
  const { promise } = await f.start();
  assert.equal(await promise, false);
  assert.equal(f.errors.at(-1), 'Voice service unavailable');
  assert.equal(f.tracks[0].readyState, 'ended');
  assert.equal(f.requests.length, 1);
});

test('audio mute controls only local playback, without muting mic or sending stop-speaking instructions', async t => {
  const f = fixture(t);
  const { channel, peer } = await f.ready();
  channel.server({ type: 'session.delegation.created', delegation: { id: 'd1' } });
  f.live.setOutputMuted(true);
  assert.equal(f.audio.muted, true);
  assert.equal(peer.track.enabled, true);
  assert.equal(f.live.muted, false);
  assert.equal(channel.sent.length, 0);
  assert.equal(f.working.at(-1), true);
  f.live.setOutputMuted(false);
  assert.equal(f.audio.muted, false);
});

test('service errors and terminal nested failures clear working state without false transcript text', async t => {
  const f = fixture(t);
  const { channel } = await f.ready();
  channel.server({ type: 'session.delegation.created', delegation: { id: 'd1' } });
  channel.server({ type: 'response.event', delegation_id: 'd1', event: {
    type: 'response.output_text.delta', delta: 'This is backend work, not spoken audio.',
  } });
  assert.deepEqual(f.transcripts, []);
  channel.server({ type: 'error', error: { message: 'Tool command rejected' } });
  assert.equal(f.working.at(-1), false);
  assert.equal(f.errors.at(-1), 'Tool command rejected');
  assert.equal(f.live.state, 'active');
  channel.server({ type: 'session.error', error: { message: 'Voice session failed' } });
  assert.equal(f.live.state, 'error');
  assert.equal(f.tracks[0].readyState, 'ended');
});

test('a microphone suspended by the browser requires explicit reconnect, never automatic session creation', async t => {
  const f = fixture(t);
  const { peer } = await f.ready();
  peer.track.muted = true;
  f.live.checkHealth(true);
  assert.equal(f.live.state, 'error');
  assert.match(f.errors.at(-1), /not providing microphone audio/);
  f.live.checkHealth(true);
  assert.equal(f.requests.length, 1);
});

test('connect fetch timeout aborts without retrying the paid request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t, { fetcher: (_url, { signal }) => new Promise((_resolve, reject) =>
    signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })) });
  const { promise } = await f.start();
  t.mock.timers.tick(25000);
  assert.equal(await promise, false);
  assert.equal(f.requests[0].signal.aborted, true);
  assert.equal(f.requests.length, 1);
  assert.equal(f.tracks[0].readyState, 'ended');
  assert.match(f.errors.at(-1), /server took too long/);
});

test('remote audio track ending releases the transport and offers recovery', async t => {
  const f = fixture(t);
  const { peer } = await f.ready();
  const remote = new Track();
  peer.emit('track', { track: remote });
  remote.emit('ended');
  assert.equal(f.live.state, 'error');
  assert.equal(peer.connectionState, 'closed');
  assert.match(f.errors.at(-1), /Assistant audio stopped/);
});
