import test from 'node:test';
import assert from 'node:assert/strict';
import { Conversation, recentHistory, runDisplayTool } from '../public/conversation.js';

const fragment = (role, delta, start_ms, end_ms) => ({
  type: `session.${role === 'user' ? 'input' : 'output'}_transcript.delta`, delta, start_ms, end_ms,
});

test('captions preserve Spanish punctuation, split words, whitespace, and repeated words exactly', () => {
  const conversation = new Conversation();
  ['¡Ho', 'la!', ' ¿Cómo', ' estás?', ' Muy,', ' muy bien.'].forEach((text, i) =>
    conversation.append(fragment('assistant', text, i * 100, i * 100 + 100)));
  assert.equal(conversation.messages.length, 1);
  assert.equal(conversation.messages[0].text, '¡Hola! ¿Cómo estás? Muy, muy bien.');
});

test('Chinese, Arabic, and combining marks are not separated by invented spaces', () => {
  const conversation = new Conversation();
  conversation.append(fragment('assistant', '你好', 0, 100));
  conversation.append(fragment('assistant', '！今天', 100, 200));
  conversation.append(fragment('assistant', '怎么样？', 200, 300));
  assert.equal(conversation.messages[0].text, '你好！今天怎么样？');
  conversation.append(fragment('user', 'مر', 400, 500));
  conversation.append(fragment('user', 'حبًا', 500, 600));
  assert.equal(conversation.messages[1].text, 'مرحبًا');
});

test('overlapping speakers update stable independent rows, including late fragments', () => {
  const conversation = new Conversation();
  conversation.append(fragment('assistant', 'I can', 0, 500));
  conversation.append(fragment('user', 'Yes', 200, 300));
  const id = conversation.messages[0].id;
  conversation.append(fragment('assistant', ' help.', 500, 800));
  conversation.append(fragment('assistant', ' certainly', 450, 490));
  assert.equal(conversation.messages.length, 2);
  assert.equal(conversation.messages[0].id, id);
  assert.equal(conversation.messages[0].text, 'I can certainly help.');
  assert.equal(conversation.messages[1].text, 'Yes');
});

test('new rows use transcript start time, with the user first for simultaneous starts', () => {
  const conversation = new Conversation();
  conversation.append(fragment('assistant', 'Hey there!', 0, 700));
  const assistantId = conversation.messages[0].id;
  conversation.append(fragment('user', 'Hello', 0, 300));
  conversation.append(fragment('user', ', please help.', 300, 800));
  assert.deepEqual(conversation.messages.map(message => message.text), ['Hello, please help.', 'Hey there!']);
  assert.equal(conversation.messages[1].id, assistantId);
  conversation.append(fragment('assistant', ' Of course.', 700, 1100));
  assert.equal(conversation.messages[1].id, assistantId);
});

test('late fragments reorder existing captions and recovery history without changing message identity', () => {
  for (const [start, expected] of [
    [100, ['Hi there.', 'Hello.']],
    [200, ['Hello.', 'Hi there.']],
  ]) {
    const conversation = new Conversation([{ role: 'user', text: 'Previous session.' }]);
    const assistant = conversation.append(fragment('assistant', 'there.', 500, 600));
    conversation.append(fragment('user', 'Hello.', 200, 300));
    const updated = conversation.append(fragment('assistant', 'Hi ', start, 250));
    assert.equal(updated.id, assistant.id);
    assert.deepEqual(conversation.messages.map(message => message.text), ['Previous session.', ...expected]);
    assert.deepEqual(recentHistory(conversation.messages).map(message => message.text), ['Previous session.', ...expected]);
  }
});

test('speaker handoffs and long speech gaps start fresh rows without losing interrupted text', () => {
  const conversation = new Conversation();
  conversation.append(fragment('assistant', 'Let me explain.', 0, 500));
  conversation.append(fragment('user', 'Wait.', 600, 800));
  conversation.append(fragment('assistant', 'Of course.', 900, 1200));
  conversation.append(fragment('assistant', 'Anything else?', 4000, 4500));
  assert.deepEqual(conversation.messages.map(message => message.text), ['Let me explain.', 'Wait.', 'Of course.', 'Anything else?']);
});

test('a user interruption extending past assistant speech separates the subsequent assistant reply', () => {
  const conversation = new Conversation();
  conversation.append(fragment('assistant', 'Let’s use English.', 0, 2000));
  conversation.append(fragment('user', 'No, Spanish please.', 1500, 2500));
  conversation.append(fragment('assistant', 'Claro...', 2700, 3500));
  assert.deepEqual(conversation.messages.map(message => message.text), [
    'Let’s use English.', 'No, Spanish please.', 'Claro...',
  ]);
});

test('a brief assistant backchannel in a caption gap does not split an unfinished user question', () => {
  const conversation = new Conversation();
  conversation.append(fragment('user', ' Please', 0, 200));
  conversation.append(fragment('assistant', 'Hey!', 250, 400));
  conversation.append(fragment('user', ' calculate', 500, 700));
  conversation.append(fragment('user', ' 123 times 807. Give', 700, 1200));
  conversation.append(fragment('user', ' only the answer.', 1200, 1600));
  assert.equal(conversation.messages.length, 2);
  assert.equal(conversation.messages[0].text, ' Please calculate 123 times 807. Give only the answer.');
  assert.equal(conversation.messages[1].text, 'Hey!');
});

test('a short assistant answer after a finished question still permits a new user row', () => {
  const conversation = new Conversation();
  conversation.append(fragment('user', 'Are you there?', 0, 400));
  conversation.append(fragment('assistant', 'Yes.', 500, 700));
  conversation.append(fragment('user', 'Great.', 800, 1000));
  assert.deepEqual(conversation.messages.map(message => message.text), ['Are you there?', 'Yes.', 'Great.']);
});

test('duplicate transcript events are ignored, but repeated words at different times remain', () => {
  const conversation = new Conversation();
  const event = fragment('user', 'no ', 0, 100);
  conversation.append(event);
  assert.equal(conversation.append(event), null);
  conversation.append(fragment('user', 'no', 100, 200));
  assert.equal(conversation.messages[0].text, 'no no');
});

test('new transports never merge fresh timestamps into previous context', () => {
  const conversation = new Conversation([{ role: 'user', text: 'Old topic.' }]);
  conversation.append(fragment('user', 'First connection.', 0, 100));
  conversation.beginTransport();
  conversation.append(fragment('user', 'Next connection.', 0, 100));
  assert.deepEqual(conversation.messages.map(message => message.text), ['Old topic.', 'First connection.', 'Next connection.']);
});

test('history keeps only valid recent whole messages, bounded by count and UTF-8 bytes', () => {
  const messages = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `${i}: ${'中'.repeat(700)}` }));
  messages.push({ role: 'system', text: 'Not a user message' }, { role: 'user', text: ' ' });
  const history = recentHistory(messages);
  assert.equal(history.length, 3);
  assert.ok(history.reduce((sum, item) => sum + new TextEncoder().encode(item.text).length, 0) <= 7600);
  assert.deepEqual(history, messages.slice(37, 40));
  assert.equal(recentHistory(Array.from({ length: 30 }, () => ({ role: 'user', text: 'Hi' }))).length, 24);
  assert.deepEqual(recentHistory([{ role: 'user', text: '😀'.repeat(7000) }, { role: 'assistant', text: 'x' }]), [
    { role: 'assistant', text: 'x' },
  ]);
});

test('an oversized latest history message is clipped once at a Unicode codepoint boundary', () => {
  for (const source of ['😀'.repeat(7000), '你好'.repeat(7000), 'a'.repeat(9000)]) {
    const history = recentHistory([{ role: 'assistant', text: 'Older message' }, { role: 'user', text: source }]);
    assert.equal(history.length, 1);
    assert.ok(new TextEncoder().encode(history[0].text).length <= 7600);
    assert.ok(source.endsWith(history[0].text));
    assert.ok(!history[0].text.includes('\uFFFD'));
    assert.ok(!/^[\uDC00-\uDFFF]/u.test(history[0].text));
  }
});

const storedCardWithoutPurpose = { language: 'Chinese', term: '你好', reading: 'nǐ hǎo', meaning: 'Hello' };
const card = { purpose: 'practice', ...storedCardWithoutPurpose };
const call = args => ({ name: 'show_learning_card', arguments: JSON.stringify(args) });

test('display tool returns success only after rendering validated native-script text', () => {
  const rendered = [];
  assert.deepEqual(runDisplayTool(call(card), 'tutor', value => rendered.push(value)), { shown: true });
  assert.deepEqual(rendered, [card]);
});

test('display tool rejects unknown names, wrong modes, invalid JSON and field types or lengths', () => {
  const rejected = [
    { item: { name: 'web_search', arguments: '{}' }, mode: 'tutor' },
    { item: call(card), mode: 'general' },
    { item: { name: 'show_learning_card', arguments: '{' }, mode: 'tutor' },
    ...Object.entries({ language: 80, term: 200, reading: 200, meaning: 400 }).map(([key, length]) => ({
      item: call({ ...card, [key]: 'x'.repeat(length + 1) }), mode: 'tutor',
    })),
    { item: call({ ...card, term: {} }), mode: 'tutor' },
    { item: call({ ...card, term: ' ' }), mode: 'tutor' },
    { item: call({ ...card, purpose: 'note' }), mode: 'tutor' },
    { item: call(storedCardWithoutPurpose), mode: 'tutor' },
    { item: call(null), mode: 'tutor' },
  ];
  for (const { item, mode } of rejected) {
    const result = runDisplayTool(item, mode, () => assert.fail('Invalid tool must not render'));
    assert.equal(result.shown, false);
    assert.ok(result.error);
  }
});

test('renderer failures produce explicit failure output, never a false success', () => {
  const result = runDisplayTool(call(card), 'tutor', () => { throw new Error('Display unavailable'); });
  assert.deepEqual(result, { shown: false, error: 'Could not display card: Display unavailable' });
});

test('interview questions render only valid question data in interview mode', () => {
  const displayed = [];
  const item = question => ({ name: 'show_interview_question', arguments: JSON.stringify({ question }) });
  const render = question => displayed.push(question);
  assert.deepEqual(runDisplayTool(item('  What did you learn?  '), 'interview', undefined, render), { shown: true });
  assert.deepEqual(displayed, ['What did you learn?']);
  for (const [question, mode] of [[' ', 'interview'], ['x'.repeat(601), 'interview'], [42, 'interview'], ['Question?', 'general'], ['Question?', 'tutor']]) {
    assert.equal(runDisplayTool(item(question), mode, undefined, render).shown, false);
  }
  assert.equal(displayed.length, 1);
});
