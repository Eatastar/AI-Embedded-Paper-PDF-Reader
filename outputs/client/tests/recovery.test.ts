import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  activeVersion, addAssistantVersion, buildAnnotationContext, buildMainContext,
  completeAnnotation, createAnnotation, createAssistantMessage, createConversation,
  createUserMessage, deleteAnnotation, deleteConversation, mergeImportedWorkspace,
  prepareAnnotationRequest, restoreAnnotation, restoreConversation, saveNoteAnnotation,
  updateAnnotationCopy, validateImport,
} from '../src/domain/workspace';
import { exportWorkspace, loadWorkspace, parseWorkspace, saveWorkspace } from '../src/adapters/storage';
import type { Conversation, Workspace } from '../src/domain/types';

function fixture(): Conversation {
  const conversation = createConversation('恢复测试');
  conversation.messages = [createUserMessage('原问题'), createAssistantMessage('完整答案：测地线。', 'complete')];
  conversation.annotations = [createAnnotation(conversation, {
    messageId: conversation.messages[1].id, versionId: conversation.messages[1].activeVersionId,
    quote: '测地线', anchor: { quote: '测地线' }, color: '#ffe099', question: '解释它。',
  })];
  return conversation;
}

function workspace(...conversations: Conversation[]): Workspace {
  return { schemaVersion: 1, conversations, activeConversationId: conversations.find(c => c.deletedAt === undefined)!.id };
}

function withDocument(): Conversation {
  const conversation = fixture();
  conversation.documents = [{
    id: 'document-1', name: '论文.pdf', kind: 'pdf', mimeType: 'application/pdf', size: 1234, createdAt: 42,
    pages: [
      { pageNumber: 1, text: '论文第一页：曲率。', messageId: 'page-message-1', versionId: 'page-version-1' },
      { pageNumber: 2, text: '', messageId: 'page-message-2', versionId: 'page-version-2' },
    ],
  }];
  return conversation;
}

test('删除当前对话保留全部内容，切到可见对话；恢复后原批注和版本不变', () => {
  const first = fixture();
  const second = createConversation('另一对话');
  const before = workspace(first, second);
  const deleted = deleteConversation(before, first.id);
  assert.equal(before.conversations[0].deletedAt, undefined);
  assert.equal(deleted.activeConversationId, second.id);
  assert.equal(typeof deleted.conversations[0].deletedAt, 'number');
  assert.deepEqual(deleted.conversations[0].messages, first.messages);
  assert.deepEqual(deleted.conversations[0].annotations, first.annotations);
  assert.equal(deleteConversation(deleted, first.id), deleted);
  const restored = restoreConversation(deleted, first.id);
  assert.equal(restored.activeConversationId, first.id);
  assert.equal(restored.conversations[0].deletedAt, undefined);
  assert.deepEqual(restored.conversations[0].annotations, first.annotations);
  assert.deepEqual(validateImport(restored), restored);
});

test('删除非当前对话不切换，删除最后可见对话自动建立空对话', () => {
  const first = fixture();
  const second = createConversation('另一对话');
  const deletedOther = deleteConversation(workspace(first, second), second.id);
  assert.equal(deletedOther.activeConversationId, first.id);
  const deletedLast = deleteConversation(deletedOther, first.id);
  const visible = deletedLast.conversations.filter(c => c.deletedAt === undefined);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, deletedLast.activeConversationId);
  assert.deepEqual(visible[0].messages, []);
  assert.deepEqual(visible[0].annotations, []);
  assert.equal(deletedLast.conversations.length, 3);
  assert.throws(() => deleteConversation(deletedLast, 'missing'), /不存在/);
  assert.throws(() => restoreConversation(deletedLast, 'missing'), /不存在/);
});

test('删除的对话刷新和备份后仍能恢复，当前对话必须可见', async () => {
  const conversation = withDocument();
  const deleted = deleteConversation(workspace(conversation), conversation.id);
  await saveWorkspace(deleted);
  const reloaded = await loadWorkspace();
  assert.deepEqual(reloaded, deleted);
  const roundTrip = parseWorkspace(exportWorkspace(reloaded));
  const restored = restoreConversation(roundTrip, conversation.id);
  assert.deepEqual(restored.conversations.find(c => c.id === conversation.id)?.documents, conversation.documents);
  assert.equal(restored.activeConversationId, conversation.id);
  const invalid = structuredClone(deleted);
  invalid.activeConversationId = conversation.id;
  assert.throws(() => validateImport(invalid), /当前对话不存在或已删除/);
  invalid.activeConversationId = deleted.activeConversationId;
  invalid.conversations.find(c => c.id === conversation.id)!.deletedAt = -1;
  assert.throws(() => validateImport(invalid), /对话删除时间/);
});

test('导入保留对话删除状态，并选中首个可见导入对话', () => {
  const deleted = fixture();
  deleted.deletedAt = 123;
  const visible = createConversation('可见');
  const current = workspace(createConversation('原有'));
  const merged = mergeImportedWorkspace(current, workspace(deleted, visible));
  assert.equal(merged.conversations[1].deletedAt, 123);
  assert.equal(merged.activeConversationId, merged.conversations[2].id);
  assert.deepEqual(validateImport(merged), merged);
});

test('网络错误、中断及未完成的正文不阻止发送，保留全部用户问题和完整答案', () => {
  const conversation = fixture();
  for (const status of ['error', 'interrupted', 'streaming'] as const) {
    conversation.messages.push(createUserMessage(`问题-${status}`), createAssistantMessage(`部分答案-${status}`, status));
  }
  conversation.messages.push(createUserMessage('继续讨论'), createAssistantMessage('后续完整答案', 'complete'));
  const context = buildMainContext(conversation, '系统提示');
  assert.deepEqual(context.map(m => m.content), ['系统提示', '原问题', '完整答案：测地线。', '问题-error', '问题-interrupted', '问题-streaming', '继续讨论', '后续完整答案']);
  const annotationContext = buildAnnotationContext(conversation, conversation.annotations[0]);
  assert.doesNotMatch(JSON.stringify(annotationContext), /部分答案/);
  assert.match(JSON.stringify(annotationContext), /问题-error/);
  assert.equal(prepareAnnotationRequest(conversation, conversation.annotations[0].id).annotation.status, 'generating');
});

test('重新生成失败时旧批注仍固定原完整版本，后续主对话忽略失败的新版本', () => {
  const conversation = fixture();
  const old = activeVersion(conversation.messages[1]);
  conversation.messages[1] = addAssistantVersion(conversation.messages[1], '失败的新回答', 'error');
  conversation.messages.push(createUserMessage('继续问'));
  assert.deepEqual(buildMainContext(conversation).map(m => m.content), ['原问题', '继续问']);
  const context = buildAnnotationContext(conversation, conversation.annotations[0]);
  assert.equal(context[1].content, old.content);
  assert.doesNotMatch(JSON.stringify(context), /失败的新回答/);
});

test('普通批注保存和编辑不产生问答上下文，保存后仍可备份、删除与恢复', () => {
  const conversation = fixture();
  const note = createAnnotation(conversation, {
    messageId: conversation.messages[1].id, versionId: conversation.messages[1].activeVersionId,
    quote: '测地线', anchor: { quote: '测地线' }, color: '#99ddff', mode: 'note', note: '草稿',
  });
  conversation.annotations.push(note);
  const saved = saveNoteAnnotation(conversation, note.id, '我的理解：最自然的路径。');
  assert.equal(conversation.annotations[1].status, 'draft');
  assert.equal(saved.annotations[1].status, 'noted');
  assert.equal(saved.annotations[1].context, undefined);
  assert.equal(saved.annotations[1].originalAnswer, undefined);
  assert.throws(() => prepareAnnotationRequest(saved, note.id), /普通批注/);
  assert.throws(() => buildAnnotationContext(saved, saved.annotations[1]), /普通批注/);
  const edited = saveNoteAnnotation(saved, note.id, '再次编辑后的笔记。');
  assert.equal(edited.annotations[1].note, '再次编辑后的笔记。');
  assert.equal(edited.annotations[1].edited, false);
  const restored = restoreAnnotation(deleteAnnotation(edited, note.id), note.id);
  assert.equal(restored.annotations[1].note, '再次编辑后的笔记。');
  assert.deepEqual(parseWorkspace(exportWorkspace(workspace(restored))), workspace(restored));
});

test('批注类型只能在未提交草稿切换，普通批注不能越过 AI 状态约束', () => {
  const conversation = fixture();
  const id = conversation.annotations[0].id;
  const noteDraft = updateAnnotationCopy(conversation, id, { mode: 'note', note: '我的笔记' });
  assert.equal(noteDraft.annotations[0].question, '');
  assert.equal(noteDraft.annotations[0].mode, 'note');
  assert.throws(() => saveNoteAnnotation(noteDraft, id, '  '), /请输入批注/);
  const askDraft = updateAnnotationCopy(noteDraft, id, { mode: 'ask', question: '改回询问' });
  assert.equal(askDraft.annotations[0].note, undefined);
  const completed = completeAnnotation(prepareAnnotationRequest(askDraft, id).conversation, id, '原回答');
  assert.throws(() => updateAnnotationCopy(completed, id, { mode: 'note' }), /不能切换/);
  assert.throws(() => saveNoteAnnotation(completed, id, '试图消耗第二次请求'), /不能保存/);
  assert.throws(() => prepareAnnotationRequest(completed, id), /已经完成一次/);
  const saved = saveNoteAnnotation(noteDraft, id, '保存的笔记');
  assert.throws(() => updateAnnotationCopy(saved, id, { mode: 'ask' }), /不能切换/);
  assert.throws(() => updateAnnotationCopy(saved, id, { note: '未通过保存' }), /通过保存批注/);
  assert.throws(() => updateAnnotationCopy(noteDraft, id, { question: '普通批注内发问' }), /只能编辑批注正文/);
  assert.throws(() => updateAnnotationCopy(conversation, id, { mode: 'invalid' } as any), /类型不受支持/);
});

test('PDF 页面可单独批注，完整附件按页作为引用上下文，空页仍可保存', () => {
  const conversation = withDocument();
  const note = createAnnotation(conversation, {
    messageId: 'page-message-1', versionId: 'page-version-1', quote: '曲率', anchor: { quote: '曲率' }, color: '#99ddff', question: '什么是曲率？',
  });
  conversation.annotations.push(note);
  const context = buildAnnotationContext(conversation, note);
  assert.equal(context[0].role, 'user');
  assert.match(context[0].content, /仅作引用资料/);
  assert.match(context[0].content, /文件名：论文.pdf/);
  assert.match(context[0].content, /第 1 页：[\s\S]*曲率/);
  assert.match(context[0].content, /第 2 页：/);
  assert.equal(context[1].content, '原问题');
  assert.deepEqual(validateImport(workspace(conversation)), workspace(conversation));
  assert.throws(() => createAnnotation(conversation, { messageId: 'page-message-2', versionId: 'page-version-2', quote: '', anchor: {}, color: '#99ddff' }), /选中一段/);
  assert.throws(() => createAnnotation(conversation, { messageId: 'page-message-1', versionId: 'page-version-2', quote: '曲率', anchor: {}, color: '#99ddff' }), /文档页面/);
});

test('PDF 备份导入重映射文件和页面 ID，批注始终关联对应页面', () => {
  const conversation = withDocument();
  const annotation = createAnnotation(conversation, {
    messageId: 'page-message-1', versionId: 'page-version-1', quote: '曲率', anchor: { id: 'page-version-1' }, color: '#99ddff', mode: 'note',
  });
  conversation.annotations.push(annotation);
  const saved = saveNoteAnnotation(conversation, annotation.id, '论文笔记');
  const mappings = new Map<string, string>();
  const callbackIds: string[] = [];
  const merged = mergeImportedWorkspace(workspace(saved), workspace(saved), (oldId, newId) => { mappings.set(oldId, newId); callbackIds.push(oldId); });
  const imported = merged.conversations[1];
  const document = imported.documents![0];
  assert.notEqual(document.id, 'document-1');
  assert.equal(mappings.get('document-1'), document.id);
  assert.equal(mappings.get('page-message-1'), document.pages[0].messageId);
  assert.equal(new Set(callbackIds).size, callbackIds.length);
  assert.notEqual(document.pages[0].messageId, 'page-message-1');
  assert.notEqual(document.pages[0].versionId, 'page-version-1');
  assert.equal(imported.annotations[1].messageId, document.pages[0].messageId);
  assert.equal(imported.annotations[1].versionId, document.pages[0].versionId);
  assert.deepEqual(imported.annotations[1].anchor, { id: document.pages[0].versionId });
  assert.deepEqual(document.pages.map(p => p.text), conversation.documents![0].pages.map(p => p.text));
  assert.deepEqual(validateImport(merged), merged);
});

test('附件导入拒绝不连续页号、重复 ID、过大文件和文本，剔除未知字段', () => {
  const invalids: Array<(w: Workspace) => void> = [
    w => { w.conversations[0].documents![0].pages[1].pageNumber = 3; },
    w => { w.conversations[0].documents![0].pages[1].messageId = 'page-message-1'; },
    w => { w.conversations[0].documents![0].pages[0].versionId = w.conversations[0].messages[1].activeVersionId; },
    w => { w.conversations[0].documents![0].size = 25 * 1024 * 1024 + 1; },
    w => { w.conversations[0].documents![0].pages = []; },
    w => { w.conversations[0].documents![0].pages[0].text = 'a'.repeat(1_000_001); },
    w => { w.conversations[0].documents![0].kind = 'docx' as any; },
    w => { w.conversations[0].documents = Array(11).fill(w.conversations[0].documents![0]); },
    w => { w.conversations[0].documents![0].pages = Array.from({ length: 301 }, (_, i) => ({ pageNumber: i + 1, text: '', messageId: `page-${i}`, versionId: `version-${i}` })); },
  ];
  for (const mutate of invalids) {
    const invalid = workspace(withDocument());
    mutate(invalid);
    assert.throws(() => validateImport(invalid), /备份格式无效/);
  }
  const unsafe = workspace(withDocument());
  (unsafe.conversations[0].documents![0] as any).bytes = 'raw-pdf-not-for-workspace';
  (unsafe.conversations[0].documents![0].pages[0] as any).apiKey = 'secret';
  assert.doesNotMatch(JSON.stringify(validateImport(unsafe)), /raw-pdf-not-for-workspace|secret/);
});

test('普通批注备份拒绝问答状态混用和非法成功状态，旧问答备份仍兼容', () => {
  const conversation = fixture();
  const id = conversation.annotations[0].id;
  const note = saveNoteAnnotation(updateAnnotationCopy(conversation, id, { mode: 'note' }), id, '正文');
  const invalids: Array<(w: any) => void> = [
    w => { w.conversations[0].annotations[0].status = 'answered'; },
    w => { w.conversations[0].annotations[0].context = []; },
    w => { w.conversations[0].annotations[0].question = '隐藏问题'; },
    w => { w.conversations[0].annotations[0].originalAnswer = '隐藏回答'; },
    w => { w.conversations[0].annotations[0].note = ''; },
    w => { delete w.conversations[0].annotations[0].mode; },
  ];
  for (const mutate of invalids) {
    const invalid = workspace(structuredClone(note));
    mutate(invalid);
    assert.throws(() => validateImport(invalid), /备份格式无效/);
  }
  assert.deepEqual(validateImport(workspace(conversation)), workspace(conversation));
});
