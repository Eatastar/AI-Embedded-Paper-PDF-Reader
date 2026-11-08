import test from 'node:test';
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createWorkspace, makeId } from '../src/domain/workspace';
import { exportWorkspace, exportWorkspaceWithFiles, getDocumentBytes, importWorkspaceWithFiles, parseWorkspace, saveDocumentBytes } from '../src/adapters/storage';
const { createBackupStore } = createRequire(import.meta.url)('../desktop/backup-store.cjs');
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
async function fixture(run: (directory: string) => Promise<void>) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'synthetic-shared-backups-'));
  try { await run(directory); } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
function input(buffers: Uint8Array[], title = 'Synthetic paper') {
  const workspace = createWorkspace(); workspace.conversations[0].title = title;
  const files = buffers.map(bytes => ({ documentId: makeId(), size: bytes.length }));
  workspace.conversations[0].documents = files.map(file => ({ id: file.documentId, name: 'Synthetic.pdf', size: file.size, kind: 'pdf', mimeType: 'application/pdf', createdAt: 1, pages: [{ pageNumber: 1, messageId: makeId(), versionId: makeId(), text: 'Synthetic passage.' }] }));
  return { workspace, files, buffers };
}
async function send(store: any, source: ReturnType<typeof input>, options = {}) {
  const id = await store.begin({ metadata: exportWorkspace(source.workspace, { compact: true }), files: source.files, ...options });
  for (let index = 0; index < source.buffers.length; index++) {
    const bytes = source.buffers[index];
    for (let offset = 0; offset < bytes.length; offset += 65537) await store.append({ id, index, bytes: bytes.subarray(offset, offset + 65537) });
  }
  return store.finish(id);
}
const assetNames = async (directory: string) => (await fs.readdir(join(directory, 'Attachments'))).filter(name => /^[a-f0-9]{64}\.bin$/.test(name)).sort();
const assertRestores = async (store: any, entry: any, source: ReturnType<typeof input>) => {
  const text = await store.read(entry.id);
  assert.deepEqual(parseWorkspace(text), source.workspace);
  JSON.parse(text).documentFiles.forEach((file: any, index: number) => assert.deepEqual(Buffer.from(file.data, 'base64'), Buffer.from(source.buffers[index])));
};
function legacyText(source: ReturnType<typeof input>, compact = true) {
  return JSON.stringify({ ...JSON.parse(exportWorkspace(source.workspace, { compact })), documentFiles: source.files.map((file, index) => ({ documentId: file.documentId, data: Buffer.from(source.buffers[index]).toString('base64') })) }, null, compact ? undefined : 2);
}

test('seven recovery points with different document IDs share one exact binary copy', () => fixture(async directory => {
  const bytes = Buffer.alloc(1024 * 1024, 71), store = createBackupStore({ directory });
  const sources = [], entries = [];
  for (let index = 0; index < 7; index++) {
    const source = input([bytes], `Synthetic point ${index}`); sources.push(source);
    entries.push(await send(store, source, { baseline: index < 2 }));
  }
  assert.deepEqual(await assetNames(directory), [`${hash(bytes)}.bin`]);
  assert.equal((await store.list()).length, 7);
  assert.equal((await store.list()).filter((entry: any) => entry.baseline).length, 2);
  assert.ok(entries.reduce((sum, entry) => sum + entry.size, 0) < 64000);
  for (let index = 0; index < entries.length; index++) await assertRestores(store, entries[index], sources[index]);
}));

test('same filename and length do not merge different content; duplicate content within one point does merge', () => fixture(async directory => {
  const a = Buffer.from('synthetic A'), b = Buffer.from('synthetic B'), source = input([a, b, a]);
  const store = createBackupStore({ directory }), entry = await send(store, source);
  assert.equal((await assetNames(directory)).length, 2); await assertRestores(store, entry, source);
  assert.equal((await send(store, source)).id, entry.id); assert.equal((await store.list()).length, 1);
}));

test('rotation retains protected and current attachments and removes only their last unreferenced copies', () => fixture(async directory => {
  const store = createBackupStore({ directory, retain: 1 });
  const sources = 'ABCDE'.split('').map(letter => input([Buffer.from(`Synthetic ${letter}`)]));
  const a = await send(store, sources[0], { baseline: true }), b = await send(store, sources[1], { baseline: true });
  await send(store, sources[2]); const d = await send(store, sources[3]);
  assert.deepEqual(new Set(await assetNames(directory)), new Set([0, 1, 3].map(index => `${hash(sources[index].buffers[0])}.bin`)));
  const e = await send(store, sources[4], { baseline: true });
  assert.deepEqual(new Set((await store.list()).map((entry: any) => entry.id)), new Set([b.id, d.id, e.id]));
  assert.ok(!(await store.list()).some((entry: any) => entry.id === a.id));
  assert.deepEqual(new Set(await assetNames(directory)), new Set([1, 3, 4].map(index => `${hash(sources[index].buffers[0])}.bin`)));
  for (const [entry, source] of [[b, sources[1]], [d, sources[3]], [e, sources[4]]] as const) await assertRestores(store, entry, source);
}));

test('an incomplete upload removes its orphan binaries without changing a previous recovery point', () => fixture(async directory => {
  const store = createBackupStore({ directory }), good = input([Buffer.from('Synthetic retained attachment')]);
  const entry = await send(store, good), source = input([Buffer.from('Synthetic new orphan'), Buffer.alloc(90)]);
  const id = await store.begin({ metadata: exportWorkspace(source.workspace, { compact: true }), files: source.files });
  await store.append({ id, index: 0, bytes: source.buffers[0] }); await store.append({ id, index: 1, bytes: source.buffers[1].subarray(0, 10) });
  await assert.rejects(store.finish(id), /不完整/);
  assert.deepEqual(await assetNames(directory), [`${hash(good.buffers[0])}.bin`]);
  assert.equal((await fs.readdir(join(directory, 'Attachments'))).some(name => name.startsWith('.pending-')), false);
  await assertRestores(store, entry, good);
}));

test('missing or damaged shared attachments are detected, then repaired by the next verified upload', () => fixture(async directory => {
  const store = createBackupStore({ directory }), source = input([Buffer.from('Synthetic original bytes')]), entry = await send(store, source);
  const path = join(directory, 'Attachments', `${hash(source.buffers[0])}.bin`);
  await fs.writeFile(path, Buffer.alloc(source.buffers[0].length, 33));
  await assert.rejects(store.read(entry.id), /完整性校验/);
  await send(store, source); await assertRestores(store, entry, source);
  await fs.unlink(path); await assert.rejects(store.read(entry.id));
  await send(store, source); await assertRestores(store, entry, source);
}));

test('unreadable manifests or protection indexes stop attachment cleanup instead of guessing references', () => fixture(async directory => {
  const store = createBackupStore({ directory }), source = input([Buffer.from('Synthetic protected original')]);
  const protectedEntry = await send(store, source, { baseline: true });
  await fs.writeFile(join(directory, protectedEntry.id), 'damaged manifest');
  const orphan = Buffer.from('Synthetic unreferenced copy'), orphanPath = join(directory, 'Attachments', `${hash(orphan)}.bin`);
  await fs.writeFile(orphanPath, orphan);
  const next = input([Buffer.from('Synthetic usable next')]), entry = await send(store, next);
  assert.ok((await assetNames(directory)).includes(`${hash(source.buffers[0])}.bin`));
  assert.ok((await assetNames(directory)).includes(`${hash(orphan)}.bin`)); await assertRestores(store, entry, next);
  const names = await assetNames(directory); await fs.writeFile(join(directory, '_shared-upgrade-baselines.json'), '{damaged');
  await assert.rejects(send(store, input([Buffer.from('Synthetic rejected change')])), /旧备份未清理/);
  assert.deepEqual(await assetNames(directory), names); await assertRestores(store, entry, next);
}));

test('attachment sync failures leave every previous point readable and remove pending files', () => fixture(async directory => {
  const source = input([Buffer.from('Synthetic saved attachment')]), store = createBackupStore({ directory }), entry = await send(store, source);
  const broken = createBackupStore({ directory, io: { ...fs, async open(path: string, flags: string) {
    const handle = await fs.open(path, flags); if (flags !== 'wx') return handle;
    return { writeFile: handle.writeFile.bind(handle), close: handle.close.bind(handle), async sync() { throw Error('synthetic-disk-full'); } };
  } } });
  await assert.rejects(send(broken, input([Buffer.from('Synthetic unsaved bytes')])), /synthetic-disk-full/);
  assert.equal((await store.list()).length, 1); await assertRestores(store, entry, source);
  assert.deepEqual(await assetNames(directory), [`${hash(source.buffers[0])}.bin`]);
  assert.equal((await fs.readdir(join(directory, 'Attachments'))).some(name => name.startsWith('.pending-')), false);
}));

test('failed protection updates do not advance the upgrade marker or rotate previous points', () => fixture(async directory => {
  const source = input([Buffer.from('Synthetic pre-upgrade copy')]), first = createBackupStore({ directory, version: '1' });
  const original = await send(first, source, { upgrade: true });
  const broken = createBackupStore({ directory, version: '2', io: { ...fs, async rename(from: string, to: string) {
    if (to.endsWith('_shared-upgrade-baselines.json')) throw Error('synthetic-index-failure'); return fs.rename(from, to);
  } } });
  const next = input([Buffer.from('Synthetic new version')]);
  await assert.rejects(send(broken, next, { upgrade: true }), /synthetic-index-failure/);
  assert.equal(await broken.upgradeNeeded(), true); await assertRestores(first, original, source);
  const recovered = createBackupStore({ directory, version: '2' }), entry = await send(recovered, next, { upgrade: true });
  assert.equal(await recovered.upgradeNeeded(), false); await assertRestores(recovered, entry, next);
  const oldIndex = JSON.parse(await fs.readFile(join(directory, '_upgrade-baselines.json'), 'utf8'));
  assert.ok(oldIndex.every((id: string) => /^\d{13}-[a-f0-9]{64}\.json$/.test(id)));
  assert.equal((await recovered.list()).filter((item: any) => item.baseline).length, 2);
}));

test('failed deletion of an old manifest preserves its referenced attachment while the new point succeeds', () => fixture(async directory => {
  const first = createBackupStore({ directory, retain: 1 }), source = input([Buffer.from('Synthetic old bytes')]), original = await send(first, source);
  const guarded = createBackupStore({ directory, retain: 1, io: { ...fs, async unlink(path: string) {
    if (path.endsWith(original.id)) throw Error('synthetic-file-in-use'); return fs.unlink(path);
  } } });
  const next = input([Buffer.from('Synthetic new bytes')]), current = await send(guarded, next);
  await assertRestores(guarded, original, source); await assertRestores(guarded, current, next);
  assert.equal((await assetNames(directory)).length, 2);
}));

test('legacy JSON and shared points coexist; hydrated exports restore original bytes through the normal importer', () => fixture(async directory => {
  const source = input([new Uint8Array(Buffer.concat([Buffer.from('%PDF-1.7\n% Synthetic restore fixture.\n'), Buffer.from([0, 255, 40, 99, 7])]))]);
  for (let index = 0; index < source.files.length; index++) await saveDocumentBytes(source.files[index].documentId, source.buffers[index]);
  const legacyText = await exportWorkspaceWithFiles(source.workspace, { compact: true }), store = createBackupStore({ directory });
  const legacy = await store.write(legacyText), shared = await send(store, source);
  assert.equal(await store.read(legacy.id), legacyText);
  const text = await store.read(shared.id); assert.equal(text, legacyText); assert.ok(!text.includes('shared-attachments-v1'));
  const imported = await importWorkspaceWithFiles(text, createWorkspace());
  const document = imported.conversations.find(item => item.documents?.length)?.documents?.[0]; assert.ok(document);
  assert.deepEqual(await getDocumentBytes(document.id), source.buffers[0]);
  for (let index = 0; index < 6; index++) await send(store, input([source.buffers[0]], `Synthetic later ${index}`));
  assert.ok(!(await store.list()).some((entry: any) => entry.id === legacy.id));
  assert.deepEqual(await assetNames(directory), [`${hash(source.buffers[0])}.bin`]);
}));

test('a new process clears abandoned temporary files and unreferenced binaries, leaving unknown files alone', () => fixture(async directory => {
  await fs.mkdir(join(directory, 'Attachments'));
  const rootTemp = `.pending-${randomUUID()}`, assetTemp = `.pending-${randomUUID()}`;
  await fs.writeFile(join(directory, rootTemp), 'Synthetic abandoned metadata');
  await fs.writeFile(join(directory, 'Attachments', assetTemp), 'Synthetic abandoned bytes');
  await fs.writeFile(join(directory, 'Attachments', `${hash('orphan')}.bin`), 'orphan');
  await fs.writeFile(join(directory, 'Attachments', 'unrecognized.txt'), 'Synthetic untouched file');
  const store = createBackupStore({ directory }), entry = await send(store, input([]));
  assert.equal((await fs.readdir(directory)).includes(rootTemp), false);
  assert.deepEqual(await fs.readdir(join(directory, 'Attachments')), ['unrecognized.txt']);
  assert.ok(await store.read(entry.id));
}));

test('forged attachment references and incomplete descriptor pairs are rejected before accessing any external path', () => fixture(async directory => {
  const store = createBackupStore({ directory }), source = input([Buffer.from('Synthetic original')]), metadata = exportWorkspace(source.workspace, { compact: true });
  await assert.rejects(store.begin({ metadata, files: [{ documentId: 'unknown' }] }), /附件/);
  await assert.rejects(store.begin({ metadata: JSON.stringify({ ...JSON.parse(metadata), modelProfiles: [] }), files: source.files }), /格式/);
  const manifest = JSON.stringify({ format: 'shared-attachments-v1', metadata: JSON.parse(metadata), files: [{ ...source.files[0], hash: '../external-file' }] });
  const id = `1793836800000-${hash(manifest)}.snapshot.json`; await fs.writeFile(join(directory, id), manifest);
  await assert.rejects(store.read(id), /附件无效/);
  for (const invalid of ['../external-file', '/file', '', 1]) await assert.rejects(store.read(invalid), /名称无效/);
}));

test('a partially completed cross-format index update converges back to two protected points', () => fixture(async directory => {
  const store = createBackupStore({ directory }), entries = [];
  for (let index = 0; index < 4; index++) entries.push(await send(store, input([Buffer.from(`Synthetic point ${index}`)])));
  await fs.writeFile(join(directory, '_shared-upgrade-baselines.json'), JSON.stringify(entries.map(entry => entry.id)));
  const entry = await send(store, input([Buffer.from('Synthetic newest protected point')]), { baseline: true });
  const index = JSON.parse(await fs.readFile(join(directory, '_shared-upgrade-baselines.json'), 'utf8'));
  assert.equal(index.length, 2); assert.ok(index.includes(entry.id));
  for (const point of await store.list()) await store.read(point.id);
}));

test('legacy attachment extraction crosses chunk and Unicode boundaries without changing records or bytes', () => fixture(async directory => {
  const source = input([0, 1, 2, 3, 7, 262151].map(size => Uint8Array.from({ length: size }, (_, index) => index % 256)));
  source.workspace.conversations[0].title = 'Synthetic documentFiles 中文 "quoted" \\ passage';
  source.workspace.conversations[0].documents![0].pages[0].text = '虚构文本 "documentFiles" \\ / '.repeat(12000);
  const store = createBackupStore({ directory, retain: 10 }), text = legacyText(source, false), old = await store.baseline(text);
  await send(store, input([]));
  assert.equal((await fs.readdir(directory)).includes(old.id), false);
  const replacement = (await store.list()).find((entry: any) => entry.baseline);
  assert.ok(replacement?.sharedAttachments); assert.equal(replacement.createdAt, old.createdAt);
  assert.deepEqual(JSON.parse(await store.read(replacement.id)), JSON.parse(text));
  assert.deepEqual(parseWorkspace(await store.read(replacement.id)), source.workspace);
  assert.equal((await assetNames(directory)).length, 6);
}));

test('existing five ordinary and two protected complete backups compact to one shared attachment', () => fixture(async directory => {
  const bytes = Buffer.alloc(1024 * 1024, 19), store = createBackupStore({ directory });
  for (let index = 0; index < 7; index++) {
    const text = legacyText(input([bytes], `Synthetic old point ${index}`), index >= 2);
    if (index < 2) await store.baseline(text); else await store.write(text);
  }
  const old = await store.list(); assert.equal(old.length, 7);
  const next = input([bytes], 'Synthetic first shared point'); await send(store, next, { upgrade: true });
  const points = await store.list(); assert.equal(points.length, 7);
  assert.ok(points.every((entry: any) => entry.sharedAttachments));
  assert.equal(points.filter((entry: any) => entry.baseline).length, 2);
  assert.deepEqual(await assetNames(directory), [`${hash(bytes)}.bin`]);
  assert.ok(points.reduce((sum: number, entry: any) => sum + entry.size, 0) < 64000);
  for (const point of points) await store.read(point.id);
  assert.ok((await fs.readdir(directory)).every(name => !/^\d{13}-[a-f0-9]{64}\.json$/.test(name)));
}));

test('unsupported old JSON layouts and checksum failures retain the original rather than guessing a conversion', () => fixture(async directory => {
  const source = input([Buffer.from('Synthetic old attachment')]), data = JSON.parse(legacyText(source));
  const text = JSON.stringify({ documentFiles: data.documentFiles, ...JSON.parse(exportWorkspace(source.workspace, { compact: true })) });
  const store = createBackupStore({ directory, retain: 10 }), unsupported = await store.write(text);
  const damaged = await store.write(legacyText(input([Buffer.from('Synthetic damaged original')])));
  const damagedText = (await fs.readFile(join(directory, damaged.id), 'utf8')).replace('Synthetic paper', 'Modified paper');
  await fs.writeFile(join(directory, damaged.id), damagedText);
  await send(store, input([]));
  assert.equal(await fs.readFile(join(directory, unsupported.id), 'utf8'), text); assert.equal(await store.read(unsupported.id), text);
  assert.equal(await fs.readFile(join(directory, damaged.id), 'utf8'), damagedText); await assert.rejects(store.read(damaged.id), /完整性校验/);
  assert.deepEqual(await assetNames(directory), []);
}));

test('conversion publication failure keeps the old point and protection while a current checkpoint still succeeds', () => fixture(async directory => {
  const source = input([Buffer.from('Synthetic protected old attachment')]), originalStore = createBackupStore({ directory });
  const old = await originalStore.baseline(legacyText(source, false));
  const broken = createBackupStore({ directory, retain: 10, io: { ...fs, async rename(from: string, to: string) {
    if (to.includes(`${old.createdAt}-`) && to.endsWith('.snapshot.json')) throw Error('synthetic-conversion-publish-failure');
    return fs.rename(from, to);
  } } });
  const current = await send(broken, input([])); assert.ok(await broken.read(current.id));
  assert.ok((await broken.list()).some((entry: any) => entry.id === old.id && entry.baseline));
  await assertRestores(broken, old, source);
  assert.deepEqual(await assetNames(directory), []);
}));

test('restarting after an old-file removal failure reuses the verified replacement and finishes cleanup', () => fixture(async directory => {
  const source = input([Buffer.from('Synthetic old bytes')]), originalStore = createBackupStore({ directory });
  const old = await originalStore.baseline(legacyText(source, false));
  const first = createBackupStore({ directory, retain: 10, io: { ...fs, async unlink(path: string) {
    if (path.endsWith(old.id)) throw Error('synthetic-legacy-file-in-use'); return fs.unlink(path);
  } } });
  await send(first, input([]));
  assert.ok((await fs.readdir(directory)).includes(old.id));
  const replacement = (await first.list()).find((entry: any) => entry.sharedAttachments && entry.baseline); assert.ok(replacement);
  await assertRestores(first, replacement, source);
  const restarted = createBackupStore({ directory, retain: 10 }); await send(restarted, input([]));
  assert.ok(!(await fs.readdir(directory)).includes(old.id));
  assert.equal((await restarted.list()).filter((entry: any) => entry.id.endsWith(replacement.id)).length, 1);
  await assertRestores(restarted, replacement, source);
}));

test('conversion reuses an identical current snapshot instead of making a duplicate recovery point', () => fixture(async directory => {
  const source = input([Buffer.from('Synthetic identical bytes')]), store = createBackupStore({ directory });
  const old = await store.write(legacyText(source));
  const current = await send(store, source, { upgrade: true });
  assert.equal((await store.list()).length, 1); assert.equal((await store.list())[0].id, current.id);
  assert.ok(!(await fs.readdir(directory)).includes(old.id)); await assertRestores(store, current, source);
}));

test('retrying protection after its first stage succeeded completes both indexes before advancing the app version', () => fixture(async directory => {
  const original = createBackupStore({ directory }), source = input([Buffer.from('Synthetic existing protected bytes')]);
  await original.baseline(legacyText(source, false)); await original.baseline(legacyText(input([source.buffers[0]], 'Synthetic second baseline'), false));
  const next = input([source.buffers[0]], 'Synthetic upgrade after a partial index write');
  const broken = createBackupStore({ directory, version: '2', io: { ...fs, async rename(from: string, to: string) {
    if (to.endsWith('_upgrade-baselines.json') && !to.endsWith('_shared-upgrade-baselines.json')) throw Error('synthetic-second-index-failure'); return fs.rename(from, to);
  } } });
  await assert.rejects(send(broken, next, { upgrade: true }), /synthetic-second-index-failure/);
  assert.equal(await broken.upgradeNeeded(), true); assert.equal((await original.list()).filter((entry: any) => entry.baseline).length, 3);
  const restarted = createBackupStore({ directory, version: '2' }); await send(restarted, next, { upgrade: true });
  assert.equal(await restarted.upgradeNeeded(), false); assert.equal((await restarted.list()).filter((entry: any) => entry.baseline).length, 2);
  for (const entry of await restarted.list()) await restarted.read(entry.id);
}));

test('a missing protected manifest prevents orphan collection and rotation while a new ordinary point remains usable', () => fixture(async directory => {
  const store = createBackupStore({ directory, retain: 1 }), source = input([Buffer.from('Synthetic protected missing metadata')]);
  const baseline = await send(store, source, { baseline: true }); await fs.unlink(join(directory, baseline.id));
  const olderSource = input([Buffer.from('Synthetic ordinary older')]), older = await send(store, olderSource);
  const latestSource = input([Buffer.from('Synthetic ordinary latest')]), latest = await send(store, latestSource);
  assert.deepEqual(new Set(await assetNames(directory)), new Set([source, olderSource, latestSource].map(item => `${hash(item.buffers[0])}.bin`)));
  await assertRestores(store, older, olderSource); await assertRestores(store, latest, latestSource);
}));
