import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { WorkspaceRecordStore } from '../src/adapters/record-store';
import type { WorkspaceDatabase } from '../src/adapters/record-store';
import { contentHash } from '../src/domain/context-pool';
import { RECORD_PREFIX, unpackWorkspace, WorkspaceCodec } from '../src/domain/workspace-codec';
import { buildMainContext, changeAnnotationReask, compactRequestCaches, completeAnnotation, createAnnotation, createAssistantMessage, createConversation, createUserMessage, deleteChatTurn, ImportValidationCache, makeId, prepareAnnotationRequest, updateAnnotationRequest, validateImport } from '../src/domain/workspace';
import { freezeContext } from '../src/domain/context-pool';
import { WorkspaceSession } from '../src/adapters/workspace-session';
import { permanentlyDelete } from '../src/domain/trash';
import { parseWorkspace, exportWorkspace } from '../src/adapters/storage';
import type { Workspace } from '../src/domain/types';

const databases: WorkspaceDatabase[] = [];
function database() {
  const db = new Dexie('learn-storage-test-' + makeId()) as WorkspaceDatabase;
  db.version(1).stores({ workspaces: 'id' }); db.version(2).stores({ workspaces: 'id', documents: 'id' });
  databases.push(db); return db;
}
after(async () => { for (const db of databases) { db.close(); await db.delete(); } });

function fixture(count = 3, textLength = 1000): Workspace {
  let c = createConversation('共享完整上下文');
  c.messages = [createUserMessage('主问题'), createAssistantMessage('完整原文，包含时空曲率。', 'complete')];
  const page = { pageNumber: 1, text: 'A'.repeat(textLength), messageId: makeId(), versionId: makeId() };
  c.documents = [{ id: makeId(), name: 'synthetic-paper.txt', mimeType: 'text/plain', kind: 'text', createdAt: 1, size: textLength, pages: [page] }];
  for (let i = 0; i < count; i++) {
    const a = createAnnotation(c, { messageId: c.messages[1].id, versionId: c.messages[1].activeVersionId, quote: '时空曲率', anchor: { quote: '时空曲率' }, color: '#ffe099', question: `批注问题 ${i}` });
    c = { ...c, annotations: [...c.annotations, a] };
    c = completeAnnotation(prepareAnnotationRequest(c, a.id, '保持完整上下文').conversation, a.id, `完整回答 ${i}`);
  }
  return { schemaVersion: 1, activeConversationId: c.id, conversations: [c] };
}

// Retain legacy snapshot fixtures to verify older backups and their integrity.
function legacyFixture(count = 3, textLength = 1000): Workspace {
  const source = fixture(count, textLength), conversation = source.conversations[0];
  conversation.annotations = conversation.annotations.map(annotation => ({ ...annotation, context: freezeContext([{ role: 'system', content: '保持完整上下文' }, ...buildMainContext(conversation), { role: 'user', content: `旧版批注问题：${annotation.question}` }]) }));
  return source;
}

test('上下文内容标识与标准 SHA-256 一致，包括中文、emoji 和转义字符', () => {
  for (const text of ['', 'abc', '中文😀\n\0"', 'A'.repeat(1_000_000)]) assert.equal(contentHash(text), createHash('sha256').update(text).digest('hex'));
});

test('多个询问共享不可变资料对象，重试不会复制或修改原快照', () => {
  const source = legacyFixture(), [first, second] = source.conversations[0].annotations;
  assert.equal(first.context![1], second.context![1]);
  assert.ok(Object.isFrozen(first.context)); assert.ok(Object.isFrozen(first.context![1]));
  assert.throws(() => { first.context![1].content = 'tamper'; }, TypeError);
  assert.throws(() => first.context!.push({ role: 'user', content: 'tamper' }), TypeError);
  const id = first.id;
  const pending = prepareAnnotationRequest(changeAnnotationReask(source.conversations[0], id, 'start'), id);
  const failed = updateAnnotationRequest(pending.conversation, id, '残文', { error: '中断', interrupted: true });
  const retried = prepareAnnotationRequest(failed, id, '后来改变的规则');
  assert.equal(retried.annotation.reask!.requestPreference, pending.annotation.reask!.requestPreference);
  assert.deepEqual(retried.messages, pending.messages);
  retried.messages.push({ role: 'user', content: '修改调用方数组' });
  assert.equal(prepareAnnotationRequest(failed, id).messages.some(m => m.content === '修改调用方数组'), false);
  assert.equal(retried.annotation.reask!.context, undefined);
});

test('百万字符资料加 10 条批注，只保存一个公共上下文前缀，体积减少至少 75%', () => {
  const source = legacyFixture(10, 1_000_000), codec = new WorkspaceCodec(), packed = codec.pack(source);
  const oldBytes = Buffer.byteLength(JSON.stringify(validateImport(source)));
  assert.ok(packed.bytes < oldBytes * .25, `compact ${packed.bytes} vs legacy ${oldBytes}`);
  assert.equal(packed.rows.filter(row => row.kind === 'context').length, 1);
  assert.equal(packed.rows.filter(row => row.kind === 'input' && (row.data.content as string).includes('A'.repeat(100))).length, 1);
  assert.equal(packed.bytes, Buffer.byteLength(JSON.stringify({ ...packed.header, records: packed.rows })));
  assert.deepEqual(validateImport(unpackWorkspace({ ...packed.header, records: packed.rows })), validateImport(source));
});

test('新旧备份都能往返，未完成的覆盖问答保留旧结果和本次固定上下文', () => {
  const source = fixture(); const c = source.conversations[0], id = c.annotations[0].id;
  const pending = prepareAnnotationRequest(changeAnnotationReask(c, id, 'start'), id);
  const value = { ...source, conversations: [updateAnnotationRequest(pending.conversation, id, '覆盖回答的残文')] };
  for (const compact of [false, true]) {
    const parsed = parseWorkspace(exportWorkspace(value, { compact }));
    assert.deepEqual(parsed, validateImport(value));
    assert.equal(parsed.conversations[0].annotations[0].reask!.status, 'interrupted');
    assert.deepEqual(prepareAnnotationRequest(parsed.conversations[0], id).messages, pending.messages);
  }
});

test('紧凑备份拒绝丢失、重复、被改写和多余的记录', () => {
  const source = JSON.parse(exportWorkspace(legacyFixture(), { compact: true }));
  for (const mutate of [
    (value: any) => { value.records.pop(); },
    (value: any) => { value.records.push(value.records[0]); },
    (value: any) => { value.records.find((row: any) => row.kind === 'input').data.content = '篡改固定上下文'; },
    (value: any) => { value.records.find((row: any) => row.kind === 'context').data.messages.reverse(); },
    (value: any) => { value.records.find((row: any) => row.kind === 'version').data.id = makeId(); },
    (value: any) => { value.records.push({ id: RECORD_PREFIX + 'version:orphan', kind: 'version', data: { id: 'orphan' } }); },
  ]) { const invalid = structuredClone(source); mutate(invalid); assert.throws(() => parseWorkspace(JSON.stringify(invalid)), /备份格式无效/); }
});

test('旧格式升级在备份确认之后提交，保留原记录副本与附件，数据库版本不增加', async () => {
  const db = database(), store = new WorkspaceRecordStore(db), legacy = fixture();
  const document = legacy.conversations[0].documents![0], bytes = new TextEncoder().encode(document.pages[0].text);
  await db.workspaces.put({ id: 'current', workspace: legacy }); await db.documents.put({ id: document.id, bytes });
  let backedUp = false;
  const migrated = await store.load(async value => {
    assert.deepEqual(value, validateImport(legacy)); assert.equal((await db.workspaces.get('current'))!.workspace && ((await db.workspaces.get('current'))!.workspace as any).schemaVersion, 1);
    backedUp = true;
  });
  assert.equal(backedUp, true); assert.deepEqual(migrated, validateImport(legacy));
  assert.equal(((await db.workspaces.get('current'))!.workspace as any).schemaVersion, 2); assert.equal(db.verno, 2);
  assert.ok((await db.workspaces.where('id').startsWith('migration-archive-').toArray()).some(row => JSON.stringify(row.workspace) === JSON.stringify(legacy)));
  assert.deepEqual((await db.documents.get(document.id))!.bytes, bytes);
  assert.deepEqual(await new WorkspaceRecordStore(db).load(), validateImport(legacy));
});

test('v0.1.32 compact records are checkpointed before cleanup writes and a failed checkpoint leaves all rows unchanged', async () => {
  const db = database(), previous = fixture(3, 10000);
  await new WorkspaceRecordStore(db).write(previous);
  const originalRows = await db.workspaces.toArray(), version = db.verno;
  await assert.rejects(new WorkspaceRecordStore(db).load(undefined, async value => {
    assert.deepEqual(value, validateImport(previous));
    assert.deepEqual(await db.workspaces.toArray(), originalRows);
    throw Error('synthetic-full-disk');
  }), /升级前备份未完成/);
  assert.deepEqual(await db.workspaces.toArray(), originalRows); assert.equal(db.verno, version);
  let checkpointed = false;
  const opened = await new WorkspaceRecordStore(db).load(undefined, async value => {
    assert.deepEqual(parseWorkspace(exportWorkspace(value, { compact: true })), validateImport(previous)); checkpointed = true;
  });
  assert.equal(checkpointed, true); assert.deepEqual(opened, compactRequestCaches(validateImport(previous))); assert.equal(db.verno, 2);
});

test('升级前备份失败或迁移写入中断时，不覆盖旧格式，不留下半份新记录', async () => {
  const db = database(), store = new WorkspaceRecordStore(db), legacy = fixture();
  await db.workspaces.put({ id: 'current', workspace: legacy });
  await assert.rejects(store.load(async () => { throw new Error('disk-full'); }), /原记录尚未更改/);
  assert.deepEqual((await db.workspaces.get('current'))!.workspace, legacy);
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(value: any, key?: IDBValidKey) {
    if (this.name === 'workspaces' && value.kind === 'annotation') throw new DOMException('migration interrupted', 'QuotaExceededError');
    return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
  };
  try { await assert.rejects(store.load(), /migration interrupted/); } finally { IDBObjectStore.prototype.put = originalPut; }
  assert.deepEqual((await db.workspaces.get('current'))!.workspace, legacy);
  assert.equal(await db.workspaces.where('id').startsWith(RECORD_PREFIX).count(), 0);
  assert.equal(await db.workspaces.where('id').startsWith('migration-archive-').count(), 0);
});

test('流式更新只提交当前批注、对话时间和索引，不重复写入资料或其他消息', async () => {
  const db = database(), store = new WorkspaceRecordStore(db); let source = fixture(10, 1_000_000);
  await store.write(source); const oldBytes = Buffer.byteLength(JSON.stringify(source));
  const c = source.conversations[0], id = c.annotations[0].id;
  const prepared = prepareAnnotationRequest(changeAnnotationReask(c, id, 'start'), id);
  source = { ...source, conversations: [prepared.conversation] }; await store.write(source, { trusted: true });
  const written: string[] = [], originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(value: any, key?: IDBValidKey) {
    if (this.name === 'workspaces') written.push(value.id);
    return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
  };
  try {
    for (let i = 1; i <= 30; i++) {
      source = { ...source, conversations: [updateAnnotationRequest(source.conversations[0], id, '新回答'.repeat(i))] };
      await store.write(source, { trusted: true });
      assert.ok(store.metrics!.writtenRecords <= 3); assert.ok(store.metrics!.writtenBytes < 4096, `incremental write ${store.metrics!.writtenBytes} bytes for ${oldBytes} source bytes`);
    }
  } finally { IDBObjectStore.prototype.put = originalPut; }
  assert.equal(written.some(key => /:(input|context|document|page|version|message):/.test(key)), false);
  assert.deepEqual(await new WorkspaceRecordStore(db).load(), validateImport(source));
});

test('只切换当前对话时只写索引，其他窗口的旧状态不能静默覆盖新记录', async () => {
  const db = database(), first = new WorkspaceRecordStore(db), second = new WorkspaceRecordStore(db);
  const source = fixture(), other = createConversation('另一个对话'); source.conversations.push(other);
  await first.write(source); await second.load();
  const changed = { ...source, activeConversationId: other.id }; await first.write(changed, { trusted: true });
  assert.equal(first.metrics!.writtenRecords, 1);
  await assert.rejects(second.write(source, { trusted: true }), /另一个窗口更新/);
  await assert.rejects(second.write(source, { checkRevision: true, documentDeletes: [source.conversations[0].documents![0].id] }), /另一个窗口更新/);
  assert.deepEqual(await second.load(), validateImport(changed));
});

test('永久删除同时回收无引用的快照，仍被其他批注引用的全文继续保留', async () => {
  const db = database(), store = new WorkspaceRecordStore(db), source = legacyFixture(); await store.write(source);
  const c = source.conversations[0], removed = c.annotations[0];
  const hidden = { ...source, conversations: [{ ...c, annotations: c.annotations.map(a => a.id === removed.id ? { ...a, deletedAt: 1 } : a) }] };
  await store.write(hidden);
  const next = permanentlyDelete(hidden, { kind: 'annotation', conversationId: c.id, id: removed.id }); await store.write(next);
  assert.equal(await db.workspaces.where('id').startsWith(RECORD_PREFIX + 'context:').count(), 1);
  const all = permanentlyDelete({ ...next, conversations: next.conversations.map(c => ({ ...c, annotations: c.annotations.map(a => ({ ...a, deletedAt: 1 })) })) }, { kind: 'all' });
  await store.write(all);
  assert.equal(await db.workspaces.where('id').startsWith(RECORD_PREFIX + 'context:').count(), 0);
  assert.equal(await db.workspaces.where('id').startsWith(RECORD_PREFIX + 'input:').count(), 0);
  assert.deepEqual(await store.load(), validateImport(all));
});

test('增量校验仍检查全局重复标识及旧批注来源，外部可变对象不使用缓存', () => {
  const value = fixture(), cache = new ImportValidationCache(); validateImport(value, cache);
  const duplicate = { ...value, conversations: [...value.conversations, value.conversations[0]] };
  assert.throws(() => validateImport(duplicate, cache), /重复/);
  const c = value.conversations[0], invalidSource = { ...value, conversations: [{ ...c, messages: c.messages.map(m => m.role === 'assistant' ? { ...m, versions: m.versions.map(v => ({ ...v, status: 'interrupted' as const })) } : m) }] };
  assert.throws(() => validateImport(invalidSource, cache), /完整原回答/);
  const mutable = structuredClone(value); validateImport(mutable); mutable.conversations[0].messages[0].versions[0].status = 'error';
  assert.throws(() => validateImport(mutable), /用户问题必须完整/);
});

test('重新打开旧记录时清理成功问答的历史快照，保留原问答和文档', async () => {
  const db = database(), writer = new WorkspaceRecordStore(db), source = legacyFixture(4, 10000);
  await writer.write(source);
  assert.ok(await db.workspaces.where('id').startsWith(RECORD_PREFIX + 'context:').count());
  const loaded = await new WorkspaceRecordStore(db).load();
  assert.deepEqual(loaded, compactRequestCaches(validateImport(source)));
  assert.equal(await db.workspaces.where('id').startsWith(RECORD_PREFIX + 'context:').count(), 0);
  assert.equal(await db.workspaces.where('id').startsWith(RECORD_PREFIX + 'input:').count(), 0);
  assert.equal(loaded.conversations[0].annotations[0].answer, source.conversations[0].annotations[0].answer);
});

test('逐轮删除先原子保存再更新界面，事务失败保留旧记录，成功后清除重试快照记录', async () => {
  const db = database(), store = new WorkspaceRecordStore(db), source = fixture(1, 1000), conversation = source.conversations[0];
  const deletedQuestion = conversation.messages[0], deletedAnswer = conversation.messages[1];
  const nextQuestion = createUserMessage('剩余问题'), nextAnswer = createAssistantMessage('失败后的部分文字', 'error');
  nextAnswer.versions[0].context = freezeContext(buildMainContext(conversation));
  conversation.messages = [...conversation.messages, nextQuestion, nextAnswer];
  await store.write(source);
  const before = await db.workspaces.toArray();
  const session = new WorkspaceSession({ save: value => store.write(value), onChange() {}, onStatus() {} }); session.load(source);
  const originalDelete = IDBObjectStore.prototype.delete;
  IDBObjectStore.prototype.delete = function(key: IDBValidKey | IDBKeyRange) { if (this.name === 'workspaces' && String(key).includes(deletedAnswer.versions[0].id)) throw new DOMException('synthetic round deletion failure', 'QuotaExceededError'); return originalDelete.call(this, key); };
  try { await assert.rejects(session.commit(value => deleteChatTurn(value, conversation.id, deletedAnswer.id), next => store.write(next, { checkRevision: true })), /synthetic round deletion failure/); }
  finally { IDBObjectStore.prototype.delete = originalDelete; }
  assert.equal(session.value, source); assert.deepEqual(await db.workspaces.toArray(), before);
  const removed = await session.commit(value => deleteChatTurn(value, conversation.id, deletedAnswer.id), next => store.write(next, { checkRevision: true }));
  const rows = await db.workspaces.where('id').startsWith(RECORD_PREFIX).toArray();
  assert.doesNotMatch(JSON.stringify(rows), new RegExp([deletedQuestion.id, deletedAnswer.id, deletedAnswer.versions[0].id].join('|')));
  assert.equal(rows.some(row => row.kind === 'context' || row.kind === 'input'), false);
  assert.deepEqual(await new WorkspaceRecordStore(db).load(), validateImport(removed));
  assert.equal(removed.conversations[0].documents!.length, 1);
});
