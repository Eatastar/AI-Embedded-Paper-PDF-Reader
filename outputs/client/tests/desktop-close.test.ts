import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const { installDesktopBridge, createCloseGuard } = createRequire(import.meta.url)('../desktop/desktop-bridge.cjs');

function harness(timeoutMs = 1000, onLocale = (_locale: string) => {}) {
  const handlers = new Map<string, Function>(), sent: unknown[][] = [];
  const ipc = Object.assign(new EventEmitter(), { handle: (name: string, handler: Function) => handlers.set(name, handler), removeHandler: (name: string) => handlers.delete(name) });
  const frame = { url: 'http://127.0.0.1:4327/' };
  const contents = { mainFrame: frame, send: (...args: unknown[]) => sent.push(args) };
  const event = { sender: contents, senderFrame: frame };
  const bridge = installDesktopBridge({ ipcMain: ipc, window: { webContents: contents }, timeoutMs, onLocale, isLocalPage: (url: string) => url.startsWith('http://127.0.0.1:4327/'), backupStore: { list: async () => ['local-backup'], read: async (id: string) => id, write: async (text: string) => text } });
  return { ipc, handlers, sent, event, bridge };
}

test('native menu language accepts only supported values from the trusted top-level page', () => {
  const accepted: string[] = [], { ipc, event, bridge } = harness(1000, locale => accepted.push(locale));
  ipc.emit('learn:locale', event, 'en');
  ipc.emit('learn:locale', event, 'zh-CN');
  for (const locale of ['es', 'ja', 'zh-TW', 'de', 'ar', 'fr']) ipc.emit('learn:locale', event, locale);
  ipc.emit('learn:locale', event, 'xx');
  ipc.emit('learn:locale', { ...event, sender: {} }, 'en');
  ipc.emit('learn:locale', { ...event, senderFrame: { url: event.senderFrame.url } }, 'en');
  assert.deepEqual(accepted, ['en', 'zh-CN', 'es', 'ja', 'zh-TW', 'de', 'ar', 'fr']);
  bridge.dispose(); assert.equal(ipc.listenerCount('learn:locale'), 0);
});

test('保存握手只接受本地顶层窗口的正确请求 ID，重复关闭共用一次等待', async () => {
  const { ipc, sent, event, bridge } = harness();
  assert.equal(await bridge.waitForSave(), false, '页面未就绪时不能声称保存成功');
  ipc.emit('learn:ready', event);
  const first = bridge.waitForSave(); assert.equal(bridge.waitForSave(), first);
  const id = sent[0][1];
  ipc.emit('learn:close-result', event, { id: 'unrelated', ok: true });
  ipc.emit('learn:close-result', { ...event, senderFrame: { url: 'https://foreign.example' } }, { id, ok: true });
  assert.equal(sent.length, 1);
  ipc.emit('learn:close-result', event, { id, ok: true });
  assert.equal(await first, true);
  bridge.dispose();
});

test('无响应、失败和窗口销毁都返回保存未完成，不能误当作成功', async () => {
  const { ipc, sent, event, bridge, handlers } = harness(8);
  ipc.emit('learn:ready', event); assert.equal(await bridge.waitForSave(), false);
  const failed = bridge.waitForSave(); ipc.emit('learn:close-result', event, { id: sent[1][1], ok: false }); assert.equal(await failed, false);
  const pending = bridge.waitForSave(); bridge.dispose(); assert.equal(await pending, false);
  assert.equal(handlers.size, 0); assert.equal(ipc.listenerCount('learn:ready'), 0);
});

test('备份只向可信顶层页面开放，其他窗口、子页面和跨站页面均被拒绝', async () => {
  const { event, bridge, handlers } = harness();
  const list = handlers.get('learn:backups-list')!;
  assert.deepEqual(await list(event), ['local-backup']);
  for (const invalid of [{ ...event, sender: {} }, { ...event, senderFrame: { url: event.senderFrame.url } }, { ...event, senderFrame: undefined }]) assert.throws(() => list(invalid), /无法访问/);
  event.senderFrame.url = 'https://foreign.example'; assert.throws(() => list(event), /无法访问/);
  bridge.dispose();
});

test('关闭先等待保存，再关本机服务；并发关闭只执行一次', async () => {
  let release!: (value: boolean) => void;
  const saving = new Promise<boolean>(resolve => { release = resolve; }), trace: string[] = [];
  const guard = createCloseGuard({ save: () => saving, shutdown: async () => { trace.push('shutdown'); }, quit: () => trace.push('quit'), choose: async () => 'cancel' });
  const first = guard.request(); assert.equal(guard.request(), first); assert.deepEqual(trace, []); assert.equal(guard.approved, false);
  release(true); await first; assert.deepEqual(trace, ['shutdown', 'quit']); assert.equal(guard.approved, true);
});

test('保存失败选择取消会保留窗口和服务；重试确实再次保存', async () => {
  const trace: string[] = []; let saves = 0, choice = 'cancel';
  const guard = createCloseGuard({ save: async () => ++saves > 2, shutdown: async () => { trace.push('shutdown'); }, quit: () => trace.push('quit'), choose: async () => choice });
  await guard.request(); assert.equal(saves, 1); assert.deepEqual(trace, []); assert.equal(guard.approved, false);
  choice = 'retry'; await guard.request(); assert.equal(saves, 3); assert.deepEqual(trace, ['shutdown', 'quit']);
});

test('仅当用户明确选择直接退出时，允许在保存失败后退出', async () => {
  const trace: string[] = [];
  const guard = createCloseGuard({ save: async () => { throw new Error('save failed'); }, choose: async () => 'leave', shutdown: async () => { trace.push('shutdown'); }, quit: () => trace.push('quit') });
  await guard.request(); assert.deepEqual(trace, ['shutdown', 'quit']);
});

test('隔离预载桥等待异步保存，传播失败和取消通知，清理后不残留监听', async () => {
  const source = await readFile(new URL('../desktop/preload.cjs', import.meta.url), 'utf8');
  let bridge: any; const sent: unknown[][] = [];
  const ipc = Object.assign(new EventEmitter(), { send: (...args: unknown[]) => sent.push(args), invoke: async () => [] });
  vm.runInNewContext(source, { require(name: string) { assert.equal(name, 'electron', '预载桥不允许访问文件系统'); return { ipcRenderer: ipc, contextBridge: { exposeInMainWorld(name: string, value: any) { assert.equal(name, 'learnSomething'); bridge = value; } } }; } });
  let release!: () => void, cancelled = false, fail = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const dispose = bridge.onPrepareClose(async () => { if (fail) throw new Error('failed'); await gate; }, () => { cancelled = true; });
  ipc.emit('learn:prepare-close', {}, 'attempt-1');
  assert.equal(sent.length, 1); assert.equal(sent[0][0], 'learn:ready');
  release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal((sent[1][1] as any).ok, true);
  fail = true; ipc.emit('learn:prepare-close', {}, 'attempt-2'); await new Promise(resolve => setImmediate(resolve));
  assert.equal((sent[2][1] as any).ok, false);
  ipc.emit('learn:cancel-close'); assert.equal(cancelled, true);
  dispose(); assert.equal(ipc.listenerCount('learn:prepare-close'), 0); assert.equal(ipc.listenerCount('learn:cancel-close'), 0);
  assert.equal(sent.at(-1)![0], 'learn:not-ready');
});
