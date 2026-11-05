import test from 'node:test';
import assert from 'node:assert/strict';
import { changeAnnotationColor, normalizeHighlightColor } from '../src/domain/highlight-colors';
import { createConversation, createAssistantMessage, createAnnotation, prepareAnnotationRequest, completeAnnotation, changeAnnotationReask, updateAnnotationRequest, deleteAnnotation, validateImport } from '../src/domain/workspace';
import { WorkspaceCodec, unpackWorkspace } from '../src/domain/workspace-codec';
import type { Conversation, Workspace } from '../src/domain/types';

function fixture() {
  const conversation = createConversation('Synthetic paper'), message = createAssistantMessage('Original text with a selectable phrase.', 'complete');
  conversation.messages = [message];
  const a = createAnnotation(conversation, { messageId: message.id, versionId: message.activeVersionId, quote: 'selectable phrase', anchor: { quote: 'selectable phrase' }, color: '#f3cf67', question: 'Explain this phrase' });
  conversation.annotations = [a];
  return { conversation, id: a.id };
}
const workspace = (c: Conversation): Workspace => ({ schemaVersion: 1, conversations: [c], activeConversationId: c.id });

test('changing color during a request retains the exact anchor, context and original Q&A', () => {
  const { conversation, id } = fixture();
  const first = completeAnnotation(prepareAnnotationRequest(conversation, id).conversation, id, 'Original completed answer');
  const running = updateAnnotationRequest(prepareAnnotationRequest(changeAnnotationReask(first, id, 'start'), id).conversation, id, 'Partial replacement');
  const before = running.annotations[0], changed = changeAnnotationColor(running, id, ' #12AbEF '), after = changed.annotations[0];
  assert.equal(after.color, '#12abef'); assert.equal(before.color, '#f3cf67');
  for (const key of ['id', 'messageId', 'versionId', 'quote', 'anchor', 'context', 'reask', 'question', 'answer', 'originalQuestion', 'originalAnswer', 'createdAt'] as const) assert.equal(after[key], before[key], key);
  assert.equal(changed.messages, running.messages);
  const completed = completeAnnotation(changed, id, 'Successful replacement');
  assert.equal(completed.annotations[0].color, '#12abef'); assert.equal(completed.annotations[0].answer, 'Successful replacement');
});

test('custom colors round-trip through compact save and backup validation without changing source text', () => {
  const { conversation, id } = fixture(), colored = changeAnnotationColor(conversation, id, '#aabbcc80');
  const packed = new WorkspaceCodec().pack(workspace(colored));
  const restored = validateImport(unpackWorkspace({ ...packed.header, records: packed.rows }));
  assert.equal(restored.conversations[0].annotations[0].color, '#aabbcc80');
  assert.equal(restored.conversations[0].messages[0].versions[0].content, conversation.messages[0].versions[0].content);
  assert.deepEqual(validateImport(JSON.parse(JSON.stringify(workspace(colored)))), workspace(colored));
});

test('invalid colors and deleted annotations cannot corrupt a record; unchanged colors are a no-op', () => {
  const { conversation, id } = fixture();
  for (const value of ['red', '#abc', '#1234567', '#gggggg', 'url(https://example.com)']) assert.throws(() => changeAnnotationColor(conversation, id, value));
  assert.equal(conversation.annotations[0].color, '#f3cf67');
  assert.equal(changeAnnotationColor(conversation, id, '#F3CF67'), conversation);
  assert.equal(normalizeHighlightColor('#AABBCCDD'), '#aabbccdd');
  assert.throws(() => changeAnnotationColor(deleteAnnotation(conversation, id), id, '#123456'), /删除/);
});
