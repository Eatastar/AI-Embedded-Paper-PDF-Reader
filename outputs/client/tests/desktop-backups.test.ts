import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createWorkspace } from '../src/domain/workspace';
const { createBackupStore } = createRequire(import.meta.url)('../desktop/backup-store.cjs');
const content = (title: string) => { const value = createWorkspace(); value.conversations[0].title = title; return JSON.stringify(value); };

async function fixture(run: (directory: string) => Promise<void>) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'learn-backup-test-'));
  try { await run(directory); } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

test('自动备份串行提交、同一时刻有唯一名称，仅在成功之后轮换到最近 5 份', () => fixture(async directory => {
  const store = createBackupStore({ directory, now: () => 1793836800000 });
  const entries = await Promise.all(Array.from({ length: 8 }, (_, i) => store.write(content(`测试 ${i}`))));
  const files = await store.list();
  assert.equal(files.length, 5); assert.equal(new Set(entries.map((entry: any) => entry.id)).size, 8);
  assert.deepEqual(files.map((entry: any) => entry.id), entries.slice(3).reverse().map((entry: any) => entry.id));
  for (let i = 0; i < files.length; i++) assert.equal(JSON.parse(await store.read(files[i].id)).conversations[0].title, `测试 ${7 - i}`);
  assert.equal((await fs.readdir(directory)).some(name => name.startsWith('.pending-')), false);
}));

test('备份内容相同时不浪费恢复点；损坏的相同内容会重新写入并校验', () => fixture(async directory => {
  const store = createBackupStore({ directory }), text = content('同一份完整记录');
  const first = await store.write(text), same = await store.write(text);
  assert.equal(same.id, first.id); assert.equal((await store.list()).length, 1);
  await fs.writeFile(join(directory, first.id), 'damaged');
  await assert.rejects(store.read(first.id), /完整性校验/);
  const repaired = await store.write(text);
  assert.notEqual(repaired.id, first.id); assert.equal(await store.read(repaired.id), text);
}));

test('写入或同步失败保留全部旧备份，并清除未完成的临时文件', () => fixture(async directory => {
  const store = createBackupStore({ directory });
  for (let i = 0; i < 5; i++) await store.write(content(`可靠记录 ${i}`));
  const original = await store.list();
  const broken = createBackupStore({ directory, io: { ...fs, async open(path: string, flags: string) { const handle = await fs.open(path, flags); return { writeFile: handle.writeFile.bind(handle), close: handle.close.bind(handle), async sync() { throw new Error('simulated-disk-full'); } }; } } });
  await assert.rejects(broken.write(content('失败记录')), /simulated-disk-full/);
  assert.deepEqual(await store.list(), original);
  assert.equal((await fs.readdir(directory)).some(name => name.startsWith('.pending-')), false);
  for (const entry of original) await store.read(entry.id);
}));

test('备份入口拒绝任意路径、模型配置和不完整的根结构', () => fixture(async directory => {
  const store = createBackupStore({ directory });
  for (const name of ['../model-profiles.json', 'C:/virtual/secret.json', '', 1]) await assert.rejects(store.read(name), /名称无效/);
  for (const text of ['{broken', '{}', JSON.stringify({ ...createWorkspace(), apiKey: 'never-export-secret' })]) await assert.rejects(store.write(text), /格式无效/);
  assert.equal((await store.list()).length, 0);
}));
