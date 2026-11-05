import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  activeVersion, addAssistantVersion, buildAnnotationContext, buildMainContext,
  completeAnnotation, createAnnotation, createAssistantMessage, createConversation,
  createUserMessage, createWorkspace, prepareAnnotationRequest, updateAnnotationCopy,
  validateImport, mergeImportedWorkspace, deleteAnnotation, restoreAnnotation,
} from '../src/domain/workspace';
import { exportWorkspace, loadWorkspace, parseWorkspace, saveWorkspace } from '../src/adapters/storage';
import type { Conversation, Workspace } from '../src/domain/types';

function fixture(): Conversation {
  const c = createConversation('测试对话');
  c.messages = [createUserMessage('原问题'), createAssistantMessage('原始回答包括测地线。', 'complete'), createUserMessage('接着问'), createAssistantMessage('后续完整回答。', 'complete')];
  const source = c.messages[1];
  const annotation = createAnnotation(c, {
    messageId: source.id, versionId: source.activeVersionId, quote: '测地线',
    anchor: { quote: '测地线', start: 7, end: 10 }, color: '#ffe099', question: '什么是测地线？',
  });
  c.annotations = [annotation];
  return c;
}

function asWorkspace(c: Conversation): Workspace { return { schemaVersion: 1, conversations: [c], activeConversationId: c.id }; }

test('删除和撤销保留问答、颜色、锚点与版本，并且不恢复第二次提问资格', () => {
  const c = fixture();
  const id = c.annotations[0].id;
  const completed = completeAnnotation(prepareAnnotationRequest(c, id).conversation, id, '已回答的原稿');
  const deleted = deleteAnnotation(completed, id);
  assert.equal(completed.annotations[0].deletedAt, undefined);
  assert.equal(typeof deleted.annotations[0].deletedAt, 'number');
  assert.deepEqual(deleted.messages, completed.messages);
  assert.throws(() => prepareAnnotationRequest(deleted, id), /已删除/);
  assert.throws(() => updateAnnotationCopy(deleted, id, { answer: '隐藏后不能编辑' }), /已删除/);
  const restored = restoreAnnotation(deleted, id);
  for (const key of ['id', 'versionId', 'messageId', 'quote', 'anchor', 'color', 'question', 'answer', 'originalQuestion', 'originalAnswer', 'context', 'status'] as const) {
    assert.deepEqual(restored.annotations[0][key], completed.annotations[0][key]);
  }
  assert.equal(restored.annotations[0].deletedAt, undefined);
  assert.throws(() => prepareAnnotationRequest(restored, id), /已经完成一次/);
});

test('删除持久化及备份导入仍保持隐藏；可独立恢复原批注', async () => {
  const c = fixture();
  const id = c.annotations[0].id;
  const deleted = asWorkspace(deleteAnnotation(c, id));
  await saveWorkspace(deleted);
  const reloaded = await loadWorkspace();
  assert.equal(reloaded.conversations[0].annotations[0].deletedAt, deleted.conversations[0].annotations[0].deletedAt);
  const roundTrip = parseWorkspace(exportWorkspace(deleted));
  const imported = mergeImportedWorkspace(createWorkspace(), roundTrip).conversations.at(-1)!;
  assert.notEqual(imported.annotations[0].id, id);
  assert.equal(imported.annotations[0].deletedAt, c.annotations[0].deletedAt ?? deleted.conversations[0].annotations[0].deletedAt);
  assert.equal(restoreAnnotation(imported, imported.annotations[0].id).annotations[0].deletedAt, undefined);
  const invalid = structuredClone(deleted);
  invalid.conversations[0].annotations[0].deletedAt = -1;
  assert.throws(() => validateImport(invalid), /删除时间/);
});

test('生成中的批注禁止删除，未提交的草稿仍可删除和恢复', () => {
  const c = fixture();
  const id = c.annotations[0].id;
  assert.throws(() => deleteAnnotation(prepareAnnotationRequest(c, id).conversation, id), /回答完成/);
  const deleted = deleteAnnotation(c, id);
  const restored = restoreAnnotation(deleted, id);
  assert.equal(prepareAnnotationRequest(restored, id).annotation.status, 'generating');
});

test('欢迎工作区含明确标记的中文演示', () => {
  const w = createWorkspace();
  assert.equal(w.schemaVersion, 1);
  assert.equal(w.conversations[0].messages[1].versions[0].status, 'complete');
  assert.match(w.conversations[0].messages[1].versions[0].content, /体验示例/);
  assert.deepEqual(validateImport(w), w);
});

test('批注上下文使用全部主对话，并排除其他批注', () => {
  const c = fixture();
  c.annotations.push({ ...c.annotations[0], id: 'sibling', question: '不应出现的兄弟问题', answer: '不应出现的兄弟回答' });
  const main = buildMainContext(c, '系统指令');
  assert.deepEqual(main.map(m => m.content), ['系统指令', '原问题', '原始回答包括测地线。', '接着问', '后续完整回答。']);
  const context = buildAnnotationContext(c, c.annotations[0], '系统指令');
  assert.equal(context.length, 6);
  assert.match(context.at(-1)!.content, /测地线/);
  assert.match(context.at(-1)!.content, /什么是测地线/);
  assert.doesNotMatch(JSON.stringify(context), /不应出现/);
});

test('重新生成保留旧版本，新版本不继承批注，批注问题固定来源版本', () => {
  const c = fixture();
  const oldMessage = c.messages[1];
  const oldVersion = activeVersion(oldMessage);
  c.messages[1] = addAssistantVersion(oldMessage, '重生成的新回答', 'complete');
  assert.deepEqual(c.messages[1].versions[0], oldVersion);
  assert.notEqual(c.messages[1].activeVersionId, oldVersion.id);
  assert.equal(c.annotations.filter(a => a.versionId === c.messages[1].activeVersionId).length, 0);
  assert.equal(c.annotations.filter(a => a.versionId === oldVersion.id).length, 1);
  assert.equal(buildMainContext(c)[1].content, '重生成的新回答');
  assert.equal(buildAnnotationContext(c, c.annotations[0])[1].content, oldVersion.content);
});

test('只允许一次成功批注问答，修改副本不触发第二次请求', () => {
  const c = fixture();
  const prepared = prepareAnnotationRequest(c, c.annotations[0].id);
  assert.equal(prepared.annotation.status, 'generating');
  assert.throws(() => prepareAnnotationRequest(prepared.conversation, prepared.annotation.id), /正在回答/);
  const complete = completeAnnotation(prepared.conversation, prepared.annotation.id, '它是自然路径。');
  assert.equal(complete.annotations[0].status, 'answered');
  const edited = updateAnnotationCopy(complete, prepared.annotation.id, { answer: '我的理解：自然路径。', question: '修改后的问题' });
  assert.equal(edited.annotations[0].originalAnswer, '它是自然路径。');
  assert.equal(edited.annotations[0].originalQuestion, '什么是测地线？');
  assert.equal(edited.annotations[0].edited, true);
  assert.throws(() => prepareAnnotationRequest(edited, prepared.annotation.id), /已经完成一次/);
  assert.deepEqual(validateImport(asWorkspace(edited)), asWorkspace(edited));
});

test('失败后重试沿用第一次完整上下文快照', () => {
  const c = fixture();
  const prepared = prepareAnnotationRequest(c, c.annotations[0].id, '原系统提示');
  const failed = prepared.conversation;
  failed.annotations[0] = { ...failed.annotations[0], status: 'error', error: '网络失败' };
  failed.messages.push(createUserMessage('失败以后才新增的问题'));
  const retried = prepareAnnotationRequest(failed, prepared.annotation.id, '新系统提示');
  assert.deepEqual(retried.messages, prepared.messages);
  assert.doesNotMatch(JSON.stringify(retried.messages), /失败以后/);
  assert.equal(retried.annotation.error, undefined);
});

test('备份往返保存所有原回答版本和批注，剔除未知 API 配置', () => {
  const c = fixture();
  c.messages[1] = addAssistantVersion(c.messages[1], '新版本', 'complete');
  const w = asWorkspace(c);
  assert.deepEqual(parseWorkspace(exportWorkspace(w)), w);
  const unsafe = { ...w, apiKey: 'not-to-retain', modelSettings: { apiKey: 'also-not-to-retain' } };
  const result = validateImport(unsafe);
  assert.equal('apiKey' in result, false);
  assert.equal('modelSettings' in result, false);
  assert.doesNotMatch(JSON.stringify(result), /not-to-retain/);
});

test('导入拒绝无效引用、重复 ID、未知角色、未知状态和不完整版本', () => {
  const invalids: Array<(w: any) => void> = [
    w => { w.activeConversationId = 'missing'; },
    w => { w.conversations[0].annotations[0].versionId = 'missing'; },
    w => { w.conversations[0].annotations[0].conversationId = 'another'; },
    w => { w.conversations[0].messages[1].id = w.conversations[0].messages[0].id; },
    w => { w.conversations[0].messages[0].role = 'system'; },
    w => { w.conversations[0].messages[0].versions[0].status = 'unknown'; },
    w => { delete w.conversations[0].messages[0].versions[0].createdAt; },
    w => { w.conversations[0].messages[0].activeVersionId = 'missing'; },
    w => { w.conversations[0].annotations[0].status = 'answered'; },
  ];
  for (const mutate of invalids) {
    const w = structuredClone(asWorkspace(fixture()));
    mutate(w);
    assert.throws(() => validateImport(w), /备份格式无效/);
  }
  assert.throws(() => parseWorkspace('{broken'), /JSON/);
});

test('导入把运行中的主回答与批注恢复为已中断，不自动续费请求', () => {
  const c = fixture();
  const prepared = prepareAnnotationRequest(c, c.annotations[0].id).conversation;
  prepared.messages.push(createAssistantMessage('部分正文', 'streaming'));
  const restored = parseWorkspace(JSON.stringify(asWorkspace(prepared)));
  assert.equal(restored.conversations[0].annotations[0].status, 'interrupted');
  assert.equal(activeVersion(restored.conversations[0].messages.at(-1)!).status, 'interrupted');
  const context = buildMainContext(restored.conversations[0]);
  assert.doesNotMatch(JSON.stringify(context), /部分正文/);
  assert.equal(context.at(-1)?.content, '后续完整回答。');
});

test('Dexie 首次载入欢迎对话并能保存重载；原对象不被改变', async () => {
  const initial = await loadWorkspace();
  assert.ok(initial.conversations.length);
  const w = asWorkspace(fixture());
  await saveWorkspace(w);
  const loaded = await loadWorkspace();
  assert.deepEqual(loaded, w);
  await saveWorkspace({ ...w, apiKey: 'never-store-this' } as Workspace);
  assert.equal('apiKey' in await loadWorkspace(), false);
  const running = asWorkspace(prepareAnnotationRequest(w.conversations[0], w.conversations[0].annotations[0].id).conversation);
  await saveWorkspace(running);
  assert.equal(running.conversations[0].annotations[0].status, 'generating');
  assert.equal((await loadWorkspace()).conversations[0].annotations[0].status, 'interrupted');
});

test('导入作为独立新对话追加，重映射全部 ID 和原文锚点', () => {
  const current = asWorkspace(fixture());
  const imported = structuredClone(current);
  const oldAnnotation = imported.conversations[0].annotations[0];
  oldAnnotation.anchor = { id: oldAnnotation.id, target: { id: oldAnnotation.versionId }, quote: oldAnnotation.quote };
  const merged = mergeImportedWorkspace(current, imported);
  assert.equal(merged.conversations.length, 2);
  assert.deepEqual(merged.conversations[0], current.conversations[0]);
  const added = merged.conversations[1];
  assert.equal(merged.activeConversationId, added.id);
  assert.notEqual(added.id, current.activeConversationId);
  assert.match(added.title, /（导入）$/);
  assert.notEqual(added.messages[1].id, current.conversations[0].messages[1].id);
  assert.equal(added.annotations[0].conversationId, added.id);
  assert.equal(added.annotations[0].messageId, added.messages[1].id);
  assert.equal(added.annotations[0].versionId, added.messages[1].activeVersionId);
  assert.deepEqual(added.annotations[0].anchor, { id: added.annotations[0].id, target: { id: added.messages[1].activeVersionId }, quote: oldAnnotation.quote });
  assert.deepEqual(validateImport(merged), merged);
});
