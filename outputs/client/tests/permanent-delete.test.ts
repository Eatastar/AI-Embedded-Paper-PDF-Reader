import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { createAnnotation, createAssistantMessage, createConversation, deleteAnnotation, deleteConversation, makeId, restoreAnnotation, restoreConversation, validateImport } from '../src/domain/workspace';
import { permanentlyDelete } from '../src/domain/trash';
import { WorkspaceSession } from '../src/adapters/workspace-session';
import { exportWorkspaceWithFiles, getDocumentBytes, loadWorkspace, saveDocumentBytes, saveWorkspace, saveWorkspaceAndPruneFiles } from '../src/adapters/storage';
import type { Conversation, Workspace } from '../src/domain/types';

const audit = new Dexie('margin-chat-workspace');
audit.version(1).stores({ workspaces: 'id' }); audit.version(2).stores({ workspaces: 'id', documents: 'id' });
after(() => audit.close());
const bytes = new TextEncoder().encode('%PDF-1.7\nsynthetic file\n');
function conversation(title: string): Conversation {
  const c = createConversation(title), message = createAssistantMessage('可批注原文', 'complete'); c.messages = [message];
  const page = { pageNumber: 1, text: '附件正文', messageId: makeId(), versionId: makeId() };
  c.documents = [{ id: makeId(), kind: 'pdf', mimeType: 'application/pdf', size: bytes.length, name: title + '.pdf', pages: [page], createdAt: 1 }];
  c.annotations = [createAnnotation(c, { messageId: message.id, versionId: message.activeVersionId, quote: '原文', anchor: {}, color: '#ffe099', mode: 'note', note: '这条普通批注' })];
  return c;
}
async function fixture() {
  const kept = conversation('保留对话'), removed = conversation('删除对话');
  const base: Workspace = { schemaVersion: 1, conversations: [kept, removed], activeConversationId: kept.id };
  for (const c of base.conversations) await saveDocumentBytes(c.documents![0].id, bytes);
  const workspace = deleteConversation(base, removed.id); await saveWorkspace(workspace);
  return { workspace, kept, removed };
}

test('只能永久删除回收站里的记录，正常对话和批注不会被误删', async () => {
  const { workspace, kept } = await fixture();
  assert.throws(() => permanentlyDelete(workspace, { kind: 'conversation', id: kept.id }), /先将.*对话移入/);
  assert.throws(() => permanentlyDelete(workspace, { kind: 'annotation', conversationId: kept.id, id: kept.annotations[0].id }), /先将.*批注移入/);
  assert.throws(() => permanentlyDelete(workspace, { kind: 'conversation', id: 'missing' }), /先将/);
  assert.deepEqual(await loadWorkspace(), validateImport(workspace));
});

test('永久删除对话实际移除消息、批注和附件字节，不改变保留对话', async () => {
  const { workspace, kept, removed } = await fixture();
  const next = permanentlyDelete(workspace, { kind: 'conversation', id: removed.id });
  await saveWorkspaceAndPruneFiles(next, workspace);
  assert.deepEqual((await loadWorkspace()).conversations, [kept]);
  assert.equal(await getDocumentBytes(removed.documents![0].id), undefined);
  assert.deepEqual(await getDocumentBytes(kept.documents![0].id), bytes);
  assert.throws(() => restoreConversation(next, removed.id), /不存在/);
  assert.doesNotMatch(await exportWorkspaceWithFiles(next), new RegExp(removed.id));
});

test('永久删除单条批注不删除其原文、同页其他批注或附件', async () => {
  const { workspace, kept } = await fixture();
  const second = { ...kept.annotations[0], id: makeId(), question: '', color: '#b7ddba' };
  const withNotes = { ...workspace, conversations: workspace.conversations.map(c => c.id === kept.id ? { ...c, annotations: [...c.annotations, second] } : c) };
  const hidden = { ...withNotes, conversations: withNotes.conversations.map(c => c.id === kept.id ? deleteAnnotation(c, kept.annotations[0].id) : c) };
  await saveWorkspace(hidden);
  const next = permanentlyDelete(hidden, { kind: 'annotation', conversationId: kept.id, id: kept.annotations[0].id });
  await saveWorkspaceAndPruneFiles(next, hidden);
  const current = (await loadWorkspace()).conversations[0];
  assert.equal(current.annotations.length, 1); assert.equal(current.annotations[0].id, second.id);
  assert.deepEqual(current.messages, kept.messages); assert.deepEqual(current.documents, kept.documents);
  assert.deepEqual(await getDocumentBytes(kept.documents![0].id), bytes);
  assert.throws(() => restoreAnnotation(current, kept.annotations[0].id), /不存在/);
});

test('清空回收站只清理已删除记录，保留当前对话和其正常附件', async () => {
  const { workspace, kept, removed } = await fixture();
  const hidden = { ...workspace, conversations: workspace.conversations.map(c => c.id === kept.id ? deleteAnnotation(c, kept.annotations[0].id) : c) };
  const next = permanentlyDelete(hidden, { kind: 'all' });
  await saveWorkspaceAndPruneFiles(next, hidden);
  const current = await loadWorkspace();
  assert.equal(current.activeConversationId, kept.id); assert.equal(current.conversations.length, 1); assert.equal(current.conversations[0].annotations.length, 0);
  assert.equal(await getDocumentBytes(removed.documents![0].id), undefined); assert.deepEqual(await getDocumentBytes(kept.documents![0].id), bytes);
});

test('附件删除中途失败会回滚元数据与此前文件删除，回收站原条目仍存在', async () => {
  const { workspace, kept, removed } = await fixture();
  const extra = { ...removed.documents![0], id: makeId(), pages: removed.documents![0].pages.map(p => ({ ...p, messageId: makeId(), versionId: makeId() })) };
  const before = { ...workspace, conversations: workspace.conversations.map(c => c.id === removed.id ? { ...c, documents: [...c.documents!, extra] } : c) };
  await saveDocumentBytes(extra.id, bytes); await saveWorkspace(before);
  const originalDelete = IDBObjectStore.prototype.delete;
  IDBObjectStore.prototype.delete = function(key: IDBValidKey | IDBKeyRange) {
    if (this.name === 'documents' && key === extra.id) throw new DOMException('simulated deletion failure', 'UnknownError');
    return originalDelete.call(this, key);
  };
  try { await assert.rejects(saveWorkspaceAndPruneFiles(permanentlyDelete(before, { kind: 'conversation', id: removed.id }), before), /simulated deletion failure/); }
  finally { IDBObjectStore.prototype.delete = originalDelete; }
  assert.deepEqual(await loadWorkspace(), validateImport(before));
  for (const id of [removed.documents![0].id, extra.id, kept.documents![0].id]) assert.deepEqual(await getDocumentBytes(id), bytes);
});

test('永久删除等待旧保存完成；随后排队的保存不能复活已删记录和文件', async () => {
  const { workspace, removed } = await fixture();
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let saves = 0; const changes: Workspace[] = [];
  const session = new WorkspaceSession({ save: async value => { saves++; if (saves === 1) await gate; await saveWorkspace(value); }, onChange: value => changes.push(value), onStatus() {} });
  session.load(workspace);
  session.update(value => ({ ...value, conversations: value.conversations.map(c => ({ ...c, title: c.title + '（更新）' })) }));
  const saving = session.flush(); await new Promise(resolve => setImmediate(resolve));
  const purging = session.commit(value => permanentlyDelete(value, { kind: 'conversation', id: removed.id }), saveWorkspaceAndPruneFiles);
  assert.throws(() => session.update(value => value), /清理回收站/);
  const trailingSave = session.flush();
  assert.ok(changes.at(-1)!.conversations.some(c => c.id === removed.id), '数据库确认前保留旧界面');
  release(); await Promise.all([saving, purging, trailingSave]);
  assert.equal((await loadWorkspace()).conversations.some(c => c.id === removed.id), false);
  assert.equal(session.value!.conversations.some(c => c.id === removed.id), false);
  assert.equal(await getDocumentBytes(removed.documents![0].id), undefined);
  assert.equal(saves, 1); session.dispose();
});

test('永久删除提交失败时界面与保存队列仍保持原记录，之后可以重新操作', async () => {
  const { workspace, removed } = await fixture(); const changes: Workspace[] = [];
  const session = new WorkspaceSession({ save: saveWorkspace, onChange: value => changes.push(value), onStatus() {} }); session.load(workspace);
  await assert.rejects(session.commit(value => permanentlyDelete(value, { kind: 'conversation', id: removed.id }), async () => { throw new Error('disk blocked'); }), /disk blocked/);
  assert.equal(session.value, workspace); assert.equal(changes.length, 1); assert.deepEqual(await loadWorkspace(), validateImport(workspace));
  await session.commit(value => permanentlyDelete(value, { kind: 'conversation', id: removed.id }), saveWorkspaceAndPruneFiles);
  await session.flush(); assert.equal((await loadWorkspace()).conversations.some(c => c.id === removed.id), false); session.dispose();
});
