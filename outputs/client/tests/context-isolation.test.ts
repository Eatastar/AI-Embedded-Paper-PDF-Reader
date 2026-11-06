import assert from 'node:assert/strict';
import test from 'node:test';
import type { Conversation, Workspace } from '../src/domain/types';
import { addAssistantVersion, buildAnnotationContext, buildMainContext, changeAnnotationReask, compactRequestCaches, completeAnnotation, createAnnotation, createAssistantMessage, createConversation, createUserMessage, deleteChatTurn, mergeImportedWorkspace, prepareAnnotationRequest, updateAnnotationRequest, validateImport } from '../src/domain/workspace';
import { captureAnnotationReferences, chatRound } from '../src/domain/chat-references';
import { unpackWorkspace, WorkspaceCodec } from '../src/domain/workspace-codec';
const workspace = (conversation: Conversation): Workspace => ({ schemaVersion: 1, conversations: [conversation], activeConversationId: conversation.id });
function fixture() {
  const conversation = createConversation('CHAT_PRIVATE_QUESTION');
  conversation.messages = [createUserMessage('CHAT_PRIVATE_QUESTION'), createAssistantMessage('CHAT_PRIVATE_ANSWER with SOURCE_TERM.', 'complete')];
  conversation.documents = [{ id: 'synthetic-paper', name: 'Synthetic paper.pdf', mimeType: 'application/pdf', kind: 'pdf', size: 100, createdAt: 1, pages: [
    { pageNumber: 1, text: 'SOURCE_TERM has a precise definition in this paper.', messageId: 'synthetic-page-one', versionId: 'synthetic-page-one-v' },
    { pageNumber: 2, text: 'FULL_PAPER_BACKGROUND explains the term in detail.', messageId: 'synthetic-page-two', versionId: 'synthetic-page-two-v' },
  ] }, { id: 'synthetic-other-paper', name: 'Other paper.pdf', mimeType: 'application/pdf', kind: 'pdf', size: 100, createdAt: 1, pages: [{ pageNumber: 1, text: 'OTHER_DOCUMENT_PRIVATE', messageId: 'synthetic-other-page', versionId: 'synthetic-other-page-v' }] }];
  const input = { messageId: 'synthetic-page-one', versionId: 'synthetic-page-one-v', quote: 'SOURCE_TERM', anchor: {}, color: '#f3cf6780' };
  const annotation = createAnnotation(conversation, { ...input, question: 'Explain the term using the paper.' });
  conversation.annotations = [annotation, createAnnotation(conversation, { ...input, question: 'SIBLING_ANNOTATION_PRIVATE' })];
  return { conversation, annotation };
}

test('PDF annotation uses only its own paper background and current question, without chat, sibling annotations or other files', () => {
  const { conversation, annotation } = fixture();
  const context = buildAnnotationContext(conversation, annotation, 'ANSWER_STYLE', { mode: 'full' });
  const request = JSON.stringify(context);
  assert.match(request, /FULL_PAPER_BACKGROUND/); assert.match(request, /SOURCE_TERM/); assert.match(request, /Explain the term/);
  assert.doesNotMatch(request, /CHAT_PRIVATE|SIBLING_ANNOTATION_PRIVATE|OTHER_DOCUMENT_PRIVATE/);
  assert.equal(context[0].content, 'ANSWER_STYLE'); assert.equal(context.length, 3);
});

test('annotations on AI text use their bound original answer version without the surrounding chat', () => {
  const { conversation } = fixture(), source = conversation.messages[1], original = source.versions[0];
  const annotation = createAnnotation(conversation, { messageId: source.id, versionId: original.id, quote: 'SOURCE_TERM', question: 'Define it.', anchor: {}, color: '#abcdef' });
  conversation.messages[1] = addAssistantVersion(source, 'NEW_ANSWER_NOT_THE_SOURCE', 'complete');
  const request = JSON.stringify(buildAnnotationContext(conversation, annotation));
  assert.match(request, /CHAT_PRIVATE_ANSWER with SOURCE_TERM/);
  assert.doesNotMatch(request, /CHAT_PRIVATE_QUESTION|NEW_ANSWER_NOT_THE_SOURCE|FULL_PAPER_BACKGROUND|OTHER_DOCUMENT_PRIVATE/);
});

test('chat includes annotations only after explicit selection, preserving a visible copy of the selected contents', () => {
  const { conversation, annotation } = fixture();
  const prepared = prepareAnnotationRequest(conversation, annotation.id);
  const completed = completeAnnotation(prepared.conversation, annotation.id, 'CHOSEN_ANNOTATION_EXPLANATION');
  assert.doesNotMatch(JSON.stringify(buildMainContext(completed)), /CHOSEN_ANNOTATION_EXPLANATION|SIBLING_ANNOTATION_PRIVATE/);
  const question = createUserMessage('Expand on this note.');
  question.annotationReferences = captureAnnotationReferences(completed, [annotation.id]);
  completed.messages.push(question);
  completed.annotations[0] = { ...completed.annotations[0], answer: 'LATER_EDIT_NOT_SENT_AUTOMATICALLY' };
  const request = JSON.stringify(buildMainContext(completed));
  assert.match(request, /CHOSEN_ANNOTATION_EXPLANATION/);
  assert.doesNotMatch(request, /LATER_EDIT_NOT_SENT_AUTOMATICALLY|SIBLING_ANNOTATION_PRIVATE/);
  assert.throws(() => captureAnnotationReferences(completed, [completed.annotations[1].id]), /尚未保存/);
});

test('annotation retries preserve question, preference and document scope without storing full chat snapshots', () => {
  const { conversation, annotation } = fixture();
  const first = prepareAnnotationRequest(conversation, annotation.id, 'FROZEN_STYLE', { mode: 'full' });
  assert.equal(first.annotation.context, undefined); assert.equal(first.annotation.requestPreference, 'FROZEN_STYLE');
  const failed = updateAnnotationRequest(first.conversation, annotation.id, 'partial', { interrupted: false, error: 'synthetic failure' });
  failed.messages.push(createUserMessage('CHAT_ADDED_AFTER_FAILURE'));
  const retry = prepareAnnotationRequest(failed, annotation.id, 'NEW_STYLE', { mode: 'relevant' });
  assert.deepEqual(retry.messages, first.messages); assert.equal(retry.annotation.documentContextMode, 'full');
  assert.doesNotMatch(JSON.stringify(retry.messages), /CHAT_ADDED_AFTER_FAILURE|CHAT_PRIVATE/);
  const complete = completeAnnotation(retry.conversation, annotation.id, 'answer');
  assert.equal(complete.annotations[0].requestPreference, undefined); assert.equal(complete.annotations[0].context, undefined);
  const reask = prepareAnnotationRequest(changeAnnotationReask(complete, annotation.id, 'start'), annotation.id, 'NEW_ATTEMPT_STYLE', { mode: 'relevant' });
  assert.equal(reask.annotation.reask!.requestPreference, 'NEW_ATTEMPT_STYLE'); assert.equal(reask.annotation.reask!.context, undefined);
  const interrupted = workspace(updateAnnotationRequest(reask.conversation, annotation.id, '', { interrupted: true, error: 'synthetic stop' }));
  assert.deepEqual(validateImport(interrupted), interrupted);
});

test('legacy annotation snapshots are compacted while preserving visible answers, original versions and retry preferences', () => {
  const { conversation, annotation } = fixture();
  const legacy = [{ role: 'system' as const, content: 'LEGACY_FROZEN_STYLE' }, ...buildMainContext(conversation), { role: 'user' as const, content: 'LEGACY_HIDDEN_CHAT_SNAPSHOT' }];
  conversation.annotations[0] = { ...annotation, status: 'error', originalQuestion: annotation.question, context: legacy, answer: 'partial visible answer' };
  conversation.messages[1].versions[0].context = legacy;
  const compact = compactRequestCaches(workspace(conversation));
  assert.equal(compact.conversations[0].messages[1].versions[0].context, undefined);
  const next = compact.conversations[0].annotations[0];
  assert.equal(next.answer, 'partial visible answer'); assert.equal(next.requestPreference, 'LEGACY_FROZEN_STYLE'); assert.equal(next.context, undefined);
  assert.doesNotMatch(JSON.stringify(prepareAnnotationRequest(compact.conversations[0], annotation.id).messages), /LEGACY_HIDDEN_CHAT_SNAPSHOT|CHAT_PRIVATE/);
  assert.equal(compactRequestCaches(compact), compact, 'Already compacted data does not trigger another rewrite');
});

test('deleting a chat round removes its versions, attached annotations, later references and cached retries without deleting PDF notes', () => {
  const { conversation, annotation } = fixture(), source = conversation.messages[1];
  let current = { ...conversation, messages: [conversation.messages[0], addAssistantVersion(source, 'ROUND_VERSION_TO_DELETE', 'complete')] };
  const chatAnnotation = createAnnotation(current, { messageId: source.id, versionId: source.versions[0].id, quote: 'SOURCE_TERM', question: 'ROUND_NOTE_TO_DELETE', anchor: {}, color: '#abcdee' });
  current.annotations = [...current.annotations, chatAnnotation];
  current = completeAnnotation(prepareAnnotationRequest(current, chatAnnotation.id).conversation, chatAnnotation.id, 'ROUND_NOTE_ANSWER_TO_DELETE');
  const nextQuestion = createUserMessage('SURVIVING_QUESTION'); nextQuestion.annotationReferences = captureAnnotationReferences(current, [chatAnnotation.id]);
  const nextAnswer = createAssistantMessage('surviving partial response', 'error'); nextAnswer.versions[0].context = buildMainContext(current);
  current = { ...current, messages: [...current.messages, nextQuestion, nextAnswer] };
  const result = deleteChatTurn(workspace(current), current.id, source.id), kept = result.conversations[0];
  assert.deepEqual(kept.messages.map(message => message.id), [nextQuestion.id, nextAnswer.id]);
  assert.equal(kept.messages[0].annotationReferences, undefined); assert.equal(kept.messages[1].versions[0].context, undefined);
  assert.ok(kept.annotations.some(item => item.id === annotation.id)); assert.equal(kept.documents, conversation.documents);
  assert.equal(kept.title, 'SURVIVING_QUESTION');
  assert.doesNotMatch(JSON.stringify(result), /CHAT_PRIVATE|ROUND_VERSION_TO_DELETE|ROUND_NOTE_TO_DELETE|ROUND_NOTE_ANSWER_TO_DELETE/);
  assert.doesNotMatch(JSON.stringify(buildMainContext(kept)), /CHAT_PRIVATE|ROUND_NOTE/);
  assert.deepEqual(validateImport(result), result);
});

test('selected annotation copies and small retry settings survive compact backups and remap on additive import', () => {
  const { conversation, annotation } = fixture();
  let current = completeAnnotation(prepareAnnotationRequest(conversation, annotation.id).conversation, annotation.id, 'a saved explanation');
  const user = createUserMessage('Discuss the selected note'); user.annotationReferences = captureAnnotationReferences(current, [annotation.id]); current.messages.push(user);
  const attempt = prepareAnnotationRequest(changeAnnotationReask(current, annotation.id, 'start'), annotation.id, 'FROZEN_REASK_STYLE');
  current = updateAnnotationRequest(attempt.conversation, annotation.id, 'partial', { interrupted: false, error: 'synthetic failure' });
  const data = workspace(current), packed = new WorkspaceCodec().pack(data), decoded = validateImport(unpackWorkspace({ ...packed.header, records: packed.rows }));
  assert.deepEqual(decoded, data);
  const merged = mergeImportedWorkspace(data, decoded), imported = merged.conversations[1];
  assert.notEqual(imported.annotations[0].id, annotation.id);
  assert.equal(imported.messages.at(-1)!.annotationReferences![0].annotationId, imported.annotations[0].id);
  assert.equal(imported.annotations[0].reask!.requestPreference, 'FROZEN_REASK_STYLE');
});

test('round deletion includes incomplete user-only rounds and refuses active model requests', () => {
  const { conversation } = fixture(), unanswered = createUserMessage('unanswered'); conversation.messages.push(unanswered);
  assert.deepEqual(chatRound(conversation.messages, unanswered.id), [unanswered]);
  assert.equal(deleteChatTurn(workspace(conversation), conversation.id, unanswered.id).conversations[0].messages.length, 2);
  conversation.messages[1].versions[0] = { ...conversation.messages[1].versions[0], status: 'streaming' };
  assert.throws(() => deleteChatTurn(workspace(conversation), conversation.id, unanswered.id), /先停止/);
});
