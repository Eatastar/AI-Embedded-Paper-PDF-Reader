import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCompleteChatCopy, chatTranscript } from '../src/adapters/chat-copy';
import { createAssistantMessage, createUserMessage } from '../src/domain/workspace';

test('whole-conversation text keeps active answers, LaTeX and explicit references without exposing hidden request context', () => {
  const user = createUserMessage('Synthetic question'), assistant = createAssistantMessage('Visible $a \\leq b$', 'complete');
  user.textReference = { conversationId: 'synthetic', messageId: 'm', versionId: 'v', label: 'Source', text: 'Selected synthetic text' };
  user.annotationReferences = [{ annotationId: 'a', label: 'Note', mode: 'note', quote: 'Synthetic quote', question: '', answer: '', note: 'Explicit synthetic note' }];
  assistant.versions.unshift({ id: 'old', content: 'SYNTHETIC_HIDDEN_OLD_ANSWER', status: 'interrupted', createdAt: 1, context: [{ role: 'user', content: 'SYNTHETIC_PRIVATE_REQUEST_CONTEXT' }] });
  const copied = chatTranscript([user, assistant]);
  for (const text of ['Synthetic question', 'Visible $a \\leq b$', 'Selected synthetic text', 'Explicit synthetic note']) assert.ok(copied.includes(text));
  assert.doesNotMatch(copied, /SYNTHETIC_HIDDEN|SYNTHETIC_PRIVATE/);
});

test('whole-history copy includes unmounted messages while partial copy and unmounted views stay native', () => {
  let whole = true, text = '';
  const doc = Object.assign(new EventTarget(), { getSelection: () => ({ rangeCount: 1, isCollapsed: false, getRangeAt: () => ({ commonAncestorContainer: content, isPointInRange: () => whole }) }) });
  const rows = [{ childNodes: [] }, { childNodes: [] }];
  const content = { querySelectorAll: () => rows, contains: (node: unknown) => node === content } as unknown as HTMLElement;
  const viewport = { ownerDocument: doc, clientHeight: 600, contains: () => false } as unknown as HTMLElement;
  const messages = Array.from({ length: 100 }, (_, i) => createAssistantMessage(`Synthetic answer ${i}`, 'complete'));
  const dispose = bindCompleteChatCopy(viewport, content, () => messages, () => 'You');
  const copy = () => { const event = new Event('copy', { cancelable: true }); Object.defineProperty(event, 'clipboardData', { value: { setData(type: string, value: string) { assert.equal(type, 'text/plain'); text = value; } } }); doc.dispatchEvent(event); return event.defaultPrevented; };
  assert.equal(copy(), true); assert.ok(text.includes('Synthetic answer 0') && text.includes('Synthetic answer 99'));
  whole = false; assert.equal(copy(), false); dispose(); whole = true; assert.equal(copy(), false);
});
