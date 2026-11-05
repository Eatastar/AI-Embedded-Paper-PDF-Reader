import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceSession } from '../src/adapters/workspace-session';
import { assertWorkspaceCapacity, jsonBytes } from '../src/domain/capacity';
import { createAssistantMessage, createConversation, createWorkspace, validateImport } from '../src/domain/workspace';
import type { Workspace } from '../src/domain/types';

function harness(save: (value: Workspace) => Promise<void> = async () => {}) {
  const statuses: string[] = [], changes: Workspace[] = [];
  const session = new WorkspaceSession({ save, onChange: value => changes.push(value), onStatus: status => statuses.push(status) });
  session.load(createWorkspace());
  return { session, statuses, changes };
}

test('第 1001 条对话在改变界面或排队写入之前被拒绝，删除记录计入容量', async () => {
  let writes = 0;
  const { session, changes } = harness(async () => { writes++; });
  const conversations = Array.from({ length: 1000 }, () => createConversation());
  conversations[1].deletedAt = Date.now();
  session.load({ schemaVersion: 1, conversations, activeConversationId: conversations[0].id });
  const before = session.value;
  assert.throws(() => session.update(value => ({ ...value, conversations: [...value.conversations, createConversation()] })), /最多 1,000 条/);
  assert.equal(session.value, before);
  assert.equal(changes.at(-1), before);
  await session.flush(); assert.equal(writes, 0);
  session.dispose();
});

test('写入期间产生新修改，退出屏障要等最后一版也提交成功', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const writes: Workspace[] = [];
  const { session, statuses } = harness(async value => { writes.push(value); if (writes.length === 1) await gate; });
  const first = session.update(value => ({ ...value, conversations: value.conversations.map(c => ({ ...c, title: '第一版' })) }));
  let done = false;
  const flushing = session.flush().then(() => { done = true; });
  await new Promise(resolve => setImmediate(resolve));
  const last = session.update(value => ({ ...value, conversations: value.conversations.map(c => ({ ...c, title: '最后一版' })) }));
  assert.equal(done, false); assert.equal(writes.length, 1);
  release(); await flushing;
  assert.deepEqual(writes, [first, last]);
  assert.equal(session.savedRevision, session.revision);
  assert.equal(statuses.at(-1), '已保存在本机');
  session.dispose();
});

test('保存失败可被退出屏障观察到，修改仍保留，重试会再次写入', async () => {
  let calls = 0;
  const { session, statuses } = harness(async () => { if (++calls === 1) throw new Error('disk-full'); });
  const next = session.update(value => ({ ...value, conversations: value.conversations.map(c => ({ ...c, title: '尚未保存的修改' })) }));
  await assert.rejects(session.flush(), /disk-full/);
  assert.equal(session.value, next); assert.notEqual(session.savedRevision, session.revision);
  assert.equal(statuses.at(-1), '保存失败，请先导出备份');
  await session.flush(); assert.equal(calls, 2); assert.equal(session.savedRevision, session.revision);
  session.dispose();
});

test('实时流保持 generating/streaming，保存副本按旧格式转为 interrupted', async () => {
  let saved: Workspace | undefined;
  const { session } = harness(async value => { saved = validateImport(value); });
  session.update(value => ({ ...value, conversations: value.conversations.map(c => ({ ...c, messages: [createAssistantMessage('进行中')] })) }));
  await session.flush();
  assert.equal(session.value!.conversations[0].messages[0].versions[0].status, 'streaming');
  assert.equal(saved!.conversations[0].messages[0].versions[0].status, 'interrupted');
  session.dispose();
});

test('统一检查消息、版本、批注和上下文数量，不只检查对话数量', () => {
  const source = createWorkspace(), c = source.conversations[0], message = createAssistantMessage('正文', 'complete');
  assert.throws(() => assertWorkspaceCapacity({ ...source, conversations: [{ ...c, messages: Array(10001).fill(message) }] }), /消息最多/);
  assert.throws(() => assertWorkspaceCapacity({ ...source, conversations: [{ ...c, messages: [{ ...message, versions: Array(1001).fill(message.versions[0]) }] }] }), /版本最多/);
  assert.throws(() => assertWorkspaceCapacity({ ...source, conversations: [{ ...c, annotations: Array(10001).fill({}) }] }), /批注.*最多/);
  assert.throws(() => assertWorkspaceCapacity({ ...source, conversations: [{ ...c, annotations: [{ context: Array(10013).fill({ role: 'user', content: 'text' }) } as any] }] }), /上下文最多/);
});

test('流式文字超限保留上一个合法快照', () => {
  const { session } = harness();
  const before = session.value;
  assert.throws(() => session.update(value => ({ ...value, conversations: value.conversations.map(c => ({ ...c, messages: [createAssistantMessage('a'.repeat(2_000_001))] })) })), /200 万/);
  assert.equal(session.value, before); session.dispose();
});

test('JSON 容量按真实 UTF-8、转义字符计算，并包含附件 base64 的体积', () => {
  const object = { chinese: '中文', escaped: '\n\r\t"\\', unicode: '😀', items: [1, true, null], omit: undefined };
  assert.equal(jsonBytes(object), Buffer.byteLength(JSON.stringify(object)));
  const source = createWorkspace(), c = source.conversations[0];
  const document = { id: 'doc', name: 'large.pdf', kind: 'pdf' as const, mimeType: 'application/pdf', size: 25 * 1024 * 1024, createdAt: 1, pages: [{ pageNumber: 1, text: 'x'.repeat(500_000), messageId: 'page', versionId: 'version' }] };
  assert.throws(() => assertWorkspaceCapacity({ ...source, conversations: [{ ...c, documents: Array.from({ length: 10 }, (_, i) => ({ ...document, id: `doc-${i}` })) }] }), /350 MB/);
});
