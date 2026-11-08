import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createWorkspace, makeId } from '../src/domain/workspace';
import { exportWorkspace, parseWorkspace } from '../src/adapters/storage';
const { createBackupStore } = createRequire(import.meta.url)('../desktop/backup-store.cjs');
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
async function fixture(run: (directory: string) => Promise<void>) {
  const root = await fs.mkdtemp(join(tmpdir(), 'synthetic-backup-deletion-'));
  try { await run(join(root, 'Backups')); } finally { await fs.rm(root, { recursive: true, force: true }); }
}
function source(bytes = Buffer.from('Synthetic backup attachment'), title = 'Synthetic reading') {
  const workspace = createWorkspace(), documentId = makeId(); workspace.conversations[0].title = title;
  workspace.conversations[0].documents = [{ id: documentId, size: bytes.length, name: 'Synthetic.pdf', kind: 'pdf', mimeType: 'application/pdf', createdAt: 1, pages: [{ pageNumber: 1, messageId: makeId(), versionId: makeId(), text: 'Synthetic passage.' }] }];
  return { workspace, bytes, documentId };
}
async function send(store: any, input = source(), flags = {}) {
  const id = await store.begin({ metadata: exportWorkspace(input.workspace, { compact: true }), files: [{ documentId: input.documentId, size: input.bytes.length }], ...flags });
  await store.append({ id, index: 0, bytes: input.bytes }); return store.finish(id);
}
const assets = async (directory: string) => (await fs.readdir(join(directory, 'Attachments'))).filter(name => /^[a-f0-9]{64}\.bin$/.test(name));
const journal = (directory: string) => join(directory, '_pending-backup-deletion.json');

test('deleting a recovery point preserves shared attachments and the independent library original', () => fixture(async directory => {
  const input = source(), libraryPath = join(directory, '..', 'Synthetic-library-original.pdf'); await fs.writeFile(libraryPath, input.bytes);
  const store = createBackupStore({ directory }), first = await send(store, input), secondSource = source(input.bytes, 'Synthetic later state'), second = await send(store, secondSource);
  assert.deepEqual(await store.remove(first.id), { cleanupPending: false });
  assert.equal((await store.list()).length, 1); assert.deepEqual(parseWorkspace(await store.read(second.id)), secondSource.workspace);
  assert.deepEqual(await assets(directory), [`${hash(input.bytes)}.bin`]); assert.deepEqual(await fs.readFile(libraryPath), input.bytes);
  await store.remove(second.id); assert.equal((await store.list()).length, 0); assert.deepEqual(await assets(directory), []);
  assert.deepEqual(await fs.readFile(libraryPath), input.bytes); assert.deepEqual(await store.remove(second.id), { cleanupPending: false });
}));

test('upgrade points can be explicitly deleted without recreating upgrade protection in the same app version', () => fixture(async directory => {
  const store = createBackupStore({ directory, version: '0.1.37' }), input = source();
  const first = await send(store, input, { upgrade: true }), second = await send(store, source(input.bytes, 'Synthetic second upgrade'), { baseline: true });
  const ordinary = await send(store, source(input.bytes, 'Synthetic ordinary state'));
  await store.remove(ordinary.id); assert.equal((await store.list()).filter((entry: any) => entry.baseline).length, 2);
  await store.remove(first.id); assert.deepEqual((await store.list()).filter((entry: any) => entry.baseline).map((entry: any) => entry.id), [second.id]);
  await store.remove(second.id); assert.equal(await store.upgradeNeeded(), false);
  assert.equal(await createBackupStore({ directory, version: '0.1.37' }).upgradeNeeded(), false);
  assert.deepEqual(await assets(directory), []);
}));

test('deletion rejects paths, invalid file types and an in-progress snapshot without touching other files', () => fixture(async directory => {
  const store = createBackupStore({ directory }), input = source(), entry = await send(store, input);
  for (const id of ['../outside.json', '/outside.json', '', 1]) await assert.rejects(store.remove(id), /名称无效/);
  const fake = `1793836800000-${'a'.repeat(64)}.snapshot.json`; await fs.mkdir(join(directory, fake));
  await assert.rejects(store.remove(fake), /类型无效/); await fs.rmdir(join(directory, fake));
  const id = await store.begin({ metadata: exportWorkspace(input.workspace, { compact: true }), files: [{ documentId: input.documentId, size: input.bytes.length }] });
  await assert.rejects(store.remove(entry.id), /仍在写入/); await store.abort(id);
  assert.deepEqual(parseWorkspace(await store.read(entry.id)), input.workspace);
}));

test('an unlink failure restores the original protection and leaves the point readable', () => fixture(async directory => {
  const store = createBackupStore({ directory }), input = source(), entry = await send(store, input, { baseline: true });
  const blocked = createBackupStore({ directory, io: { ...fs, async unlink(path: string) { if (path.endsWith(entry.id)) throw Error('synthetic-point-in-use'); return fs.unlink(path); } } });
  await assert.rejects(blocked.remove(entry.id), /synthetic-point-in-use/);
  assert.ok((await store.list()).some((point: any) => point.id === entry.id && point.baseline));
  assert.deepEqual(parseWorkspace(await store.read(entry.id)), input.workspace);
  await assert.rejects(fs.stat(journal(directory)), { code: 'ENOENT' });
}));

test('interrupted protection rollback is journaled and recovered before a later backup can rotate points', () => fixture(async directory => {
  const store = createBackupStore({ directory }), input = source(), entry = await send(store, input, { baseline: true });
  const blocked = createBackupStore({ directory, io: { ...fs, async rename(from: string, to: string) {
    if (to.endsWith('_upgrade-baselines.json') && !to.endsWith('_shared-upgrade-baselines.json')) throw Error('synthetic-index-write-failure'); return fs.rename(from, to);
  } } });
  await assert.rejects(blocked.remove(entry.id), /删除状态无法确认/); assert.ok(await fs.stat(journal(directory)));
  assert.deepEqual(parseWorkspace(await store.read(entry.id)), input.workspace);
  const restarted = createBackupStore({ directory, retain: 1 }); await send(restarted, source(input.bytes, 'Synthetic new state'));
  assert.ok((await restarted.list()).some((point: any) => point.id === entry.id && point.baseline));
  await assert.rejects(fs.stat(journal(directory)), { code: 'ENOENT' });
}));

test('a journal from a crash before unlink restores protection; a crash after unlink finishes deletion', () => fixture(async directory => {
  const input = source(), store = createBackupStore({ directory }), entry = await send(store, input, { baseline: true });
  const pending = { id: entry.id, protectedIds: [entry.id] };
  await fs.writeFile(journal(directory), JSON.stringify(pending)); await fs.writeFile(join(directory, '_shared-upgrade-baselines.json'), '[]');
  let restarted = createBackupStore({ directory });
  let id = await restarted.begin({ metadata: exportWorkspace(createWorkspace(), { compact: true }), files: [] }); await restarted.abort(id);
  assert.ok((await restarted.list()).some((point: any) => point.id === entry.id && point.baseline));
  await fs.writeFile(journal(directory), JSON.stringify(pending)); await fs.unlink(join(directory, entry.id));
  restarted = createBackupStore({ directory }); id = await restarted.begin({ metadata: exportWorkspace(createWorkspace(), { compact: true }), files: [] }); await restarted.abort(id);
  assert.equal((await restarted.list()).length, 0); assert.deepEqual(await assets(directory), []);
  await assert.rejects(fs.stat(journal(directory)), { code: 'ENOENT' });
}));

test('deleting an entry with unreadable neighboring metadata reports deferred cleanup, then deleting that metadata releases the copies', () => fixture(async directory => {
  const store = createBackupStore({ directory }), first = await send(store, source(Buffer.from('Synthetic original A')), { baseline: true });
  const second = await send(store, source(Buffer.from('Synthetic original B'))); await fs.writeFile(join(directory, first.id), 'Synthetic damaged metadata');
  assert.deepEqual(await store.remove(second.id), { cleanupPending: true }); assert.equal((await assets(directory)).length, 2);
  assert.deepEqual(await store.remove(first.id), { cleanupPending: false }); assert.deepEqual(await assets(directory), []);
}));

test('reads queued before deletion complete with verified bytes before the final attachment is collected', () => fixture(async directory => {
  const store = createBackupStore({ directory }), input = source(), entry = await send(store, input);
  const [text] = await Promise.all([store.read(entry.id), store.remove(entry.id)]);
  assert.deepEqual(parseWorkspace(text), input.workspace); assert.deepEqual(await assets(directory), []);
}));

test('a legacy entry that still exists is deleted directly rather than following its replacement alias', () => fixture(async directory => {
  const input = source(), original = createBackupStore({ directory });
  const text = JSON.stringify({ ...JSON.parse(exportWorkspace(input.workspace, { compact: true })), documentFiles: [{ documentId: input.documentId, data: input.bytes.toString('base64') }] });
  const old = await original.write(text); let blocked = true;
  const store = createBackupStore({ directory, io: { ...fs, async unlink(path: string) { if (path.endsWith(old.id) && blocked) { blocked = false; throw Error('synthetic-legacy-in-use'); } return fs.unlink(path); } } });
  const replacement = await send(store, input); assert.ok(await fs.stat(join(directory, old.id)));
  await store.remove(old.id); assert.deepEqual((await store.list()).map((entry: any) => entry.id), [replacement.id]);
  assert.deepEqual(parseWorkspace(await store.read(replacement.id)), input.workspace); assert.equal((await assets(directory)).length, 1);
}));

test('an unreadable deletion journal blocks destructive work while export of existing backups remains available', () => fixture(async directory => {
  const store = createBackupStore({ directory }), input = source(), entry = await send(store, input);
  await fs.writeFile(journal(directory), '{broken'); await assert.rejects(store.remove(entry.id), /删除状态无法确认/);
  assert.deepEqual(parseWorkspace(await store.read(entry.id)), input.workspace); assert.equal((await assets(directory)).length, 1);
}));
