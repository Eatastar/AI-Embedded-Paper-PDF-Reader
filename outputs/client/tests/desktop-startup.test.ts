import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const mainSource = await readFile(new URL('../desktop/main.cjs', import.meta.url), 'utf8');
const startupSource = await readFile(new URL('../desktop/startup.cjs', import.meta.url), 'utf8');

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// The real startup helpers run against an in-memory file system and controlled
// timers. No Electron process, network listener, or user-data directory is used.
function startupHarness(options: { writeFails?: boolean; existingSize?: number } = {}) {
  let nextTimer = 0;
  const timers = new Map<number, { callback: () => void; milliseconds: number }>();
  const cleared: number[] = [];
  const files = new Map<string, string>();
  const renames: [string, string][] = [];
  const fakeFs = {
    mkdirSync() { if (options.writeFails) throw new Error('Read-only test directory'); },
    statSync() { return { size: options.existingSize ?? 0 }; },
    renameSync(from: string, to: string) { renames.push([from, to]); },
    appendFileSync(path: string, value: string) { files.set(path, (files.get(path) ?? '') + value); },
  };
  const module = { exports: {} as any };
  vm.runInNewContext(startupSource, {
    module,
    require(id: string) {
      if (id === 'node:fs') return fakeFs;
      if (id === 'node:path') return require(id);
      throw new Error('Unexpected startup dependency: ' + id);
    },
    setTimeout(callback: () => void, milliseconds: number) {
      const id = ++nextTimer;
      timers.set(id, { callback, milliseconds });
      return id;
    },
    clearTimeout(id: number) { timers.delete(id); cleared.push(id); },
  }, { filename: 'desktop/startup.cjs' });
  return {
    helpers: module.exports,
    timers,
    cleared,
    files,
    renames,
    fireTimeout() {
      assert.equal(timers.size, 1, 'A single startup wait should be pending');
      [...timers.values()][0].callback();
    },
  };
}

type CodeCacheState = { build?: string; clearCalls: number; fail?: boolean };
type HarnessOptions = { smoke?: boolean; ownsLock?: boolean; listenAutomatically?: boolean; codeCache?: CodeCacheState };

function mainHarness(options: HarnessOptions = {}) {
  const startup = startupHarness();
  const ready = deferred();
  const page = deferred();
  const trace: string[] = [];
  const windows: FakeWindow[] = [];
  const dialogs: [string, string][] = [];
  const reports: string[] = [];
  const exitCodes: number[] = [];
  const switches = new Map<string, string>();
  const codeCache: CodeCacheState = options.codeCache ?? { clearCalls: 0 };
  let serverOptions: any;
  const fakeProcess = Object.assign(new EventEmitter(), {
    argv: options.smoke ? ['MarginChat.exe', '--smoke-test'] : ['MarginChat.exe'],
    env: options.smoke ? { MARGIN_TEST_USER_DATA: 'C:/virtual/smoke', MARGIN_SMOKE_REPORT: 'C:/virtual/report.json' } : {},
    pid: 1234,
  });
  const app = Object.assign(new EventEmitter(), {
    isPackaged: true,
    commandLine: { appendSwitch(name: string, value: string) { switches.set(name, value); } },
    setName() {},
    setPath() {},
    getPath() { return 'C:/virtual/app-data'; },
    getVersion() { return '0.1.2'; },
    requestSingleInstanceLock() { return options.ownsLock !== false; },
    whenReady() { return ready.promise; },
    setAppUserModelId() {},
    quit() { trace.push('app.quit'); },
    exit(code: number) { exitCodes.push(code); trace.push('app.exit'); },
  });
  const server = Object.assign(new EventEmitter(), {
    listening: false,
    listen(port: number, host: string) {
      trace.push(`server.listen:${host}:${port}`);
      if (options.listenAutomatically !== false) queueMicrotask(() => {
        server.listening = true;
        server.emit('listening');
      });
    },
    address() { return { port: 4327 }; },
    closeAllConnections() { trace.push('server.closeAllConnections'); },
    close(callback: () => void) { server.listening = false; trace.push('server.close'); callback(); },
  });
  class FakeWindow extends EventEmitter {
    minimized = false;
    options: any;
    webContents = Object.assign(new EventEmitter(), {
      setWindowOpenHandler() {},
      getURL() { return 'http://127.0.0.1:4327'; },
    });
    constructor(windowOptions: unknown) {
      super();
      this.options = windowOptions;
      windows.push(this);
      trace.push('window.created');
    }
    loadURL() { trace.push('window.loadURL'); return page.promise; }
    show() { trace.push('window.show'); }
    focus() { trace.push('window.focus'); }
    isMinimized() { return this.minimized; }
    restore() { this.minimized = false; trace.push('window.restore'); }
  }
  const defaultSession = {
    webRequest: { onBeforeSendHeaders() {}, onHeadersReceived() {} },
    setPermissionRequestHandler() {},
    setPermissionCheckHandler() {},
    async clearCodeCaches() {
      codeCache.clearCalls += 1;
      if (codeCache.fail) throw Object.assign(new Error('Cache unavailable'), { code: 'EIO' });
    },
    flushStorageData() { trace.push('session.flushStorageData'); },
    async forceReloadProxyConfig() { trace.push('session.proxy-reloaded'); },
    async fetch() { trace.push('session.model-fetch'); return new Response('model-response'); },
  };
  const electron = {
    ipcMain: Object.assign(new EventEmitter(), { handle() {}, removeHandler() {} }),
    app,
    BrowserWindow: FakeWindow,
    Menu: { setApplicationMenu() {}, buildFromTemplate() { return { popup() {} }; } },
    dialog: { showErrorBox(title: string, message: string) { dialogs.push([title, message]); } },
    session: { defaultSession },
    shell: { async openExternal() {} },
  };
  vm.runInNewContext(mainSource, {
    require(id: string) {
      if (id === 'electron') return electron;
      if (id === './server.cjs') return { createAppServer(value: unknown) { serverOptions = value; return server; } };
      if (id === './startup.cjs') return startup.helpers;
      if (id === './profile-store.cjs') return { createProfileStore: () => ({ persistence: 'configuration', load: () => null, save() {} }) };
      if (id === './model-network.cjs') return require('../desktop/model-network.cjs');
      if (id === './request-log.cjs') return { createRequestLog: () => ({ write() {} }) };
      if (id === './backup-store.cjs') return { createBackupStore: () => ({ list: async () => [], read: async () => '', write: async () => ({}) }) };
      if (id === './desktop-bridge.cjs') return require('../desktop/desktop-bridge.cjs');
      if (id === './package.json') return { buildId: 'test-build' };
      if (id === 'node:fs/promises') return {
        async mkdir() {},
        async readFile(path: string) {
          assert.ok(path.endsWith('code-cache-build.txt'));
          if (codeCache.build === undefined) throw Object.assign(new Error('Stamp missing'), { code: 'ENOENT' });
          return codeCache.build;
        },
        async writeFile(path: string, value: string) {
          if (path.endsWith('code-cache-build.txt')) codeCache.build = value;
          else reports.push(value);
        },
      };
      if (['node:path', 'node:crypto', 'node:events'].includes(id)) return require(id);
      throw new Error('Unexpected main dependency: ' + id);
    },
    __dirname: 'C:/virtual/package',
    process: fakeProcess,
    URL,
    async fetch(url: string) {
      return url.endsWith('/api/settings')
        ? { status: 403, async json() { return { mode: 'demo', baseURL: 'https://api.deepseek.com', model: 'deepseek-flash', hasApiKey: false }; } }
        : { async text() { return '{"type":"done"}'; } };
    },
    setTimeout(callback: () => void) { queueMicrotask(callback); },
  }, { filename: 'desktop/main.cjs' });
  return {
    ...startup, ready, page, trace, windows, dialogs, reports, exitCodes, switches,
    app, server, process: fakeProcess,
    get serverOptions() { return serverOptions; },
    logEntries() {
      return [...startup.files.values()].flatMap(value => value.trim().split('\n').map(line => JSON.parse(line)));
    },
    async settle() { for (let i = 0; i < 5; i += 1) await new Promise(resolve => setImmediate(resolve)); },
  };
}

test('compiled code is refreshed once per build and stays available for later starts', async () => {
  const codeCache = { build: '0.1.2/old-build', clearCalls: 0 };
  const first = mainHarness({ codeCache });
  first.ready.resolve();
  await first.settle();
  assert.equal(codeCache.build, '0.1.2/test-build');
  assert.equal(codeCache.clearCalls, 1);
  assert.ok(first.logEntries().some(entry => entry.phase === 'code-cache-refreshed'));
  assert.ok(first.trace.includes('window.loadURL'));

  const restart = mainHarness({ codeCache });
  restart.ready.resolve();
  await restart.settle();
  assert.equal(codeCache.clearCalls, 1);
  assert.ok(restart.trace.includes('window.loadURL'));
});

test('compiled cache refresh failure leaves the build stamp available for a later retry', async () => {
  const codeCache = { build: 'old-build', clearCalls: 0, fail: true };
  const app = mainHarness({ codeCache });
  app.ready.resolve();
  app.page.resolve();
  await app.settle();
  assert.equal(codeCache.build, 'old-build');
  assert.equal(codeCache.clearCalls, 1);
  assert.ok(app.logEntries().some(entry => entry.phase === 'code-cache-refresh-skipped'));
  assert.ok(app.logEntries().some(entry => entry.phase === 'page-ready'));
});

test('desktop shows its normal window before page loading completes and retains renderer isolation', async () => {
  const app = mainHarness();
  assert.equal(app.switches.get('disk-cache-size'), String(24 * 1024 * 1024));
  app.ready.resolve();
  await app.settle();
  assert.equal(app.windows.length, 1);
  const window = app.windows[0];
  assert.equal(window.options.show, true, 'Startup must not look like an invisible hung process');
  assert.equal(window.options.webPreferences.sandbox, true);
  assert.equal(window.options.webPreferences.nodeIntegration, false);
  assert.equal(window.options.webPreferences.contextIsolation, true);
  assert.equal(window.options.webPreferences.webSecurity, true);
  assert.ok(app.trace.includes('window.loadURL'));
  assert.ok(!app.logEntries().some(entry => entry.phase === 'page-ready'));
  app.page.resolve();
  await app.settle();
  assert.ok(app.logEntries().some(entry => entry.phase === 'page-ready'));
  assert.equal(app.timers.size, 0);
  assert.equal(app.exitCodes.length, 0);
});

test('the actual desktop entry wires model calls to the system-proxy session', async () => {
  const app = mainHarness();
  app.ready.resolve(); await app.settle();
  assert.equal(app.serverOptions.transport, 'system-proxy');
  const response = await app.serverOptions.fetch('https://api.example/v1/responses', { method: 'POST', body: '{}' });
  assert.equal(await response.text(), 'model-response');
  assert.ok(app.trace.indexOf('session.proxy-reloaded') < app.trace.indexOf('session.model-fetch'));
  assert.equal(typeof app.serverOptions.onRequestLog, 'function');
  app.page.resolve(); await app.settle();
});

test('desktop smoke checks stay hidden and use only their isolated report path', async () => {
  const app = mainHarness({ smoke: true });
  app.ready.resolve();
  await app.settle();
  assert.equal(app.windows[0].options.show, false);
  app.page.resolve();
  await app.settle();
  assert.equal(app.dialogs.length, 0);
  assert.equal(app.reports.length, 1);
  assert.equal(JSON.parse(app.reports[0]).passed, true);
  assert.ok(!app.trace.includes('window.show'));
  assert.ok(app.trace.includes('app.quit'));
});

test('a rejected page load produces an actionable dialog, private log, cleanup and failure exit', async () => {
  const app = mainHarness();
  app.ready.resolve();
  await app.settle();
  app.page.reject(Object.assign(new Error('secret-api-key at https://private.example/chat'), { code: 'ERR_FAILED' }));
  await app.settle();
  assert.equal(app.dialogs.length, 1);
  assert.match(app.dialogs[0][1], /ERR_FAILED/);
  assert.doesNotMatch(JSON.stringify(app.dialogs) + JSON.stringify(app.logEntries()), /secret-api-key|private\.example/);
  assert.ok(app.logEntries().some(entry => entry.phase === 'startup-failed' && entry.code === 'ERR_FAILED'));
  assert.ok(app.trace.includes('server.close'));
  assert.deepEqual(app.exitCodes, [1]);
  assert.equal(app.timers.size, 0);
});

test('a hung page load times out instead of keeping an invisible process alive', async () => {
  const app = mainHarness();
  app.ready.resolve();
  await app.settle();
  assert.equal([...app.timers.values()][0].milliseconds, 20000);
  app.fireTimeout();
  await app.settle();
  assert.match(app.dialogs[0][1], /STARTUP_TIMEOUT/);
  assert.deepEqual(app.exitCodes, [1]);
  assert.ok(app.trace.includes('server.close'));
  assert.equal(app.timers.size, 0);
});

test('service readiness also has a deadline before creating a window', async () => {
  const app = mainHarness({ listenAutomatically: false });
  app.ready.resolve();
  await app.settle();
  app.fireTimeout();
  await app.settle();
  assert.equal(app.windows.length, 0);
  assert.match(app.dialogs[0][1], /STARTUP_TIMEOUT/);
  assert.deepEqual(app.exitCodes, [1]);
});

test('an occupied local port gives the specific recovery hint and a nonzero exit', async () => {
  const app = mainHarness({ listenAutomatically: false });
  app.ready.resolve();
  await app.settle();
  app.server.emit('error', Object.assign(new Error('Address in use'), { code: 'EADDRINUSE' }));
  await app.settle();
  assert.equal(app.windows.length, 0);
  assert.match(app.dialogs[0][1], /4327.*占用/);
  assert.deepEqual(app.exitCodes, [1]);
  assert.equal(app.timers.size, 0);
});

test('renderer crashes are reported once and child crashes log only lifecycle fields', async () => {
  const app = mainHarness();
  app.ready.resolve();
  await app.settle();
  app.page.resolve();
  await app.settle();
  app.app.emit('child-process-gone', {}, { type: 'GPU', reason: 'crashed', exitCode: 9, serviceName: 'private document content' });
  app.windows[0].webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 7 });
  app.windows[0].webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 7 });
  await app.settle();
  assert.equal(app.dialogs.length, 1);
  assert.match(app.dialogs[0][1], /RENDERER_FAILED/);
  assert.deepEqual(app.exitCodes, [1]);
  const child = app.logEntries().find(entry => entry.phase === 'child-process-gone');
  assert.equal(child.processType, 'GPU');
  assert.equal(child.exitCode, 9);
  assert.doesNotMatch(JSON.stringify(app.logEntries()), /private document content/);
});

test('a second launch focuses a pending window, or restores and raises an existing one', async () => {
  const app = mainHarness();
  app.app.emit('second-instance');
  app.ready.resolve();
  await app.settle();
  assert.ok(app.trace.includes('window.focus'));
  app.page.resolve();
  await app.settle();
  app.windows[0].minimized = true;
  app.trace.length = 0;
  app.app.emit('second-instance');
  assert.deepEqual(app.trace, ['window.restore', 'window.show', 'window.focus']);
});

test('a secondary process notifies the primary and quits without creating another server', async () => {
  const app = mainHarness({ ownsLock: false });
  app.ready.resolve();
  await app.settle();
  assert.deepEqual(app.trace, ['app.quit']);
  assert.equal(app.windows.length, 0);
  assert.ok(app.logEntries().some(entry => entry.phase === 'existing-instance-notified'));
});

test('startup logging excludes content, keys, URLs and invalid codes without reading real files', () => {
  const startup = startupHarness();
  const log = startup.helpers.createStartupLog('C:/virtual/profile');
  log.write('page-ready', {
    version: '0.1.2', code: 'ERR_FAILED', reason: 'crashed', processType: 'GPU', pid: 1234, exitCode: -9,
    apiKey: 'sk-private-test-key', content: 'private chat content', url: 'https://private.example/chat',
    headers: { Authorization: 'secret' }, message: 'private exception message',
  });
  log.write('invalid/phase?\n', { code: 'https://private.example', reason: 'secret\ntext', pid: '1234' });
  const lines = [...startup.files.values()][0].trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(Object.keys(lines[0]).sort(), ['code', 'exitCode', 'phase', 'pid', 'processType', 'reason', 'time', 'version']);
  assert.equal(lines[0].exitCode, -9);
  assert.equal(lines[1].phase, 'invalidphase');
  assert.deepEqual(Object.keys(lines[1]).sort(), ['phase', 'time']);
  assert.doesNotMatch([...startup.files.values()].join(''), /sk-private|private chat|private\.example|Authorization|exception message/);
  assert.equal(log.path, join('C:/virtual/profile', 'logs', 'startup.log'));
  assert.equal(startup.helpers.errorCode({ code: 'ERR_FAILED' }), 'ERR_FAILED');
  for (const invalid of ['contains spaces', 'https://private.example', 'sk-private-key', 'A'.repeat(49)]) {
    assert.equal(startup.helpers.errorCode({ code: invalid }), 'STARTUP_FAILED');
  }
});

test('logging failure cannot prevent launch and oversized logs rotate within the log directory', () => {
  const readOnly = startupHarness({ writeFails: true });
  assert.doesNotThrow(() => readOnly.helpers.createStartupLog('C:/virtual/profile').write('app-ready'));
  const large = startupHarness({ existingSize: 256 * 1024 + 1 });
  large.helpers.createStartupLog('C:/virtual/profile').write('app-ready');
  assert.deepEqual(large.renames, [[join('C:/virtual/profile', 'logs', 'startup.log'), join('C:/virtual/profile', 'logs', 'startup-previous.log')]]);
});

test('startup deadlines preserve results and rejection errors while always clearing their timers', async () => {
  const startup = startupHarness();
  assert.equal(await startup.helpers.withStartupTimeout(Promise.resolve('ready')), 'ready');
  assert.equal(startup.timers.size, 0);
  const original = new Error('Expected startup failure');
  await assert.rejects(startup.helpers.withStartupTimeout(Promise.reject(original)), error => error === original);
  assert.equal(startup.timers.size, 0);
  const hung = startup.helpers.withStartupTimeout(new Promise(() => {}), 5);
  assert.equal([...startup.timers.values()][0].milliseconds, 5);
  startup.fireTimeout();
  await assert.rejects(hung, { code: 'STARTUP_TIMEOUT' });
  assert.equal(startup.timers.size, 0);
  assert.equal(startup.cleared.length, 3);
});
