import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {
  exportWorkspace, exportWorkspaceWithFiles, getDocumentBytes, importWorkspaceWithFiles,
  loadWorkspace, restoreWorkspaceWithFiles, saveDocumentBytes, saveWorkspace,
} from '../src/adapters/storage';
import { createAnnotation, createConversation, deleteConversation, makeId, saveNoteAnnotation, validateImport } from '../src/domain/workspace';
import type { Conversation, Workspace } from '../src/domain/types';

const auditDatabase = new Dexie('margin-chat-workspace');
auditDatabase.version(1).stores({ workspaces: 'id' });
auditDatabase.version(2).stores({ workspaces: 'id', documents: 'id' });
after(() => auditDatabase.close());

function workspace(conversation = createConversation('已有对话')): Workspace {
  return { schemaVersion: 1, conversations: [conversation], activeConversationId: conversation.id };
}

function fixture(): { workspace: Workspace; bytes: Uint8Array } {
  const conversation = createConversation('论文与普通批注');
  const bytes = new Uint8Array([...new TextEncoder().encode('%PDF-1.7\noriginal paper\n'), 0, 1, 254, 255]);
  const page = { pageNumber: 1, text: '论文第一页：曲率和测地线。', messageId: makeId(), versionId: makeId() };
  conversation.documents = [{ id: makeId(), name: 'paper.pdf', kind: 'pdf', mimeType: 'application/pdf', size: bytes.length, createdAt: 123, pages: [page] }];
  const annotation = createAnnotation(conversation, { messageId: page.messageId, versionId: page.versionId, quote: '测地线', anchor: { id: page.versionId, quote: '测地线' }, color: '#ffe099', mode: 'note' });
  conversation.annotations = [annotation];
  return { workspace: workspace(saveNoteAnnotation(conversation, annotation.id, '我自己的论文笔记。')), bytes };
}

function countFiles() { return auditDatabase.table('documents').count(); }

test('首次打开会先提交初始记录，再显示为已保存', async () => {
  await auditDatabase.table('workspaces').delete('current');
  const loaded = await loadWorkspace();
  const persisted = await auditDatabase.table('workspaces').get('current');
  assert.deepEqual(persisted.workspace, loaded);
});

test('读取失败后完整恢复在同一事务写入元数据和附件，并保留原始记录副本', async () => {
  const source = fixture(), document = source.workspace.conversations[0].documents![0];
  await saveDocumentBytes(document.id, source.bytes);
  const backup = await exportWorkspaceWithFiles(source.workspace);
  const corrupt = { schemaVersion: 999, conversations: ['unreadable-original-record'] };
  await auditDatabase.table('workspaces').put({ id: 'current', workspace: corrupt });
  await auditDatabase.table('documents').delete(document.id);
  await assert.rejects(loadWorkspace(), /备份格式无效/);
  const restored = await restoreWorkspaceWithFiles(backup);
  assert.deepEqual(await loadWorkspace(), restored);
  assert.deepEqual(await getDocumentBytes(document.id), source.bytes);
  const archives = (await auditDatabase.table('workspaces').toArray()).filter(row => row.id.startsWith('recovery-archive-'));
  assert.ok(archives.some(row => JSON.stringify(row.workspace) === JSON.stringify(corrupt)));
});

test('恢复途中附件写入失败会回滚整笔事务，当前记录、旧附件和存档均不改变', async () => {
  const source = fixture(), first = source.workspace.conversations[0].documents![0];
  const second = { ...first, id: makeId(), pages: first.pages.map(page => ({ ...page, messageId: makeId(), versionId: makeId() })) };
  source.workspace.conversations[0].documents!.push(second);
  await saveDocumentBytes(first.id, source.bytes); await saveDocumentBytes(second.id, source.bytes);
  const text = await exportWorkspaceWithFiles(source.workspace);
  await auditDatabase.table('documents').bulkDelete([first.id, second.id]);
  const previous = workspace(); await saveWorkspace(previous);
  const records = await auditDatabase.table('workspaces').toArray();
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(value: any, key?: IDBValidKey) {
    if (this.name === 'documents' && value.id === second.id) throw new DOMException('simulated write failure', 'QuotaExceededError');
    return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
  };
  try { await assert.rejects(restoreWorkspaceWithFiles(text), /simulated write failure/); }
  finally { IDBObjectStore.prototype.put = originalPut; }
  assert.deepEqual(await loadWorkspace(), previous);
  assert.deepEqual(await auditDatabase.table('workspaces').toArray(), records);
  assert.equal(await getDocumentBytes(first.id), undefined); assert.equal(await getDocumentBytes(second.id), undefined);
});

test('追加导入导致对话超限时，在写入任何附件之前拒绝', async () => {
  const source = fixture(), document = source.workspace.conversations[0].documents![0];
  await saveDocumentBytes(document.id, source.bytes);
  const text = await exportWorkspaceWithFiles(source.workspace);
  await auditDatabase.table('documents').delete(document.id);
  const conversations = Array.from({ length: 1000 }, () => createConversation());
  const full: Workspace = { schemaVersion: 1, conversations, activeConversationId: conversations[0].id };
  const before = await countFiles();
  await assert.rejects(importWorkspaceWithFiles(text, full), /对话.*最多/);
  assert.equal(await countFiles(), before);
});

test('附件原文件独立保存，传入和返回字节的修改不会改变数据库副本', async () => {
  const id = makeId();
  const original = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
  const expected = original.slice();
  await saveDocumentBytes(id, original);
  original.fill(99);
  const first = await getDocumentBytes(id);
  assert.deepEqual(first, expected);
  first!.fill(42);
  assert.deepEqual(await getDocumentBytes(id), expected);
  assert.equal(await getDocumentBytes(makeId()), undefined);
  await assert.rejects(saveDocumentBytes('', expected), /25 MB/);
  await assert.rejects(saveDocumentBytes(makeId(), new Uint8Array(25 * 1024 * 1024 + 1)), /25 MB/);
});

test('完整备份同时保存 PDF 原字节、页面、普通批注，不混入 API 配置', async () => {
  const source = fixture();
  const document = source.workspace.conversations[0].documents![0];
  await saveDocumentBytes(document.id, source.bytes);
  const exported = JSON.parse(await exportWorkspaceWithFiles({ ...source.workspace, apiKey: 'never-export-secret' } as Workspace));
  assert.equal(exported.schemaVersion, 1);
  assert.deepEqual(exported.documentFiles, [{ documentId: document.id, data: Buffer.from(source.bytes).toString('base64') }]);
  assert.equal(exported.conversations[0].annotations[0].mode, 'note');
  assert.equal(exported.conversations[0].annotations[0].status, 'noted');
  assert.equal(exported.conversations[0].annotations[0].note, '我自己的论文笔记。');
  assert.deepEqual(exported.conversations[0].documents[0].pages, document.pages);
  assert.doesNotMatch(JSON.stringify(exported), /never-export-secret/);
});

test('完整备份导入为独立新对话，重映射文档、页面、批注 ID 并恢复原字节', async () => {
  const source = fixture();
  const original = source.workspace.conversations[0];
  const originalDocument = original.documents![0];
  await saveDocumentBytes(originalDocument.id, source.bytes);
  const backup = await exportWorkspaceWithFiles(source.workspace);
  const current = workspace();
  await saveWorkspace(current);
  const imported = await importWorkspaceWithFiles(backup, current);
  assert.deepEqual(imported.conversations[0], current.conversations[0]);
  assert.equal(imported.conversations.length, 2);
  const added = imported.conversations[1];
  const document = added.documents![0];
  assert.notEqual(added.id, original.id);
  assert.notEqual(document.id, originalDocument.id);
  assert.notEqual(document.pages[0].messageId, originalDocument.pages[0].messageId);
  assert.notEqual(document.pages[0].versionId, originalDocument.pages[0].versionId);
  assert.notEqual(added.annotations[0].id, original.annotations[0].id);
  assert.equal(added.annotations[0].conversationId, added.id);
  assert.equal(added.annotations[0].messageId, document.pages[0].messageId);
  assert.equal(added.annotations[0].versionId, document.pages[0].versionId);
  assert.deepEqual(added.annotations[0].anchor, { id: document.pages[0].versionId, quote: '测地线' });
  assert.equal(added.annotations[0].note, original.annotations[0].note);
  assert.equal(imported.activeConversationId, added.id);
  assert.deepEqual(await getDocumentBytes(document.id), source.bytes);
  assert.deepEqual(await getDocumentBytes(originalDocument.id), source.bytes);
  assert.deepEqual(await loadWorkspace(), current, '导入函数返回新工作区，保存由调用方明确完成');
  await saveWorkspace(imported);
  assert.deepEqual(await loadWorkspace(), validateImport(imported));
});

test('无附件的旧 JSON 备份兼容，原对话仍保留', async () => {
  const previous = workspace(createConversation('旧版本保存的对话'));
  const current = workspace();
  const backup = exportWorkspace(previous);
  assert.equal('documentFiles' in JSON.parse(backup), false);
  const merged = await importWorkspaceWithFiles(backup, current);
  assert.equal(merged.conversations.length, 2);
  assert.deepEqual(merged.conversations[0], current.conversations[0]);
  assert.match(merged.conversations[1].title, /旧版本保存的对话/);
  assert.equal(merged.activeConversationId, merged.conversations[1].id);
});

test('已删除对话的完整备份保留 PDF 和笔记，导入时当前对话仍可见', async () => {
  const source = fixture();
  const original = source.workspace.conversations[0];
  await saveDocumentBytes(original.documents![0].id, source.bytes);
  const deleted = deleteConversation(source.workspace, original.id);
  const backup = await exportWorkspaceWithFiles(deleted);
  const imported = await importWorkspaceWithFiles(backup, workspace());
  const hidden = imported.conversations.find(c => c.deletedAt !== undefined)!;
  assert.ok(hidden);
  assert.equal(hidden.annotations[0].note, '我自己的论文笔记。');
  assert.deepEqual(await getDocumentBytes(hidden.documents![0].id), source.bytes);
  assert.equal(imported.conversations.find(c => c.id === imported.activeConversationId)?.deletedAt, undefined);
});

test('完整备份预先拒绝总量超限，避免构建无法再次导入的备份', async () => {
  const source = fixture();
  const conversation = source.workspace.conversations[0];
  const first = conversation.documents![0];
  conversation.documents = Array.from({ length: 10 }, (_, i) => ({
    ...first, id: makeId(), size: 25 * 1024 * 1024,
    pages: [{ pageNumber: 1, text: i === 0 ? 'a'.repeat(500_000) : '', messageId: makeId(), versionId: makeId() }],
  }));
  conversation.annotations = [];
  await assert.rejects(exportWorkspaceWithFiles(source.workspace), /完整备份超过 350 MB/);
});

test('缺少或损坏本地原文件时拒绝导出不完整备份', async () => {
  const source = fixture();
  const document = source.workspace.conversations[0].documents![0];
  await assert.rejects(exportWorkspaceWithFiles(source.workspace), /无法读取附件/);
  await saveDocumentBytes(document.id, source.bytes.subarray(0, source.bytes.length - 1));
  await assert.rejects(exportWorkspaceWithFiles(source.workspace), /未生成不完整备份/);
});

test('缺失、重复及无效文件会拒绝整个导入，已有工作区和原文件不会被覆盖', async () => {
  const source = fixture();
  const first = source.workspace.conversations[0].documents![0];
  const second = { ...first, id: makeId(), name: 'second.pdf', pages: first.pages.map(p => ({ ...p, messageId: makeId(), versionId: makeId() })) };
  source.workspace.conversations[0].documents!.push(second);
  await saveDocumentBytes(first.id, source.bytes);
  await saveDocumentBytes(second.id, source.bytes);
  const backup = JSON.parse(await exportWorkspaceWithFiles(source.workspace));
  const current = workspace();
  await saveWorkspace(current);
  const initialCount = await countFiles();
  const cases: Array<(data: any) => void> = [
    data => { delete data.documentFiles; },
    data => { data.documentFiles.pop(); },
    data => { data.documentFiles = {}; },
    data => { data.documentFiles[1].documentId = first.id; },
    data => { data.documentFiles[1].documentId = 'unknown-file'; },
    data => { data.documentFiles[1].data = '!!!='; },
    data => { data.documentFiles[1].data = null; },
    data => { data.documentFiles[1] = null; },
    data => { data.documentFiles[1].data = Buffer.from(source.bytes.subarray(1)).toString('base64'); },
    data => { data.documentFiles[1].data = Buffer.from(new Uint8Array(source.bytes.length)).toString('base64'); },
  ];
  for (const mutate of cases) {
    const invalid = structuredClone(backup);
    mutate(invalid);
    await assert.rejects(importWorkspaceWithFiles(JSON.stringify(invalid), current), /附件|PDF/);
    assert.deepEqual(await loadWorkspace(), current);
    assert.deepEqual(await getDocumentBytes(first.id), source.bytes);
    assert.deepEqual(await getDocumentBytes(second.id), source.bytes);
    assert.equal(await countFiles(), initialCount, '验证失败不能保存任何部分附件');
  }
});

test('大文件 base64 合法前缀后的非法字符产生可读错误，不能使校验栈溢出', async () => {
  const source = fixture();
  const document = source.workspace.conversations[0].documents![0];
  document.size = 6_000_000;
  const backup = JSON.stringify({ ...source.workspace, documentFiles: [{ documentId: document.id, data: 'A'.repeat(7_999_999) + '!' }] });
  const before = await countFiles();
  await assert.rejects(importWorkspaceWithFiles(backup, workspace()), error => {
    assert.equal(error instanceof RangeError, false, '用户输入不能触发正则栈溢出');
    assert.match((error as Error).message, /附件格式无效|附件数据无法读取/);
    return true;
  });
  assert.equal(await countFiles(), before);
});

test('合法的大型 PDF 备份可导入，字节精确保留', async () => {
  const source = fixture();
  const document = source.workspace.conversations[0].documents![0];
  const bytes = new Uint8Array(6_000_000);
  bytes.set(new TextEncoder().encode('%PDF-1.7\n'));
  document.size = bytes.length;
  const backup = JSON.stringify({ ...source.workspace, documentFiles: [{ documentId: document.id, data: Buffer.from(bytes).toString('base64') }] });
  const merged = await importWorkspaceWithFiles(backup, workspace());
  const newDocument = merged.conversations[1].documents![0];
  assert.deepEqual(await getDocumentBytes(newDocument.id), bytes);
});
