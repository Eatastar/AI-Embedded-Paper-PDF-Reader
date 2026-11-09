import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspace, createUserMessage, createAssistantMessage, createAnnotation, activeVersion, buildMainContext, deleteChatTurn, deleteChatTurns, validateImport } from '../src/domain/workspace';
import { captureAnnotationReferences } from '../src/domain/chat-references';
import { chatTurns, chatTurnSelection } from '../src/domain/chat-turns';
import { translate, LANGUAGES } from '../src/i18n/locale';

function fixture() {
  const workspace = createWorkspace(), conversation = workspace.conversations[0];
  conversation.messages = Array.from({ length: 4 }, (_, i) => [createUserMessage(`QUESTION_${i}`), createAssistantMessage(`ANSWER_${i} SOURCE_TERM`, 'complete')]).flat();
  conversation.title = 'QUESTION_0';
  const page = { pageNumber: 1, messageId: 'synthetic-page', versionId: 'synthetic-page-version', text: 'PDF_SOURCE_TERM' };
  conversation.documents = [{ id: 'synthetic-document', name: 'Synthetic.pdf', kind: 'pdf', mimeType: 'application/pdf', size: 1, createdAt: 1, pages: [page] }];
  const pdfNote = { ...createAnnotation(conversation, { messageId: page.messageId, versionId: page.versionId, quote: page.text, anchor: {}, color: '#aabbcc' }), mode: 'note' as const, status: 'noted' as const, note: 'KEEP_PDF_NOTE' };
  const answer = conversation.messages[1];
  const answerNote = { ...createAnnotation(conversation, { messageId: answer.id, versionId: activeVersion(answer).id, quote: 'SOURCE_TERM', anchor: {}, color: '#aabbcc' }), mode: 'note' as const, status: 'noted' as const, note: 'REMOVE_ANSWER_NOTE' };
  conversation.annotations = [pdfNote, answerNote];
  conversation.messages[6].annotationReferences = captureAnnotationReferences(conversation, [pdfNote.id, answerNote.id]);
  conversation.messages[7].versions[0].context = buildMainContext(conversation);
  return { workspace, conversation, pdfNote, answerNote };
}

test('navigation groups turns, uses active question previews and targets the answer or unanswered question', () => {
  const { conversation } = fixture();
  const orphan = createAssistantMessage('legacy standalone answer', 'error');
  const unanswered = createUserMessage('  A question\nwith whitespace  ');
  const messages = [orphan, ...conversation.messages, unanswered];
  const turns = chatTurns(messages);
  assert.equal(turns.length, 6);
  assert.equal(turns[0].targetId, orphan.id);
  assert.equal(turns[1].targetId, conversation.messages[1].id);
  assert.equal(turns.at(-1)!.targetId, unanswered.id);
  assert.equal(turns.at(-1)!.preview, 'A question with whitespace');
});

test('nonadjacent bulk deletion removes all answer versions and stale retry/reference material, preserving PDF notes', () => {
  const { workspace, conversation, pdfNote, answerNote } = fixture();
  const selected = [conversation.messages[0].id, conversation.messages[5].id];
  const impact = chatTurnSelection(conversation, selected);
  assert.equal(impact.turns.length, 2); assert.equal(impact.messageIds.size, 4);
  assert(impact.annotationIds.has(answerNote.id)); assert(!impact.annotationIds.has(pdfNote.id));
  const next = deleteChatTurns(workspace, conversation.id, selected), kept = next.conversations[0];
  assert.deepEqual(kept.messages.map(message => message.id), [conversation.messages[2], conversation.messages[3], conversation.messages[6], conversation.messages[7]].map(message => message.id));
  assert.equal(kept.title, 'QUESTION_1');
  assert.deepEqual(kept.annotations, [pdfNote]); assert.equal(kept.documents, conversation.documents);
  assert.deepEqual(kept.messages[2].annotationReferences?.map(reference => reference.annotationId), [pdfNote.id]);
  assert.equal(activeVersion(kept.messages[3]).context, undefined);
  assert.doesNotMatch(JSON.stringify(next), /QUESTION_0|ANSWER_0|QUESTION_2|ANSWER_2|REMOVE_ANSWER_NOTE/);
  assert.deepEqual(validateImport(next), next);
});

test('clearing all chat retains the conversation, imported documents and source notes', () => {
  const { workspace, conversation, pdfNote } = fixture();
  const cleared = deleteChatTurns(workspace, conversation.id, chatTurns(conversation.messages).map(turn => turn.id));
  const next = cleared.conversations[0];
  assert.equal(next.id, conversation.id); assert.equal(cleared.activeConversationId, conversation.id);
  assert.deepEqual(next.messages, []); assert.deepEqual(next.annotations, [pdfNote]);
  assert.equal(next.documents, conversation.documents); assert.equal(next.title, '新对话');
  assert.deepEqual(validateImport(cleared), cleared);
});

test('duplicate/assistant IDs resolve to one turn; empty or stale selections never partially delete', () => {
  const { workspace, conversation } = fixture();
  assert.deepEqual(deleteChatTurns(workspace, conversation.id, [conversation.messages[0].id, conversation.messages[1].id]).conversations[0].messages, deleteChatTurn(workspace, conversation.id, conversation.messages[0].id).conversations[0].messages);
  assert.throws(() => deleteChatTurns(workspace, conversation.id, []), /选择/);
  assert.throws(() => deleteChatTurns(workspace, conversation.id, [conversation.messages[0].id, 'missing']), /不存在/);
  assert.equal(conversation.messages.length, 8);
});

test('bulk deletion refuses active answer and annotation requests', () => {
  const { workspace, conversation } = fixture();
  activeVersion(conversation.messages[1]).status = 'streaming';
  assert.throws(() => deleteChatTurns(workspace, conversation.id, [conversation.messages[0].id]), /先停止/);
  activeVersion(conversation.messages[1]).status = 'complete'; conversation.annotations[0].status = 'generating';
  assert.throws(() => deleteChatTurns(workspace, conversation.id, [conversation.messages[0].id]), /先停止/);
});

test('long-chat navigation descriptors are bounded and do not retain answer or request copies', () => {
  const messages = Array.from({ length: 1000 }, (_, i) => [createUserMessage('question ' + i + 'x'.repeat(2000)), createAssistantMessage('ANSWER_COPY_NOT_NEEDED'.repeat(100), 'complete')]).flat();
  const turns = chatTurns(messages);
  assert.equal(turns.length, 1000); assert(turns.every(turn => turn.preview.length <= 180));
  assert.doesNotMatch(JSON.stringify(turns), /ANSWER_COPY_NOT_NEEDED/);
  assert(JSON.stringify(turns).length < 600_000);
});

test('new navigation and annotation-reference controls are translated in all eight languages', () => {
  for (const language of LANGUAGES) {
    const label = translate('全选全部 {0} 轮', language.code, [43]);
    assert.match(label, /43/); assert.doesNotMatch(label, /\{0\}/);
    for (const key of ['对话目录与管理', '引用到聊天继续追问', '确认删除所选对话？']) {
      if (language.code !== 'zh-CN') assert.notEqual(translate(key, language.code), key);
    }
  }
});
