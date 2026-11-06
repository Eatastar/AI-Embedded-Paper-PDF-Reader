import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDocumentMessages, selectDocumentPassages, usesRelevantContext, RELEVANT_CHARACTER_BUDGET } from '../src/domain/document-context';
import { buildMainContext, createAnnotation, createAssistantMessage, createConversation, createUserMessage, prepareAnnotationRequest, updateAnnotationRequest, validateImport } from '../src/domain/workspace';
import { WorkspaceCodec, unpackWorkspace } from '../src/domain/workspace-codec';
import { assertWorkspaceCapacity } from '../src/domain/capacity';
import type { DocumentAttachment, Workspace } from '../src/domain/types';
function fixture(pages = 320) {
  const conversation = createConversation('Synthetic context test');
  const document: DocumentAttachment = { id: 'synthetic-doc', name: 'synthetic.pdf', kind: 'pdf', mimeType: 'application/pdf', size: 30 * 1024 * 1024, createdAt: 1,
    pages: Array.from({ length: pages }, (_, i) => ({ pageNumber: i + 1, text: `Page ${i + 1}. ` + (i === 274 ? 'Zephyr coupling predicts phonon resonance. 声子耦合强度与共振频率有关。' : 'Unrelated general background. ').repeat(45), messageId: 'synthetic-page-' + i, versionId: 'synthetic-version-' + i })) };
  conversation.documents = [document]; conversation.messages = [createUserMessage('Earlier question'), createAssistantMessage('Earlier complete answer', 'complete'), createAssistantMessage('unfinished', 'error'), createUserMessage('Explain zephyr coupling')];
  return { document, conversation };
}
test('automatic document scope uses full extracted text for small files and bounded excerpts for large files', () => {
  const { document, conversation } = fixture();
  assert.equal(usesRelevantContext(document), true);
  const small = { ...document, size: 1000, pages: document.pages.slice(0, 2) };
  assert.equal(usesRelevantContext(small), false); assert.equal(usesRelevantContext(small, 'relevant'), true); assert.equal(usesRelevantContext(document, 'full'), false);
  const full = buildDocumentMessages({ ...conversation, documents: [small] }, { mode: 'auto' });
  assert.match(full[0].content, /附件全文/); assert.ok(full[0].content.includes(small.pages[1].text));
  const selected = selectDocumentPassages(document, { query: 'explain zephyr coupling', location: { documentId: document.id, pageNumber: 210 } });
  assert.ok(selected.passages.some(p => p.page === 275)); assert.ok(selected.passages.some(p => p.page === 210)); assert.ok(selected.characters <= RELEVANT_CHARACTER_BUDGET);
  const context = buildMainContext(conversation, 'Preference', { mode: 'auto' });
  assert.match(context[1].content, /不是全文/); assert.match(context[1].content, /第 275 页/); assert.ok(context[1].content.length < 25000);
  assert.deepEqual(context.slice(2).map(m => m.content), ['Earlier question', 'Earlier complete answer', 'Explain zephyr coupling']);
});
test('Chinese queries retrieve distant passages; a missing match is disclosed rather than presented as full document understanding', () => {
  const { document, conversation } = fixture();
  const passages = selectDocumentPassages(document, { query: '声子耦合强度' }); assert.ok(passages.passages.some(p => p.page === 275));
  const context = buildDocumentMessages(conversation, { mode: 'relevant', query: 'xylophone-fingerprint-absent' });
  assert.match(context[0].content, /未检出直接相关段落/); assert.match(context[0].content, /不能假定已经读完整篇/);
});

test('explicit full-text mode rejects oversized requests with a remedy instead of silently truncating', () => {
  const { conversation, document } = fixture(3);
  document.pages = document.pages.map(page => ({ ...page, text: 'Synthetic paragraph. '.repeat(40000) }));
  assert.throws(() => buildMainContext(conversation, '', { mode: 'full' }), /选择按需引用/);
  assert.ok(buildMainContext(conversation, '', { mode: 'auto' })[0].content.length < 25000);
});
test('annotation retries preserve the original excerpts, question, page and system prompt after settings change and restart', () => {
  const { conversation, document } = fixture(), page = document.pages[209];
  conversation.annotations = [createAnnotation(conversation, { messageId: page.messageId, versionId: page.versionId, quote: 'Page 210', question: 'Explain zephyr coupling', anchor: {}, color: '#eedd99' })];
  const first = prepareAnnotationRequest(conversation, conversation.annotations[0].id, 'Original preference', { mode: 'auto' });
  assert.match(first.messages[1].content, /第 210 页/); assert.match(first.messages[1].content, /第 275 页/);
  const failed = updateAnnotationRequest(first.conversation, first.annotation.id, 'partial', { error: 'synthetic network failure', interrupted: false });
  const workspace: Workspace = { schemaVersion: 1, activeConversationId: failed.id, conversations: [failed] };
  const packed = new WorkspaceCodec().pack(workspace);
  const restored = validateImport(unpackWorkspace({ ...packed.header, records: packed.rows })).conversations[0];
  restored.messages.push(createUserMessage('later question'));
  const retry = prepareAnnotationRequest(restored, first.annotation.id, 'Changed preference', { mode: 'full' });
  assert.deepEqual(retry.messages, first.messages);
});
test('large PDF metadata and frozen main requests round-trip through compact storage and capacity checks', () => {
  const { conversation } = fixture(501);
  const assistant = createAssistantMessage('partial', 'interrupted');
  assistant.versions[0].context = buildMainContext(conversation, '', { mode: 'auto' }); conversation.messages.push(assistant);
  const workspace: Workspace = { schemaVersion: 1, activeConversationId: conversation.id, conversations: [conversation] };
  assertWorkspaceCapacity(workspace);
  const packed = new WorkspaceCodec().pack(workspace), restored = validateImport(unpackWorkspace({ ...packed.header, records: packed.rows }));
  assert.equal(restored.conversations[0].documents![0].pages.length, 501);
  assert.deepEqual(restored.conversations[0].messages.at(-1)!.versions[0].context, assistant.versions[0].context);
});
