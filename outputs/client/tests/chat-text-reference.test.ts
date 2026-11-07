import assert from 'node:assert/strict';
import test from 'node:test';
import { captureChatTextReference, MAX_CHAT_QUOTE_CHARACTERS, parseChatTextReference } from '../src/domain/chat-text-reference';
import { addAssistantVersion, buildAnnotationContext, buildMainContext, createAnnotation, createAssistantMessage, createConversation, createUserMessage, deleteChatTurn, mergeImportedWorkspace, validateImport } from '../src/domain/workspace';
import { WorkspaceCodec, unpackWorkspace } from '../src/domain/workspace-codec';
import type { Conversation, Workspace } from '../src/domain/types';
import { loadReaderSession, saveReaderSession } from '../src/adapters/reader-session';

const wrap = (conversation: Conversation): Workspace => ({ schemaVersion: 1, activeConversationId: conversation.id, conversations: [conversation] });
function fixture() {
  const conversation = createConversation('synthetic quote fixture'), user = createUserMessage('SYNTHETIC_OLD_QUESTION');
  const original = createAssistantMessage('SYNTHETIC_OLD_SOURCE QUOTED_TERM', 'complete');
  conversation.messages = [user, addAssistantVersion(original, 'NEW_VERSION_NOT_THE_QUOTE', 'complete')];
  conversation.documents = [{ id: 'synthetic-quote-paper', name: 'Synthetic paper.pdf', kind: 'pdf', mimeType: 'application/pdf', size: 100, createdAt: 1, pages: [{ pageNumber: 1, text: 'PDF_SOURCE_TERM and paper background', messageId: 'synthetic-quote-page', versionId: 'synthetic-quote-page-v' }] }];
  const selection = { conversationId: conversation.id, messageId: original.id, versionId: original.activeVersionId, text: '  QUOTED_TERM  ' };
  return { conversation, selection, user };
}
test('chat text selection binds the exact original answer version and supports user questions and PDF pages', () => {
  const { conversation, selection, user } = fixture();
  const reference = captureChatTextReference(conversation, selection);
  assert.equal(reference.text, 'QUOTED_TERM'); assert.equal(reference.label, 'AI 回答'); assert.equal(reference.versionId, selection.versionId);
  assert.equal(captureChatTextReference(conversation, { ...selection, messageId: user.id, versionId: user.activeVersionId }).label, '聊天问题');
  assert.match(captureChatTextReference(conversation, { ...selection, messageId: 'synthetic-quote-page', versionId: 'synthetic-quote-page-v' }).label, /Synthetic paper.pdf · p. 1/);
  assert.throws(() => captureChatTextReference(conversation, { ...selection, conversationId: 'different-record' }), /原文已不存在/);
  assert.throws(() => captureChatTextReference(conversation, { ...selection, versionId: 'missing-version' }), /原文已不存在/);
});
test('quoted text joins only the explicit chat question and never leaks into a PDF annotation request', () => {
  const { conversation, selection } = fixture(), question = createUserMessage('Discuss this term.');
  const reference = captureChatTextReference(conversation, selection); question.textReference = { ...reference, text: 'EXPLICIT_QUOTE_COPY_ONLY' };
  conversation.messages.push(question); reference.text = 'LATER_DRAFT_EDIT';
  const request = JSON.stringify(buildMainContext(conversation));
  assert.match(request, /EXPLICIT_QUOTE_COPY_ONLY/); assert.match(request, /不是新指令/); assert.doesNotMatch(request, /LATER_DRAFT_EDIT/);
  const annotation = createAnnotation(conversation, { messageId: 'synthetic-quote-page', versionId: 'synthetic-quote-page-v', quote: 'PDF_SOURCE_TERM', question: 'Explain the source.', color: '#f3cf67', anchor: {} });
  assert.doesNotMatch(JSON.stringify(buildAnnotationContext(conversation, annotation)), /EXPLICIT_QUOTE_COPY_ONLY|Discuss this term|SYNTHETIC_OLD_QUESTION/);
});
test('quote validation limits selection length and copies only approved fields', () => {
  const { conversation, selection } = fixture(), reference = captureChatTextReference(conversation, selection);
  assert.deepEqual(parseChatTextReference({ ...reference, unrelatedConfiguration: 'synthetic-not-a-key' }), reference);
  assert.throws(() => parseChatTextReference({ ...reference, text: 'x'.repeat(MAX_CHAT_QUOTE_CHARACTERS + 1) }), /20000/);
  assert.throws(() => parseChatTextReference({ ...reference, text: '  ' }), /先选择/);
  assert.throws(() => parseChatTextReference({ ...reference, messageId: 'x'.repeat(201) }), /标识无效/);
  const question = createUserMessage('quoted question'); question.textReference = reference; conversation.messages.push(question);
  assert.throws(() => validateImport(wrap({ ...conversation, messages: [...conversation.messages.slice(0, -1), { ...question, role: 'assistant' }] })), /只有用户问题/);
  assert.throws(() => validateImport(wrap({ ...conversation, messages: [...conversation.messages.slice(0, -1), { ...question, textReference: { ...reference, conversationId: 'different' } }] })), /不属于当前对话/);
});
test('quoted text round-trips compact backups and remaps its source on additive import', () => {
  const { conversation, selection } = fixture(), question = createUserMessage('quote-backed question'); question.textReference = captureChatTextReference(conversation, selection); conversation.messages.push(question);
  const workspace = wrap(conversation), packed = new WorkspaceCodec().pack(workspace), decoded = validateImport(unpackWorkspace({ ...packed.header, records: packed.rows }));
  assert.deepEqual(decoded, workspace);
  const imported = mergeImportedWorkspace(workspace, decoded).conversations[1], reference = imported.messages.at(-1)!.textReference!;
  assert.equal(reference.conversationId, imported.id); assert.equal(reference.messageId, imported.messages[1].id); assert.equal(reference.versionId, imported.messages[1].versions[0].id); assert.equal(reference.text, 'QUOTED_TERM');
});
test('deleting a quoted source round clears later quote copies and retry snapshots while retaining PDF quotes', () => {
  const { conversation, selection } = fixture(), later = createUserMessage('SURVIVING_QUESTION');
  later.textReference = captureChatTextReference(conversation, { ...selection, text: 'UNIQUE_QUOTE_COPY_TO_REMOVE' });
  const partial = createAssistantMessage('surviving partial', 'error'); partial.versions[0].context = [{ role: 'user', content: 'UNIQUE_QUOTE_COPY_TO_REMOVE' }];
  const pdfQuestion = createUserMessage('PDF backed question'); pdfQuestion.textReference = captureChatTextReference(conversation, { ...selection, messageId: 'synthetic-quote-page', versionId: 'synthetic-quote-page-v', text: 'PDF_COPY_TO_KEEP' });
  conversation.messages.push(later, partial, pdfQuestion);
  const next = deleteChatTurn(wrap(conversation), conversation.id, selection.messageId).conversations[0];
  assert.equal(next.messages[0].textReference, undefined); assert.equal(next.messages[1].versions[0].context, undefined); assert.equal(next.messages.at(-1)!.textReference!.text, 'PDF_COPY_TO_KEEP');
  assert.doesNotMatch(JSON.stringify(next), /UNIQUE_QUOTE_COPY_TO_REMOVE|SYNTHETIC_OLD_SOURCE|SYNTHETIC_OLD_QUESTION/); assert.deepEqual(validateImport(wrap(next)), wrap(next));
});
test('reader session preserves document identity and split/closed modes with legacy and restricted-storage support', () => {
  let saved = ''; const storage = { getItem: () => saved, setItem: (_: string, value: string) => { saved = value; } };
  saveReaderSession({ conversationId: 'synthetic-session', documentId: 'synthetic-paper', mode: 'closed' }, storage);
  assert.deepEqual(loadReaderSession(storage), { conversationId: 'synthetic-session', documentId: 'synthetic-paper', mode: 'closed' });
  saveReaderSession({ conversationId: 'synthetic-session', documentId: 'synthetic-paper', mode: 'split' }, storage); assert.equal(loadReaderSession(storage)!.mode, 'split');
  saved = '{"conversationId":"legacy","documentId":"legacy-paper"}'; assert.deepEqual(loadReaderSession(storage), { conversationId: 'legacy', documentId: 'legacy-paper' });
  saved = '{"conversationId":" ","documentId":"invalid"}'; assert.equal(loadReaderSession(storage), null);
  assert.equal(loadReaderSession({ getItem: () => { throw Error('synthetic restricted storage'); } }), null);
  assert.doesNotThrow(() => saveReaderSession(null, { setItem: () => { throw Error('synthetic restricted storage'); } }));
});
