export function recentHistory(messages) {
  const selected = [];
  const encoder = new TextEncoder();
  let remaining = 7600;
  for (let i = messages.length - 1; i >= 0 && selected.length < 24 && remaining > 0; i--) {
    const message = messages[i];
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.text !== 'string') continue;
    let text = message.text.trim();
    if (!text) continue;
    const bytes = encoder.encode(text);
    const clipped = bytes.length > remaining;
    if (clipped) {
      if (selected.length) break;
      let start = bytes.length - remaining;
      while ((bytes[start] & 0xc0) === 0x80) start++;
      text = new TextDecoder().decode(bytes.subarray(start));
    }
    if (text) selected.unshift({ role: message.role, text });
    remaining -= encoder.encode(text).length;
    if (clipped) break;
  }
  return selected;
}

export class Conversation {
  constructor(history = []) {
    this.nextId = 0;
    this.messages = recentHistory(history).map(message => ({ ...message, id: ++this.nextId, fragments: [] }));
    this.beginTransport();
  }

  beginTransport() {
    this.transport = (this.transport || 0) + 1;
    this.seen = new Set();
  }

  append(event) {
    const role = event.type === 'session.input_transcript.delta' ? 'user'
      : event.type === 'session.output_transcript.delta' ? 'assistant' : null;
    if (!role || typeof event.delta !== 'string' || !event.delta) return null;
    const start = Number.isFinite(event.start_ms) ? event.start_ms : null;
    const end = Number.isFinite(event.end_ms) ? event.end_ms : start;
    const key = event.event_id || (start !== null ? JSON.stringify([role, start, end, event.delta]) : null);
    if (key && this.seen.has(key)) return null;
    if (key) this.seen.add(key);
    if (this.seen.size > 3000) this.seen.delete(this.seen.values().next().value);

    let message;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const candidate = this.messages[i];
      if (candidate.transport !== this.transport || candidate.role !== role) continue;
      if (start === null) {
        if (i === this.messages.length - 1) message = candidate;
        break;
      }
      if (candidate.start === null || start > candidate.end + 1400 || end < candidate.start - 1400) continue;
      const switched = this.messages.slice(i + 1).some(other =>
        other.transport === this.transport && other.role !== role &&
        other.start !== null && other.end > candidate.end && other.end <= start &&
        !(role === 'user' && other.end - other.start <= 900 && other.text.length <= 40 &&
          !/[.!?。！？]["'”’»）)]*\s*$/u.test(candidate.text)));
      if (!switched) message = candidate;
      if (message) break;
    }
    if (!message) {
      message = { id: ++this.nextId, role, text: '', fragments: [], start, end, transport: this.transport };
      this.messages.push(message);
    }
    message.fragments.push({ delta: event.delta, start_ms: start, end_ms: end });
    message.fragments.sort((a, b) => (a.start_ms ?? Infinity) - (b.start_ms ?? Infinity));
    // Live deltas include their own spacing; adding spaces corrupts native scripts and split words.
    message.text = message.fragments.map(fragment => fragment.delta).join('');
    if (start !== null) {
      message.start = message.start === null ? start : Math.min(message.start, start);
      message.end = Math.max(message.end ?? end, end);
      const index = this.messages.indexOf(message);
      const position = this.messages.findIndex(existing => existing.transport === this.transport &&
        existing.start !== null &&
        (existing.start > message.start || (existing.start === message.start && role === 'user' && existing.role === 'assistant')));
      if (position !== -1 && position < index) {
        this.messages.splice(index, 1);
        this.messages.splice(position, 0, message);
      }
    }
    while (this.messages.length > 160 || (this.messages.length > 1 && this.messages.reduce((sum, item) => sum + item.text.length, 0) > 64000)) {
      this.messages.shift();
    }
    return message;
  }
}

const languageTags = {
  chinese: 'zh', mandarin: 'zh', 'mandarin chinese': 'zh', '中文': 'zh', '普通话': 'zh',
  spanish: 'es', 'español': 'es', english: 'en', french: 'fr', 'français': 'fr',
  japanese: 'ja', '日本語': 'ja', korean: 'ko', '한국어': 'ko', arabic: 'ar', 'العربية': 'ar',
  german: 'de', 'deutsch': 'de', portuguese: 'pt', 'português': 'pt', hindi: 'hi',
  italian: 'it', russian: 'ru', ukrainian: 'uk', vietnamese: 'vi', thai: 'th',
  turkish: 'tr', dutch: 'nl', polish: 'pl', indonesian: 'id', hebrew: 'he',
};

export function languageTag(language) {
  const text = language.trim();
  if (languageTags[text.toLowerCase()]) return languageTags[text.toLowerCase()];
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(text)) return '';
  try { return Intl.getCanonicalLocales(text)[0] || ''; } catch { return ''; }
}

export function validateLearningCard(value, { requirePurpose = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'Card must be an object.' };
  const purpose = value.purpose ?? (requirePurpose ? null : 'practice');
  if (!['practice', 'question'].includes(purpose)) return { error: 'Invalid card purpose.' };
  const card = { purpose };
  for (const [key, max] of Object.entries({ language: 80, term: 200, reading: 200, meaning: 400 })) {
    if (typeof value[key] !== 'string' || value[key].length > max) return { error: `Invalid ${key}: expected text up to ${max} characters.` };
    card[key] = value[key].trim();
  }
  if (!card.language || !card.term) return { error: 'Language and term must not be empty.' };
  if (value.context !== undefined) {
    if (typeof value.context !== 'string' || value.context.length > 80) return { error: 'Invalid practice context.' };
    card.context = value.context.trim();
  }
  return { card };
}

export function validateInterviewQuestion(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.question !== 'string' || !value.question.trim() || value.question.length > 600) {
    return { error: 'Expected an interview question of at most 600 characters.' };
  }
  return { question: value.question.trim() };
}

export function runDisplayTool(item, mode, render, renderQuestion) {
  const isQuestion = item.name === 'show_interview_question';
  if (!isQuestion && item.name !== 'show_learning_card') return { shown: false, error: 'Unknown display tool.' };
  if (mode !== (isQuestion ? 'interview' : 'tutor')) return { shown: false, error: 'This display tool is not available in the current mode.' };
  if (typeof item.arguments !== 'string' || item.arguments.length > 12000) return { shown: false, error: 'Invalid display arguments.' };
  let args;
  try { args = JSON.parse(item.arguments); } catch { return { shown: false, error: 'Display arguments are not valid JSON.' }; }
  const { card, question, error } = isQuestion
    ? validateInterviewQuestion(args) : validateLearningCard(args, { requirePurpose: true });
  if (error) return { shown: false, error };
  try {
    if (isQuestion) renderQuestion(question);
    else render(card);
    return { shown: true };
  } catch (error) {
    return { shown: false, error: `Could not display ${isQuestion ? 'question' : 'card'}: ${error.message || 'render failed'}` };
  }
}
