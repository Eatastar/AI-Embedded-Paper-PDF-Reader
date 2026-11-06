import test from 'node:test';
import assert from 'node:assert/strict';
import { changeAnnotationReask, completeAnnotation, createAnnotation, createAssistantMessage, createConversation, createUserMessage, deleteAnnotation, deleteConversation, prepareAnnotationRequest, updateAnnotationCopy, updateAnnotationRequest, validateImport } from '../src/domain/workspace';
import { isAnnotationGenerating } from '../src/domain/annotation-state';
import type { Conversation, Workspace } from '../src/domain/types';

function fixture() {
  const c = createConversation('重新提问测试'), message = createAssistantMessage('原文：时空曲率。', 'complete');
  c.messages = [createUserMessage('原主问题'), message];
  const annotation = createAnnotation(c, { messageId: message.id, versionId: message.activeVersionId, quote: '时空曲率', anchor: { quote: '时空曲率' }, color: '#ffe099', question: '第一次问题' });
  c.annotations = [annotation];
  const completed = completeAnnotation(prepareAnnotationRequest(c, annotation.id, '原系统规则').conversation, annotation.id, '第一次完整回答');
  return { c: completed, id: annotation.id };
}
const workspace = (c: Conversation): Workspace => ({ schemaVersion: 1, conversations: [c], activeConversationId: c.id });
const currentExchange = (c: Conversation) => { const { reask: _pending, updatedAt: _time, ...current } = c.annotations[0]; return current; };

test('重新提问保留高亮和原问答，只有新回答成功后才替换', () => {
  const { c, id } = fixture(), original = currentExchange(c);
  let next = changeAnnotationReask(c, id, 'start');
  assert.deepEqual(currentExchange(next), original);
  next = changeAnnotationReask(next, id, 'edit', '新的问题是什么？');
  const prepared = prepareAnnotationRequest(next, id, '新系统规则');
  next = updateAnnotationRequest(prepared.conversation, id, '新的部分文字');
  assert.deepEqual(currentExchange(next), original); assert.equal(isAnnotationGenerating(next.annotations[0]), true);
  next = completeAnnotation(next, id, '新的完整回答');
  const a = next.annotations[0];
  for (const key of ['id', 'messageId', 'versionId', 'quote', 'anchor', 'color', 'createdAt'] as const) assert.deepEqual(a[key], c.annotations[0][key]);
  assert.equal(a.question, '新的问题是什么？'); assert.equal(a.originalQuestion, a.question);
  assert.equal(a.answer, '新的完整回答'); assert.equal(a.originalAnswer, a.answer); assert.equal(a.edited, false);
  assert.equal(a.reask, undefined); assert.equal(a.context, undefined); assert.equal(a.requestPreference, undefined);
  assert.deepEqual(validateImport(workspace(next)), workspace(next));
});

test('新提问只采用绑定原文，不附带主聊天或旧批注问答；每次尝试独立冻结设置', () => {
  const { c, id } = fixture();
  const current = { ...c, messages: [...c.messages, createUserMessage('后续主问题'), createAssistantMessage('后续主回答', 'complete')] };
  let draft = changeAnnotationReask(current, id, 'start'); draft = changeAnnotationReask(draft, id, 'edit', '换一个问题');
  const first = prepareAnnotationRequest(draft, id, '新偏好');
  assert.doesNotMatch(JSON.stringify(first.messages), /后续主问题|后续主回答/);
  assert.ok(first.messages.at(-1)!.content.includes('换一个问题'));
  assert.equal(first.messages.some(m => m.content.includes('第一次完整回答') || m.content.includes('第一次问题')), false);
  const failed = updateAnnotationRequest(first.conversation, id, '残文', { error: '连接中断', interrupted: false });
  const changed = { ...failed, messages: [...failed.messages, createUserMessage('重试前新增的主问题')] };
  const retry = prepareAnnotationRequest(changed, id, '再次改偏好');
  assert.deepEqual(retry.messages, first.messages);
  const stopped = updateAnnotationRequest(retry.conversation, id, '', { error: '停止', interrupted: true });
  const editing = changeAnnotationReask(stopped, id, 'edit');
  const fresh = prepareAnnotationRequest(editing, id, '再次改偏好');
  assert.doesNotMatch(JSON.stringify(fresh.messages), /重试前新增的主问题/);
  assert.equal(fresh.messages[0].content, '再次改偏好');
});

test('失败和停止不覆盖手工编辑过的原问答，取消尝试可原样返回', () => {
  const base = fixture();
  const c = updateAnnotationCopy(base.c, base.id, { question: '手工修改的问题', answer: '手工修改的回答' });
  const original = currentExchange(c);
  for (const interrupted of [false, true]) {
    const running = prepareAnnotationRequest(changeAnnotationReask(c, base.id, 'start'), base.id).conversation;
    const failed = updateAnnotationRequest(running, base.id, '部分新回答', { interrupted, error: '模拟失败' });
    assert.deepEqual(currentExchange(failed), original);
    const cancelled = changeAnnotationReask(failed, base.id, 'cancel');
    assert.deepEqual(currentExchange(cancelled), original); assert.equal(cancelled.annotations[0].reask, undefined);
    assert.deepEqual(validateImport(workspace(cancelled)), workspace(cancelled));
  }
});

test('生成中保存重开会保留原成功问答，并把新尝试转为可重试的中断', () => {
  const { c, id } = fixture();
  const prepared = prepareAnnotationRequest(changeAnnotationReask(c, id, 'start'), id);
  const progress = updateAnnotationRequest(prepared.conversation, id, '新回答前半段');
  const reloaded = validateImport(workspace(progress)).conversations[0];
  assert.equal(reloaded.annotations[0].status, 'answered'); assert.equal(reloaded.annotations[0].reask!.status, 'interrupted');
  assert.equal(reloaded.annotations[0].answer, '第一次完整回答'); assert.equal(reloaded.annotations[0].reask!.answer, '新回答前半段');
  assert.deepEqual(prepareAnnotationRequest(reloaded, id).messages, prepared.messages);
});

test('可多次替换，每处高亮始终只有一组成功问答，不累计问答历史', () => {
  let { c, id } = fixture();
  for (let i = 1; i <= 5; i++) {
    c = changeAnnotationReask(changeAnnotationReask(c, id, 'start'), id, 'edit', `新问题 ${i}`);
    c = completeAnnotation(prepareAnnotationRequest(c, id).conversation, id, `新回答 ${i}`);
    assert.equal(c.annotations.length, 1); assert.equal(c.annotations[0].answer, `新回答 ${i}`);
    assert.equal(c.annotations[0].originalAnswer, `新回答 ${i}`); assert.equal(c.annotations[0].reask, undefined);
  }
});

test('生成中不能取消、重复提交或删除，普通笔记和未完成首问不能绕过规则', () => {
  const { c, id } = fixture();
  const running = prepareAnnotationRequest(changeAnnotationReask(c, id, 'start'), id).conversation;
  assert.throws(() => changeAnnotationReask(running, id, 'cancel'), /先停止/);
  assert.throws(() => prepareAnnotationRequest(running, id), /正在回答/);
  assert.throws(() => deleteAnnotation(running, id), /完成后再删除/);
  assert.throws(() => deleteConversation(workspace(running), c.id), /先停止/);
  assert.throws(() => updateAnnotationCopy(running, id, { answer: '不能改旧回答' }), /完成或取消/);
  const invalid = { ...c, annotations: c.annotations.map(a => ({ ...a, mode: 'note' as const })) };
  assert.throws(() => changeAnnotationReask(invalid, id, 'start'), /已完成/);
  const notDone = { ...c, annotations: c.annotations.map(a => ({ ...a, status: 'draft' as const })) };
  assert.throws(() => changeAnnotationReask(notDone, id, 'start'), /已完成/);
});

test('重试前不能改冻结的问题，选择修改问题才会建立新的尝试', () => {
  const { c, id } = fixture();
  const running = prepareAnnotationRequest(changeAnnotationReask(c, id, 'start'), id).conversation;
  const failed = updateAnnotationRequest(running, id, '残文', { error: '超时', interrupted: false });
  assert.throws(() => changeAnnotationReask(failed, id, 'edit', '直接改冻结问题'), /先选择修改问题/);
  const draft = changeAnnotationReask(failed, id, 'edit');
  assert.equal(draft.annotations[0].reask!.context, undefined); assert.equal(draft.annotations[0].reask!.answer, '');
  assert.equal(changeAnnotationReask(draft, id, 'edit', '另一个问题').annotations[0].reask!.question, '另一个问题');
});

test('备份拒绝无原问答的重新提问、非法状态和缺失上下文，剔除额外配置字段', () => {
  const { c, id } = fixture();
  const source = workspace(changeAnnotationReask(c, id, 'start'));
  for (const mutate of [
    (a: any) => { a.mode = 'note'; }, (a: any) => { a.status = 'draft'; },
    (a: any) => { a.reask.status = 'answered'; }, (a: any) => { a.reask.answer = '草稿不能有结果'; },
    (a: any) => { a.reask.context = []; }, (a: any) => { a.reask.status = 'error'; },
    (a: any) => { a.reask.status = 'interrupted'; a.reask.context = []; },
  ]) {
    const bad = structuredClone(source); mutate(bad.conversations[0].annotations[0]); assert.throws(() => validateImport(bad), /备份格式无效/);
  }
  const extra = structuredClone(source) as any; extra.conversations[0].annotations[0].reask.apiKey = 'never-backup-test-key';
  assert.doesNotMatch(JSON.stringify(validateImport(extra)), /never-backup-test-key|apiKey/);
});
