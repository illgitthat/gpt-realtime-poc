import { recentHistory, runDisplayTool, validateLearningCard } from './conversation.js';

const noop = () => {};

export class LiveSession {
  constructor({ audio, onState = noop, onTranscript = noop, onCard, onQuestion, onError = noop,
    onWorking = noop, onPlayback = noop, onMute = noop, onClosed = noop }) {
    Object.assign(this, { audio, onState, onTranscript, onCard, onQuestion, onError, onWorking, onPlayback, onMute, onClosed });
    this.connection = null;
    this.state = 'idle';
    this.muted = false;
    this.serial = 0;
  }

  setState(state) {
    this.state = state;
    this.onState(state);
  }

  isCurrent(c) { return this.connection === c; }
  isOpen(c) { return this.isCurrent(c) && !c.closing; }

  listen(c, target, name, callback) {
    const guarded = event => {
      if (this.isCurrent(c)) callback(event);
    };
    target.addEventListener(name, guarded);
    c.listeners.push(() => target.removeEventListener(name, guarded));
  }

  later(c, callback, ms) {
    const timer = setTimeout(() => {
      c.timers.delete(timer);
      if (this.isCurrent(c)) callback();
    }, ms);
    c.timers.add(timer);
    return timer;
  }

  cancelTimer(c, timer) {
    clearTimeout(timer);
    c.timers.delete(timer);
  }

  async start(config, history = [], { opening = false } = {}) {
    if (this.connection) return false;
    const c = {
      config: structuredClone(config), controller: new AbortController(), timers: new Set(), listeners: [],
      sessionStarted: false, warmedUp: false, ready: false, closing: false, responses: new Map(), latestResponses: new Map(),
      calls: new Set(), working: new Set(), id: ++this.serial, opening,
    };
    c.started = new Promise(resolve => { c.resolveStarted = resolve; });
    this.connection = c;
    this.audio.muted = false;
    this.onPlayback(false);
    this.setState('permission');
    c.startupTimer = this.later(c, () => this.fail(c, 'Connection timed out. Check microphone permission and try again.'), 60000);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
        throw new Error('Voice chat needs a browser with microphone and WebRTC support, on HTTPS or localhost.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!this.isOpen(c)) {
        stream.getTracks().forEach(track => track.stop());
        return false;
      }
      c.stream = stream;
      const tracks = stream.getAudioTracks();
      if (!tracks.length) throw new Error('No microphone was found.');
      tracks.forEach(track => {
        // Keep capture warm during negotiation; disabling it can release the device.
        track.enabled = !this.muted;
        this.listen(c, track, 'ended', () => {
          if (!c.closing) this.fail(c, 'The microphone stopped. Reconnect to use it again.');
        });
        this.listen(c, track, 'mute', () => {
          if (c.ready && !c.closing) this.onError('The browser paused microphone input. Keep this page open; reconnect if it does not resume.');
        });
        this.listen(c, track, 'unmute', () => this.activate(c));
      });
      this.setState('connecting');
      c.peer = new RTCPeerConnection();
      c.remote = new MediaStream();
      this.listen(c, c.peer, 'track', event => {
        c.remote.addTrack(event.track);
        this.listen(c, event.track, 'ended', () => {
          if (!c.closing) this.fail(c, 'Assistant audio stopped. Reconnect to continue.');
        });
        if (c.closing) return;
        this.audio.srcObject = c.remote;
        void this.resumePlayback(c);
      });
      this.listen(c, c.peer, 'connectionstatechange', () => this.checkHealth());
      tracks.forEach(track => c.peer.addTrack(track, stream));
      c.channel = c.peer.createDataChannel('oai-events');
      this.listen(c, c.channel, 'message', event => {
        try {
          this.receive(c, JSON.parse(event.data));
        } catch (error) {
          this.fail(c, `Could not process a session event: ${error.message}`);
        }
      });
      this.listen(c, c.channel, 'error', () => {
        if (!c.closing) this.fail(c, 'The event connection failed. Reconnect to continue.');
      });
      this.listen(c, c.channel, 'close', () => {
        if (c.closing) this.finish(c);
        else this.fail(c, 'The connection closed. Reconnect to continue with recent text.');
      });
      const offer = await c.peer.createOffer();
      if (!this.isOpen(c)) return false;
      await c.peer.setLocalDescription(offer);
      if (!this.isOpen(c)) return false;
      await this.gatherIce(c);
      if (!this.isOpen(c)) return false;
      const sdp = c.peer.localDescription?.sdp;
      if (!sdp) throw new Error('The browser could not create a connection offer.');
      const timeout = this.later(c, () => this.fail(c, 'The server took too long to connect. Please try again.'), 25000);
      const response = await fetch('/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...c.config, sdp, history: recentHistory(history) }),
        signal: c.controller.signal,
      });
      if (!this.isOpen(c)) return false;
      let result;
      try { result = await response.json(); } catch {
        throw new Error(`The server returned an unreadable response (${response.status}).`);
      }
      this.cancelTimer(c, timeout);
      if (!this.isOpen(c)) return false;
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : `Connection failed (${response.status}).`);
      if (!result.session?.id || result.transport?.type !== 'webrtc' || typeof result.transport.sdp !== 'string' || !result.transport.sdp) {
        throw new Error('The server returned an invalid session answer.');
      }
      c.sessionId = result.session.id;
      c.readyTimer = this.later(c, () => this.fail(c, c.sessionStarted
        ? 'The microphone did not become ready. Reconnect to try again.'
        : 'The voice session did not become ready. Reconnect to try again.'), 20000);
      await c.peer.setRemoteDescription({ type: 'answer', sdp: result.transport.sdp });
      if (!this.isOpen(c)) return false;
      return await c.started;
    } catch (error) {
      if (this.isOpen(c)) {
        const message = error.name === 'NotAllowedError'
          ? 'Microphone access was not allowed. Enable it in your browser’s site settings and try again.'
          : error.name === 'NotFoundError' ? 'No microphone was found. Connect one and try again.'
            : error.message || 'Could not connect.';
        this.fail(c, message);
      }
      return false;
    }
  }

  gatherIce(c) {
    if (c.peer.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = error => {
        this.cancelTimer(c, timer);
        c.peer.removeEventListener('icegatheringstatechange', changed);
        c.controller.signal.removeEventListener('abort', aborted);
        error ? reject(error) : resolve();
      };
      const changed = () => { if (c.peer.iceGatheringState === 'complete') finish(); };
      const aborted = () => finish(new Error('Connection cancelled.'));
      const timer = this.later(c, () => finish(new Error('Network setup timed out. Try another connection.')), 10000);
      c.peer.addEventListener('icegatheringstatechange', changed);
      c.controller.signal.addEventListener('abort', aborted, { once: true });
      changed();
    });
  }

  send(c, event) {
    if (!this.isOpen(c) || !c.sessionStarted || c.channel?.readyState !== 'open') throw new Error('The voice connection is not ready.');
    c.channel.send(JSON.stringify({ event_id: `client_${c.id}_${++this.serial}`, ...event }));
  }

  activate(c) {
    if (!this.isOpen(c) || !c.sessionStarted || !c.warmedUp || c.disconnectTimer || c.ready) return;
    const tracks = c.stream.getAudioTracks();
    if (tracks.some(track => track.readyState !== 'live')) {
      this.fail(c, 'The microphone stopped. Reconnect to use it again.');
      return;
    }
    if (!this.muted && tracks.some(track => track.muted)) return;
    try {
      c.ready = true;
      this.cancelTimer(c, c.startupTimer);
      this.cancelTimer(c, c.readyTimer);
      this.setState('active');
      if (this.muted) this.setMuted(true);
      if (c.opening && c.config.mode !== 'general') {
        const settings = c.config.settings || {};
        const startInterview = c.config.mode === 'interview' && Boolean(settings.role?.trim());
        let question;
        if (c.config.mode === 'tutor') {
          const language = settings.language?.trim();
          const supportLanguage = settings.supportLanguage?.trim();
          const setupLanguage = supportLanguage && (!settings.level || settings.level.toLowerCase() === 'beginner')
            ? supportLanguage : language || supportLanguage;
          question = language
            ? `The learner already selected ${JSON.stringify(language)} as the target language. Do not ask which language they want. Ask one short question about their practice goal or preferred topic today.`
            : 'Ask one short question: which language would they like to practice?';
          if (setupLanguage) question += ` Ask this setup question in ${JSON.stringify(setupLanguage)}.`;
        } else {
          question = settings.role?.trim()
            ? `The selected role is ${JSON.stringify(settings.role.trim())}. The application is requesting the first question from the backend. Wait for it, then ask that question once. Do not make a second opening request or ask which role. Follow the configured practice or simulation style.`
            : 'Ask one short question: which role would they like to practice interviewing for?';
        }
        this.send(c, {
          type: 'session.instructions.append', delegation_id: null,
          content: `For this opening turn only, before the user has spoken, begin directly with the question without a greeting, praise, thanks, or an acknowledgment such as "Great", "Sure", or "Perfect". ${question} Then pause and listen. Respond naturally to the user on later turns.`,
        });
        if (startInterview) {
          // An opening question must not depend on a prior spoken turn triggering delegation.
          this.send(c, {
            type: 'response.item.create',
            item: { type: 'message', role: 'user', content: [
              { type: 'input_text', text: 'Start my interview with one question for the selected role. Show the question before asking it.' },
            ] },
          });
          this.send(c, { type: 'response.create' });
        }
      }
      c.resolveStarted(true);
    } catch (error) {
      this.fail(c, `Could not start the voice session: ${error.message}`);
    }
  }

  receive(c, event) {
    if (!event || typeof event.type !== 'string') throw new Error('Invalid event format.');
    if (event.type === 'session.closed') {
      const reason = typeof event.reason === 'string' ? event.reason : null;
      if (c.closing || reason === 'close_requested') {
        this.finish(c, event.usage ?? null, true, reason);
        return;
      }
      const messages = {
        expired: 'This conversation reached its time limit. Continue when you are ready.',
        content: 'The service ended this conversation. Start a new conversation when you are ready.',
        remote_hangup: 'The conversation ended on the service. Continue when you are ready.',
        connection_lost: 'The connection was lost. Reconnect to continue with recent text.',
      };
      this.onError(messages[reason] || 'The conversation ended unexpectedly. Continue when you are ready.');
      this.onClosed({ usage: event.usage ?? null, sessionId: c.sessionId, confirmed: true, reason });
      this.cleanup(c, reason === 'connection_lost' || !reason ? 'error' : 'ended');
      return;
    }
    if (c.closing) return;
    if (event.type === 'session.started') {
      if (!c.sessionStarted) {
        c.sessionStarted = true;
        // Keep audio flowing while the service settles; immediate speech was lost on iPhone.
        this.later(c, () => {
          c.warmedUp = true;
          this.activate(c);
        }, 3000);
      }
    } else if (event.type === 'session.input_transcript.delta' || event.type === 'session.output_transcript.delta') {
      if (c.sessionStarted) this.onTranscript(event);
    } else if (event.type === 'session.delegation.created') {
      c.working.add(event.delegation?.id || event.delegation_id || 'delegation');
      this.onWorking(true);
    } else if (event.type === 'response.event') {
      this.responseEvent(c, event);
    } else if (event.type === 'session.error') {
      this.fail(c, event.error?.message || event.message || 'The voice session failed.');
    } else if (event.type === 'error') {
      const message = event.error?.message || event.message || 'The service rejected a command.';
      c.working.clear();
      this.onWorking(false);
      if (!c.sessionStarted) this.fail(c, message);
      else {
        if (c.pendingMute && event.error?.client_event_id === c.pendingMute.id) {
          this.cancelTimer(c, c.pendingMute.timer);
          if (!c.pendingMute.muted) {
            this.muted = true;
            c.stream.getAudioTracks().forEach(track => { track.enabled = false; });
            this.onMute(true);
          }
          c.pendingMute = null;
        }
        this.onError(message);
      }
    } else if (event.type === 'session.input_audio.muted' || event.type === 'session.input_audio.unmuted') {
      if (event.client_event_id === c.pendingMute?.id) {
        this.cancelTimer(c, c.pendingMute.timer);
        c.pendingMute = null;
      }
    }
  }

  responseEvent(c, envelope) {
    const event = envelope.event;
    if (!event || typeof event.type !== 'string') throw new Error('Invalid delegated response event.');
    const delegation = envelope.delegation_id || 'delegation';
    const id = event.response?.id || event.response_id || c.latestResponses.get(delegation) || delegation;
    if (event.type === 'response.created') c.latestResponses.set(delegation, id);
    let response = c.responses.get(id);
    if (!response) {
      response = { calls: new Set(), returned: new Set(), completed: false, continued: false, failed: false };
      c.responses.set(id, response);
    }
    if (event.type === 'response.created' || event.type === 'response.in_progress') {
      c.working.add(delegation);
      this.onWorking(true);
    }
    if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
      const item = event.item;
      if (typeof item.call_id !== 'string' || !item.call_id) throw new Error('A tool call is missing its call ID.');
      if (c.calls.has(item.call_id)) return;
      c.calls.add(item.call_id);
      response.calls.add(item.call_id);
      const result = runDisplayTool(item, c.config.mode, this.onCard, this.onQuestion);
      this.send(c, { type: 'response.item.create', item: {
        type: 'function_call_output', call_id: item.call_id, output: JSON.stringify(result),
      } });
      response.returned.add(item.call_id);
      if (!result.shown) this.onError(result.error);
    }
    if (event.type === 'response.completed') {
      if (response.completed) return;
      response.completed = true;
    }
    if (['response.failed', 'response.incomplete', 'response.cancelled', 'error'].includes(event.type)) {
      response.failed = true;
      c.working.delete(delegation);
      this.onError(event.response?.error?.message || event.error?.message || event.message || 'The assistant’s background task did not finish. You can ask again.');
    }
    if (response.completed || response.failed) {
      c.working.delete(delegation);
      if (!response.failed && response.calls.size && response.calls.size === response.returned.size && !response.continued) {
        response.continued = true;
        this.send(c, { type: 'response.create' });
        c.working.add(delegation);
      }
      this.onWorking(c.working.size > 0);
    }
    if (c.responses.size > 200) {
      for (const [key, entry] of c.responses) {
        if (key !== id && (entry.completed || entry.failed)) c.responses.delete(key);
        if (c.responses.size <= 160) break;
      }
    }
  }

  repeatPhrase(value) {
    const c = this.connection;
    if (!c || !this.isOpen(c) || !c.ready || c.config.mode !== 'tutor') {
      this.onError('Start or continue a language tutor conversation to hear the phrase.');
      return false;
    }
    const { card, error } = validateLearningCard(value);
    if (error) { this.onError(error); return false; }
    try {
      this.send(c, {
        type: 'session.instructions.append', delegation_id: null,
        content: `Repeat only this practice phrase in ${JSON.stringify(card.language)}, once and slowly: ${JSON.stringify(card.term)}. Do not translate, add another phrase, or advance the exercise. Then listen.`,
      });
      return true;
    } catch (error) {
      this.onError(`Could not repeat the phrase: ${error.message}`);
      return false;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    const c = this.connection;
    c?.stream?.getAudioTracks().forEach(track => { track.enabled = !muted && c.ready && !c.closing; });
    this.onMute(muted);
    if (!c?.ready || c.closing) return;
    try {
      if (c.pendingMute) this.cancelTimer(c, c.pendingMute.timer);
      const id = `mic_${c.id}_${++this.serial}`;
      const timer = this.later(c, () => {
        c.pendingMute = null;
        this.onError('The microphone changed locally, but the service has not confirmed it. Reconnect if it cannot hear you.');
      }, 8000);
      c.pendingMute = { id, muted, timer };
      this.send(c, { type: muted ? 'session.input_audio.mute' : 'session.input_audio.unmute', event_id: id });
    } catch (error) { this.fail(c, error.message); }
  }

  async resumePlayback(c = this.connection) {
    if (!c || !this.isOpen(c) || !this.audio.srcObject) return;
    try {
      await this.audio.play();
      if (this.isOpen(c)) this.onPlayback(false);
    } catch (error) {
      if (this.isOpen(c)) {
        this.onPlayback(true);
        if (error.name !== 'NotAllowedError' && error.name !== 'AbortError') this.onError(`Audio playback failed: ${error.message}`);
      }
    }
  }

  checkHealth(online = navigator.onLine !== false) {
    const c = this.connection;
    if (!c || c.closing || !c.peer) return;
    if (c.stream?.getAudioTracks().some(track => track.readyState === 'ended')) {
      this.fail(c, 'The microphone stopped while this page was away. Reconnect to continue.');
      return;
    }
    if (c.ready && c.stream?.getAudioTracks().some(track => track.muted)) {
      this.fail(c, 'The browser is not providing microphone audio. Reconnect to restore the microphone.');
      return;
    }
    const state = c.peer.connectionState;
    if (state === 'failed' || state === 'closed') {
      this.fail(c, 'The voice connection was lost. Reconnect to continue with recent text.');
    } else if (!online || state === 'disconnected') {
      if (c.disconnectTimer) return;
      this.setState('disconnected');
      c.disconnectTimer = this.later(c, () => this.fail(c, 'The connection was interrupted. Reconnect when you are ready.'), 5000);
    } else if (state === 'connected') {
      this.cancelTimer(c, c.disconnectTimer);
      c.disconnectTimer = null;
      if (c.ready && c.channel.readyState === 'open') this.setState('active');
      else if (!c.ready) {
        this.setState('connecting');
        this.activate(c);
      }
    }
  }

  stop({ immediate = false } = {}) {
    const c = this.connection;
    if (!c) return Promise.resolve();
    if (c.closing) {
      if (immediate) this.finish(c);
      return c.closed;
    }
    c.closing = true;
    c.closed = new Promise(resolve => { c.resolveClosed = resolve; });
    c.timers.forEach(timer => clearTimeout(timer));
    c.timers.clear();
    c.pendingMute = null;
    c.stream?.getTracks().forEach(track => { track.enabled = false; track.stop(); });
    this.audio.pause();
    this.onWorking(false);
    this.setState('closing');
    if (c.sessionStarted && c.channel?.readyState === 'open') {
      try { c.channel.send(JSON.stringify({ type: 'session.close' })); } catch {
        this.finish(c);
        return c.closed;
      }
      if (!immediate) {
        this.later(c, () => this.finish(c), 5000);
        return c.closed;
      }
    }
    if (c.sessionStarted) this.finish(c);
    else this.cleanup(c, 'ended');
    return c.closed;
  }

  finish(c, usage = null, confirmed = false, reason = null) {
    if (!this.isCurrent(c)) return;
    this.onClosed({ usage, sessionId: c.sessionId, confirmed, reason });
    this.cleanup(c, 'ended');
  }

  fail(c, message) {
    if (!this.isCurrent(c)) return;
    this.onError(message);
    if (c.sessionStarted && !c.closing && c.channel?.readyState === 'open') {
      try { c.channel.send(JSON.stringify({ type: 'session.close' })); }
      catch (error) { this.onError(`${message} Session close could not be confirmed: ${error.message}`); }
    }
    this.cleanup(c, c.closing ? 'ended' : 'error');
  }

  cleanup(c, state) {
    if (!this.isCurrent(c)) return;
    this.connection = null;
    c.listeners.forEach(remove => remove());
    c.controller.abort();
    c.timers.forEach(timer => clearTimeout(timer));
    c.timers.clear();
    const tracks = new Set([
      ...(c.stream?.getTracks() || []), ...(c.remote?.getTracks() || []),
      ...(c.peer?.getReceivers().map(receiver => receiver.track).filter(Boolean) || []),
    ]);
    tracks.forEach(track => { track.enabled = false; track.stop(); });
    c.channel?.close();
    c.peer?.close();
    this.audio.pause();
    this.audio.srcObject = null;
    this.audio.muted = false;
    c.responses.clear();
    c.latestResponses.clear();
    c.calls.clear();
    c.working.clear();
    this.onWorking(false);
    this.onPlayback(false);
    c.resolveStarted(false);
    c.resolveClosed?.();
    this.setState(state);
  }
}
