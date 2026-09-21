import { Conversation, recentHistory, languageTag, validateLearningCard, validateInterviewQuestion } from './conversation.js';
import { ConversationStore, storageKey } from './conversation-store.js';
import { TranscriptFollower } from './transcript-scroll.js';
import { LiveSession } from './live-session.js';

const $ = id => document.getElementById(id);
const storageRetentionMs = 30 * 24 * 60 * 60 * 1000;
const voices = new Set([
  'marin', 'quartz', 'ripple', 'vesper', 'willow', 'stone', 'gleam',
  'meridian', 'bossa', 'tempo', 'beacon', 'delta', 'cinder',
]);
const store = new ConversationStore();
const follower = new TranscriptFollower({
  feed: $('transcript'), controls: document.querySelector('.controls'), button: $('latest'),
});
let mode = 'general';
let config = null;
let conversation = new Conversation();
let cards = [];
let interviewQuestion = '';
let focusVisible = false;
let hasStarted = false;
let resetting = false;
let storageFailed = false;
let restoreFailed = false;
let storageConflict = false;
let historyDirty = false;
let assistantWorking = false;
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
    if (state === 'active') followTranscript();
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
  onQuestion(question) {
    interviewQuestion = question;
    renderControls();
    scheduleSave();
  },
  onError: showNotice,
  onWorking(working) {
    assistantWorking = working;
    renderControls();
  },
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
  return { mode, voice: $('voice').value, settings, instructions: $('instructions').value.trim() };
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
  $('voice').value = voices.has(value.voice) ? value.voice : 'marin';
  $('instructions').value = typeof value.instructions === 'string' ? value.instructions.slice(0, 4000) : '';
  return readConfig();
}

function canContinue() {
  return Boolean(config && conversation.messages.length &&
    JSON.stringify(readConfig()) === JSON.stringify(config));
}

function setFocusText(id, text) {
  if ($(id).textContent !== text) $(id).textContent = text;
}

function renderFocus() {
  const card = mode === 'tutor' && config?.mode === mode ? cards.at(-1) : null;
  const question = mode === 'interview' && config?.mode === mode ? interviewQuestion : '';
  const wasVisible = focusVisible;
  focusVisible = Boolean(card || question);
  document.body.dataset.focus = String(focusVisible);
  document.body.dataset.focusKind = focusVisible ? mode : '';
  $('focus-panel').hidden = !focusVisible;
  $('transcript-summary').hidden = !focusVisible;
  if (focusVisible && !wasVisible) {
    $('transcript-panel').open = !follower.following;
    follower.changed(false);
  } else if (!focusVisible) {
    $('transcript-panel').open = true;
  }
  const active = live.state === 'active';
  const practice = active && !live.muted;
  setFocusText('focus-label', card ? (practice ? 'Say this' : 'Practice phrase') : active ? 'Current question' : 'Previous question');
  setFocusText('focus-context', card ? (card.context || card.language)
    : question ? (config.settings.interviewStyle === 'simulation' ? 'Interview simulation' : 'Interview practice') : '');
  setFocusText('focus-title', card?.term || question);
  $('focus-title').lang = card ? languageTag(card.language) : '';
  setFocusText('focus-reading', card?.reading || '');
  setFocusText('focus-meaning', card?.meaning || '');
  $('focus-reading').hidden = !card?.reading;
  $('focus-meaning').hidden = !card?.meaning;
  $('focus-meaning').lang = languageTag(config?.settings?.supportLanguage || '');
  $('repeat-phrase').hidden = !card;
  $('repeat-phrase').disabled = !active;
  $('repeat-phrase').title = active ? '' : 'Start or continue the tutor to hear this phrase.';
}

function followTranscript() {
  follower.changed(Boolean(live.connection && !live.connection.closing && $('transcript-panel').open));
}

function renderControls() {
  const state = live.state;
  const busy = Boolean(live.connection);
  const ready = busy && ['active', 'disconnected'].includes(state);
  const settling = state === 'permission' || state === 'connecting';
  const settingsLocked = busy && state !== 'closing';
  const hasContent = conversation.messages.length > 0 || cards.length > 0 || Boolean(interviewQuestion);
  const resumable = canContinue();
  const reconnect = state === 'error' && resumable;
  const continuation = !busy && resumable && !reconnect;
  document.body.dataset.state = state;
  document.body.dataset.listening = String(state === 'active' && !live.muted);
  document.body.dataset.sessionLocked = String(settingsLocked);
  document.body.dataset.launch = String(!hasContent && (!busy || settling));
  document.body.dataset.choice = String(continuation || reconnect);
  const statuses = {
    idle: hasContent ? 'Ready for a new conversation' : 'Ready when you are',
    permission: 'Allow microphone access…', connecting: 'Connecting…',
    active: live.muted ? 'Mic muted' : 'Listening',
    disconnected: 'Connection interrupted…', closing: 'Finishing…',
    ended: 'Ready for a new conversation', error: 'Connection needs attention',
  };
  $('status-text').textContent = statuses[state] || 'Ready when you are';
  $('session-status').hidden = !ready && state !== 'error';
  $('working').hidden = !assistantWorking || state !== 'active';
  $('welcome').hidden = hasContent || ready;
  const descriptions = {
    general: 'Talk about anything.',
    tutor: 'Practice a language at your pace.',
    interview: 'Practice your next interview.',
  };
  $('welcome-description').textContent = descriptions[mode];
  $('welcome-description').hidden = busy;
  renderFocus();
  $('conversation-heading').hidden = busy || !hasContent || focusVisible;
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
  $('end-label').textContent = ready ? 'End' : 'Cancel';
  $('end').setAttribute('aria-label', ready ? 'End conversation' : 'Cancel connection');
  $('mute').hidden = !ready;
  $('mute').disabled = state !== 'active';
  $('mute').setAttribute('aria-pressed', String(live.muted));
  $('settings').disabled = settingsLocked || resetting;
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.disabled = settingsLocked || resetting;
    button.title = settingsLocked ? 'End the conversation to change mode.' : '';
  });
  const settingsTitles = { general: 'Conversation settings', tutor: 'Language tutor settings', interview: 'Interview settings' };
  $('settings-title').textContent = settingsTitles[mode];
  $('settings-summary').textContent = mode === 'tutor'
    ? ($('language').value.trim() || 'Language & level')
    : mode === 'interview' ? ($('role').value.trim() || 'Role & interview style') : 'Voice & instructions';
  $('open-settings').disabled = resetting;
  $('open-settings').setAttribute('aria-label', settingsTitles[mode]);
  $('settings-lock-note').hidden = !settingsLocked;
  $('conversation-actions').hidden = !hasContent && !restoreFailed;
  $('delete').disabled = resetting || state === 'closing';
  $('export').disabled = !hasContent;
  $('control-note').textContent = navigator.onLine === false ? 'You’re offline. Reconnect when your network returns.' : '';
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
  followTranscript();
}

function savedSnapshot() {
  const history = recentHistory(conversation.messages);
  const offset = conversation.messages.length - history.length;
  return {
    config, history, hasStarted, savedAt: Date.now(),
    ...(interviewQuestion ? { interviewQuestion } : {}),
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
    const savedAt = Number(saved.savedAt);
    if (Number.isFinite(savedAt) && savedAt > 0 && Date.now() - savedAt >= storageRetentionMs) {
      void persist('clear');
      return;
    }
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
    if (saved.interviewQuestion !== undefined) {
      const { question, error } = validateInterviewQuestion({ question: saved.interviewQuestion });
      if (error) throw new Error('Saved interview question is invalid.');
      interviewQuestion = question;
    }
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
  interviewQuestion = '';
  cardNodes = new WeakMap();
  storageConflict = storageFailed = false;
  live.setMuted(false);
  follower.reset();
  $('conversation-actions').open = false;
}

function start(resume = false) {
  if (live.connection || resetting) return;
  if (resume && !canContinue()) return;
  if ($('settings-dialog').open) $('settings-dialog').close();
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
  saveTimer = null;
  historyDirty = false;
  const deleted = await persist('clear');
  if (deleted) resetConversation();
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
$('open-settings').addEventListener('click', () => {
  if (!$('settings-dialog').open) $('settings-dialog').showModal();
});
$('close-settings').addEventListener('click', () => $('settings-dialog').close());
$('settings-dialog').addEventListener('close', () => $('open-settings').focus());
$('start').addEventListener('click', () => { void start(live.state === 'error' && canContinue()); });
$('continue').addEventListener('click', () => { void start(true); });
$('fresh').addEventListener('click', () => { void start(); });
$('end').addEventListener('click', () => { void live.stop().then(flushSave); });
$('delete').addEventListener('click', () => { void deleteConversation(); });
$('mute').addEventListener('click', () => live.setMuted(!live.muted));
$('repeat-phrase').addEventListener('click', () => {
  const card = cards.at(-1);
  if (mode === 'tutor' && config?.mode === mode && card) live.repeatPhrase(card);
});
$('transcript-panel').addEventListener('toggle', () => {
  followTranscript();
  if (!$('transcript-panel').open) $('latest').hidden = true;
});
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
  const exported = new Date();
  const displayTime = new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(exported);
  const pad = value => String(value).padStart(2, '0');
  const filenameTime = [
    exported.getFullYear(), pad(exported.getMonth() + 1), pad(exported.getDate()),
  ].join('-') + `_${pad(exported.getHours())}-${pad(exported.getMinutes())}`;
  const sections = ['# Voice conversation', `**Exported:** ${displayTime}`];
  const transcript = conversation.messages
    .map(message => `## ${message.role === 'user' ? 'You' : 'Assistant'}\n\n${message.text}`)
    .join('\n\n');
  if (transcript) sections.push(transcript);
  if (interviewQuestion) sections.push(`## Current interview question\n\n${interviewQuestion}`);
  const learning = cards.map(card => {
    const details = [`- **Language:** ${card.language}`];
    if (card.reading) details.push(`- **Reading:** ${card.reading}`);
    if (card.meaning) details.push(`- **Meaning:** ${card.meaning}`);
    return `### ${card.term}\n\n${details.join('\n')}`;
  }).join('\n\n');
  if (learning) sections.push(`## Words to keep\n\n${learning}`);
  const blob = new Blob([`${sections.join('\n\n')}\n`], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `voice-conversation-${filenameTime}.md`;
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
    followTranscript();
  }).observe(controls);
}

restore();
renderTranscript();
