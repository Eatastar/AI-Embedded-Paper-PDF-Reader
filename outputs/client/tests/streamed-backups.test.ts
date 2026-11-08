import test from 'node:test';
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createWorkspace, makeId } from '../src/domain/workspace';
import { exportWorkspace, exportWorkspaceBlob, exportWorkspaceWithFiles, parseWorkspace, saveDocumentBytes } from '../src/adapters/storage';
import { writeLocalCheckpoint, BACKUP_CHUNK_BYTES } from '../src/adapters/checkpoint';
import type { DesktopBridge } from '../src/adapters/desktop';
const { createBackupStore } = createRequire(import.meta.url)('../desktop/backup-store.cjs');
async function fixture(run: (directory: string) => Promise<void>) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'synthetic-streamed-backups-'));
  try { await run(directory); } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
function data() {
  const workspace = createWorkspace(), files = [0, 1, 2, 7, 262151].map(size => ({ documentId: makeId(), size }));
  workspace.conversations[0].documents = files.map(file => ({ id: file.documentId, size: file.size, name: 'Synthetic.pdf', kind: 'pdf' as const, mimeType: 'application/pdf', createdAt: 1, pages: [{ pageNumber: 1, messageId: makeId(), versionId: makeId(), text: 'Synthetic text 中文' }] }));
  return { workspace, files, bytes: files.map(file => Uint8Array.from({ length: file.size }, (_, n) => n % 256)) };
}
async function send(store: any, input = data(), options = {}) {
  const id = await store.begin({ metadata: exportWorkspace(input.workspace, { compact: true }), files: input.files, ...options });
  for (let index = 0; index < input.files.length; index++) {
    const bytes = input.bytes[index];
    for (let offset = 0; offset < bytes.length; offset += 65537) await store.append({ id, index, bytes: bytes.subarray(offset, offset + 65537) });
  }
  return store.finish(id);
}
test('raw chunks crossing Base64 boundaries produce an old-reader-compatible complete backup', () => fixture(async directory => {
  const store = createBackupStore({ directory }), input = data(), entry = await send(store, input);
  const text = await store.read(entry.id), saved = JSON.parse(text);
  assert.deepEqual(parseWorkspace(text), input.workspace);
  saved.documentFiles.forEach((file: any, index: number) => assert.deepEqual(new Uint8Array(Buffer.from(file.data, 'base64')), input.bytes[index]));
  assert.equal(entry.sharedAttachments, true); assert.equal(entry.size, (await fs.stat(join(directory, entry.id))).size);
  assert.ok(entry.size < Buffer.byteLength(text)); assert.equal((await fs.readdir(directory)).some(name => name.startsWith('.pending-')), false);
}));
test('incomplete, oversized, cancelled or conflicting streams preserve every previous backup', () => fixture(async directory => {
  const store = createBackupStore({ directory }), input = data(); await send(store, input); const before = await store.list();
  let id = await store.begin({ metadata: exportWorkspace(input.workspace, { compact: true }), files: input.files });
  await assert.rejects(store.finish(id), /不完整/); assert.deepEqual(await store.list(), before);
  id = await store.begin({ metadata: exportWorkspace(input.workspace, { compact: true }), files: input.files });
  await assert.rejects(store.begin({ metadata: exportWorkspace(createWorkspace()), files: [] }), /正在写入/);
  await assert.rejects(store.append({ id, index: 1, bytes: new Uint8Array(262145) }), /分块/);
  id = await store.begin({ metadata: exportWorkspace(input.workspace, { compact: true }), files: input.files }); await store.abort(id);
  assert.deepEqual(await store.list(), before); assert.equal((await fs.readdir(directory)).some(name => name.startsWith('.pending-')), false);
}));
test('each app version gets a protected checkpoint only after complete, verified persistence', () => fixture(async directory => {
  const input = data(), store = createBackupStore({ directory, version: '0.1.33' });
  assert.equal(await store.upgradeNeeded(), true);
  const id = await store.begin({ metadata: exportWorkspace(input.workspace, { compact: true }), files: input.files, upgrade: true });
  await store.abort(id); assert.equal(await store.upgradeNeeded(), true);
  const baseline = await send(store, input, { upgrade: true }); assert.equal(await store.upgradeNeeded(), false);
  for (let i = 0; i < 7; i++) { const next = createWorkspace(); next.conversations[0].title = `synthetic-${i}`; await store.write(exportWorkspace(next, { compact: true })); }
  assert.ok((await store.list()).some((entry: any) => entry.id === baseline.id && entry.baseline));
  assert.equal(await createBackupStore({ directory, version: '0.1.34' }).upgradeNeeded(), true);
}));

test('renderer checkpoints use bounded raw IPC and Blob exports preserve the exact legacy JSON', () => fixture(async directory => {
  const input = data(), store = createBackupStore({ directory });
  for (let i = 0; i < input.files.length; i++) await saveDocumentBytes(input.files[i].documentId, input.bytes[i]);
  let chunks = 0;
  const bridge = { backups: { ...store, write() { throw Error('full-string IPC must not be used'); }, async append(chunk: any) { assert.ok(chunk.bytes.byteLength <= BACKUP_CHUNK_BYTES); assert.ok(chunk.bytes.buffer.byteLength <= BACKUP_CHUNK_BYTES); chunks++; return store.append(structuredClone(chunk)); } } } as unknown as DesktopBridge;
  const entry = await writeLocalCheckpoint(input.workspace, {}, bridge);
  const saved = await store.read(entry.id), expected = await exportWorkspaceWithFiles(input.workspace, { compact: true });
  assert.equal(saved, expected); assert.ok(chunks >= 5);
  assert.equal(await (await exportWorkspaceBlob(input.workspace, { compact: true })).text(), expected);
  const legacy = await exportWorkspaceWithFiles(input.workspace);
  assert.equal(await (await exportWorkspaceBlob(input.workspace)).text(), legacy);
}));
