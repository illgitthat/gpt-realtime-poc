import { Conversation, recentHistory, languageTag, validateLearningCard } from './conversation.js';
import { ConversationStore } from './conversation-store.js';
import { TranscriptFollower } from './transcript-scroll.js';
import { LiveSession } from './live-session.js';

const $ = id => document.getElementById(id);
const storageKey = 'voice-chat.recent.v1';
const store = new ConversationStore({
  key: storageKey, locks: navigator.locks,
  storage: {
    getItem: key => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: key => localStorage.removeItem(key),
  },
});
const follower = new TranscriptFollower({
  feed: $('transcript'), controls: document.querySelector('.controls'), button: $('latest'),
});
let mode = 'general';
let config = null;
let conversation = new Conversation();
let cards = [];
let hasStarted = false;
let resetting = false;
let storageFailed = false;
let restoreFailed = false;
let storageConflict = false;
let historyDirty = false;
let saveTimer;
let generation = 0;
let restoredCount = 0;
const conflictMessage = 'Saved history changed in another tab. This tab will not overwrite it. Reload to use the latest saved conversation.';
const messageNodes = new Map();
let cardNodes = new WeakMap();

function showNotice(message) {
  $('notice').textContent = message;
  $('notice').hidden = !message;
}

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

const live = new LiveSession({
  audio: $('remote-audio'),
  onState(state) {
    if (state === 'active' && !hasStarted) {
      hasStarted = true;
      scheduleSave();
    }
    renderControls();
    if (state === 'active') follower.changed(true);
    else if (['ended', 'error', 'closing'].includes(state)) follower.changed(false);
  },
  onTranscript(event) {
    if (!conversation.append(event)) return;
    renderTranscript();
    scheduleSave();
  },
  onCard(card) {
    cards.push({ ...card, afterId: conversation.messages.at(-1)?.id ?? null });
    cards = cards.slice(-6);
    renderTranscript();
    scheduleSave();
  },
  onError: showNotice,
  onWorking(working) { $('working').hidden = !working; },
  onPlayback(blocked) { $('resume-audio').hidden = !blocked; },
  onMute() { renderControls(); },
  onClosed({ confirmed }) {
    if (!confirmed) console.warn('Voice session ended without final usage confirmation.');
  },
});

function chooseMode(next) {
  mode = next;
  document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  $('tutor-settings').hidden = mode !== 'tutor';
  $('interview-settings').hidden = mode !== 'interview';
}

function readConfig() {
  const settings = mode === 'tutor'
    ? { language: $('language').value.trim(), supportLanguage: $('support-language').value.trim(), level: $('level').value }
    : mode === 'interview' ? { role: $('role').value.trim(), interviewStyle: $('interview-style').value } : {};
  return { mode, settings, instructions: $('instructions').value.trim() };
}

function applyConfig(value) {
  if (!value || !['general', 'tutor', 'interview'].includes(value.mode)) throw new Error('Saved conversation settings are invalid.');
  chooseMode(value.mode);
  const settings = value.settings || {};
  for (const [id, key, limit] of [['language', 'language', 80], ['support-language', 'supportLanguage', 80], ['role', 'role', 160]]) {
    $(id).value = typeof settings[key] === 'string' ? settings[key].slice(0, limit) : '';
  }
  $('level').value = ['Beginner', 'Intermediate', 'Advanced'].includes(settings.level) ? settings.level : '';
  $('interview-style').value = settings.interviewStyle === 'simulation' ? 'simulation' : 'practice';
  $('instructions').value = typeof value.instructions === 'string' ? value.instructions.slice(0, 4000) : '';
  return readConfig();
}

function canContinue() {
  return Boolean(config && conversation.messages.length &&
    JSON.stringify(readConfig()) === JSON.stringify(config));
}

function renderControls() {
  const state = live.state;
  const busy = Boolean(live.connection);
  const ready = busy && ['active', 'disconnected'].includes(state);
  const settling = state === 'permission' || state === 'connecting';
  const hasContent = conversation.messages.length > 0 || cards.length > 0;
  const resumable = canContinue();
  const reconnect = state === 'error' && resumable;
  const continuation = !busy && resumable && !reconnect;
  document.body.dataset.state = state;
  document.body.dataset.launch = String(!hasContent && (!busy || settling));
  document.body.dataset.choice = String(continuation || reconnect);
  const statuses = {
    idle: hasContent ? 'Ready for a new conversation' : 'Ready when you are',
    permission: 'Allow microphone access…', connecting: 'Connecting…',
    active: live.muted ? 'Microphone muted' : 'Listening — go ahead',
    disconnected: 'Connection interrupted…', closing: 'Finishing…',
    ended: 'Ready for a new conversation', error: 'Connection needs attention',
  };
  $('status-text').textContent = statuses[state] || 'Ready when you are';
  const titles = { general: 'What’s on your mind?', tutor: 'What would you like to practice?', interview: 'Ready to practice?' };
  $('welcome').querySelector('h1').textContent = ready ? (live.muted ? 'Microphone muted' : 'Listening…') : titles[mode];
  $('conversation-heading').hidden = busy || !hasContent;
  $('start').hidden = busy && !settling && state !== 'closing';
  $('start').disabled = resetting || busy || navigator.onLine === false;
  const startLabel = settling || state === 'closing' ? statuses[state]
    : reconnect ? 'Reconnect' : hasContent || hasStarted ? 'Start new conversation' : 'Start conversation';
  $('start-label').textContent = startLabel;
  $('start').setAttribute('aria-label', startLabel);
  $('start').setAttribute('aria-busy', String(settling || state === 'closing'));
  $('continue').hidden = !continuation;
  $('continue').disabled = resetting || navigator.onLine === false;
  $('fresh').hidden = !reconnect;
  $('fresh').disabled = resetting || navigator.onLine === false;
  $('end').hidden = !busy || state === 'closing';
  $('end').textContent = ready ? 'End' : 'Cancel';
  $('end').setAttribute('aria-label', ready ? 'End conversation' : 'Cancel connection');
  $('mute').hidden = !ready;
  $('mute').disabled = state !== 'active';
  $('mute').setAttribute('aria-pressed', String(live.muted));
  $('mute').textContent = live.muted ? 'Unmute mic' : 'Mute mic';
  $('stop-talking').hidden = !ready;
  $('stop-talking').disabled = state !== 'active';
  $('stop-talking').setAttribute('aria-pressed', String(live.outputMuted));
  $('stop-talking').textContent = live.outputMuted ? 'Unmute audio' : 'Mute audio';
  $('settings').disabled = (busy && state !== 'closing') || resetting;
  $('conversation-actions').hidden = !hasContent && !restoreFailed;
  $('delete').disabled = resetting || state === 'closing';
  $('export').disabled = !hasContent;
  $('control-note').textContent = navigator.onLine === false ? 'You’re offline. Reconnect when your network returns.'
    : state === 'connecting' ? 'Wait for “Listening” before speaking.'
      : live.outputMuted ? 'Assistant audio is muted. Tap Unmute audio to listen again.' : '';
  $('control-note').hidden = !$('control-note').textContent;
  $('context-note').hidden = state !== 'active' || !restoredCount;
  $('context-note').textContent = restoredCount ? `Recent context restored (${restoredCount} messages).` : '';
}

function renderCard(card) {
  let article = cardNodes.get(card);
  if (article) return article;
  article = textElement('article', 'learning-card', '');
  article.setAttribute('aria-label', 'Learning card');
  article.append(textElement('span', 'card-language', card.language));
  const term = textElement('p', 'card-term', card.term);
  const tag = languageTag(card.language);
  if (tag) term.lang = tag;
  term.dir = 'auto';
  article.append(term);
  if (card.reading) {
    const reading = textElement('p', 'card-reading', card.reading);
    reading.dir = 'auto';
    article.append(reading);
  }
  if (card.meaning) {
    const meaning = textElement('p', 'card-meaning', card.meaning);
    const supportTag = languageTag(config?.settings?.supportLanguage || '');
    if (supportTag) meaning.lang = supportTag;
    meaning.dir = 'auto';
    article.append(meaning);
  }
  cardNodes.set(card, article);
  return article;
}

function renderTranscript() {
  $('welcome').hidden = conversation.messages.length > 0 || cards.length > 0;
  const ids = new Set(conversation.messages.map(message => message.id));
  const rows = cards.filter(card => !ids.has(card.afterId)).map(renderCard);
  for (const message of conversation.messages) {
    let nodes = messageNodes.get(message.id);
    if (!nodes) {
      const row = textElement('article', `message message-${message.role}`, '');
      row.append(textElement('span', 'message-label', message.role === 'user' ? 'You' : 'Assistant'));
      const text = textElement('p', '', '');
      text.dir = 'auto';
      row.append(text);
      nodes = { row, text };
      messageNodes.set(message.id, nodes);
    }
    if (nodes.text.textContent !== message.text) nodes.text.textContent = message.text;
    rows.push(nodes.row, ...cards.filter(card => card.afterId === message.id).map(renderCard));
  }
  const wanted = new Set(rows);
  for (const child of [...$('transcript').children]) if (!wanted.has(child)) child.remove();
  rows.forEach((row, index) => {
    if ($('transcript').children[index] !== row) $('transcript').insertBefore(row, $('transcript').children[index] || null);
  });
  for (const id of messageNodes.keys()) if (!ids.has(id)) messageNodes.delete(id);
  renderControls();
  follower.changed(Boolean(live.connection && !live.connection.closing));
}

function savedSnapshot() {
  const history = recentHistory(conversation.messages);
  const offset = conversation.messages.length - history.length;
  return {
    config, history, hasStarted,
    cards: cards.map(({ afterId, ...card }) => ({
      ...card, after: Math.max(-1, conversation.messages.findIndex(message => message.id === afterId) - offset),
    })),
  };
}

function conflictNotice() {
  if (!storageConflict) showNotice(conflictMessage);
  storageConflict = true;
}

async function persist(action, value) {
  const current = generation;
  try {
    const changed = await store[action](value);
    if (current !== generation) return changed;
    if (!changed) conflictNotice();
    else {
      restoreFailed = false;
      if (action === 'claim') {
        store.observe();
        if (store.stale) { conflictNotice(); return false; }
        storageConflict = false;
        if ($('notice').textContent === conflictMessage) showNotice('');
        if (hasStarted || conversation.messages.length || cards.length) scheduleSave();
      }
    }
    return changed;
  } catch (error) {
    if (current === generation && !storageFailed) {
      showNotice(`Could not ${action === 'clear' ? 'delete' : 'save'} text on this device. ${error.message} You can still talk and export the text.`);
      storageFailed = true;
    }
    return false;
  }
}

function scheduleSave() {
  historyDirty = true;
  if (saveTimer || storageConflict) return;
  saveTimer = setTimeout(() => { saveTimer = null; void flushSave(); }, 500);
}

function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!historyDirty || !config || storageConflict) return Promise.resolve();
  historyDirty = false;
  return persist('save', savedSnapshot());
}

function restore() {
  try {
    const saved = store.read();
    if (!saved) return;
    if (!Array.isArray(saved.history)) throw new Error('Saved conversation text is invalid.');
    config = applyConfig(saved.config);
    conversation = new Conversation(saved.history);
    cards = Array.isArray(saved.cards) ? saved.cards.slice(-6).flatMap(value => {
      const { card } = validateLearningCard(value);
      if (!card) return [];
      const afterId = Number.isInteger(value.after)
        ? conversation.messages[value.after]?.id ?? null : conversation.messages.at(-1)?.id ?? null;
      return [{ ...card, afterId }];
    }) : [];
    hasStarted = saved.hasStarted === true;
  } catch (error) {
    config = null;
    restoreFailed = true;
    showNotice(`Could not restore the saved conversation. ${error.message} Choose Delete conversation to remove it.`);
  }
}

function resetConversation() {
  generation++;
  clearTimeout(saveTimer);
  saveTimer = null;
  historyDirty = false;
  config = null;
  hasStarted = false;
  restoredCount = 0;
  conversation = new Conversation();
  cards = [];
  cardNodes = new WeakMap();
  storageConflict = storageFailed = false;
  live.setMuted(false);
  follower.reset();
  $('conversation-actions').open = false;
}

function start(resume = false) {
  if (live.connection || resetting) return;
  if (resume && !canContinue()) return;
  showNotice('');
  if (!resume) {
    const selected = readConfig();
    resetConversation();
    config = selected;
    renderTranscript();
    void persist('claim', savedSnapshot());
  } else if (!config) return;
  const history = resume ? recentHistory(conversation.messages) : [];
  restoredCount = history.length;
  conversation.beginTransport();
  follower.reset();
  return live.start(config, history, { opening: !hasStarted && !history.length });
}

async function deleteConversation() {
  if (resetting) return;
  resetting = true;
  renderControls();
  await live.stop();
  clearTimeout(saveTimer);
  historyDirty = false;
  const deleted = await persist('clear');
  resetConversation();
  restoreFailed = !deleted;
  if (deleted) showNotice('');
  live.setState('idle');
  resetting = false;
  renderTranscript();
  $('start').focus();
}

function observeHistory() {
  try {
    if (!store.observe()) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    historyDirty = false;
    conflictNotice();
  } catch (error) {
    if (!storageFailed) showNotice(`Could not check saved history. ${error.message}`);
    storageFailed = true;
  }
}

document.querySelectorAll('[data-mode]').forEach(button => {
  button.addEventListener('click', () => {
    if ((!live.connection || live.state === 'closing') && !resetting) { chooseMode(button.dataset.mode); renderControls(); }
  });
});
$('settings').addEventListener('input', () => renderControls());
$('settings').addEventListener('change', () => renderControls());
$('start').addEventListener('click', () => { void start(live.state === 'error' && canContinue()); });
$('continue').addEventListener('click', () => { void start(true); });
$('fresh').addEventListener('click', () => { void start(); });
$('end').addEventListener('click', () => { void live.stop().then(flushSave); });
$('delete').addEventListener('click', () => { void deleteConversation(); });
$('mute').addEventListener('click', () => live.setMuted(!live.muted));
$('stop-talking').addEventListener('click', () => { live.setOutputMuted(!live.outputMuted); renderControls(); });
$('resume-audio').addEventListener('click', () => { void live.resumePlayback(); });
$('latest').addEventListener('click', () => follower.jump());
document.addEventListener('pointerdown', event => {
  if (!$('conversation-actions').contains(event.target)) $('conversation-actions').open = false;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('conversation-actions').open) {
    $('conversation-actions').open = false;
    $('conversation-actions').querySelector('summary').focus();
  }
});
$('export').addEventListener('click', () => {
  $('conversation-actions').open = false;
  const text = conversation.messages.map(message => `${message.role === 'user' ? 'You' : 'Assistant'}: ${message.text}`).join('\n\n');
  const learning = cards.map(card => `${card.language}: ${card.term}\n${card.reading}\n${card.meaning}`).join('\n\n');
  const blob = new Blob([text, learning ? `\n\nWords to keep\n\n${learning}` : ''], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'voice-conversation.txt';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('storage', event => { if (event.key === storageKey || event.key === null) observeHistory(); });
window.addEventListener('offline', () => { live.checkHealth(false); renderControls(); });
window.addEventListener('online', () => { live.checkHealth(true); renderControls(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') { void flushSave(); return; }
  observeHistory();
  live.checkHealth();
  if (live.connection) void live.resumePlayback();
  renderControls();
});
window.addEventListener('pagehide', () => {
  clearTimeout(saveTimer);
  saveTimer = null;
  follower.cancel();
  void live.stop({ immediate: true });
});
window.addEventListener('pageshow', () => { observeHistory(); renderControls(); });

if (typeof ResizeObserver !== 'undefined') {
  const controls = document.querySelector('.controls');
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--controls-height', `${controls.offsetHeight}px`);
    follower.changed(Boolean(live.connection));
  }).observe(controls);
}

restore();
renderTranscript();
