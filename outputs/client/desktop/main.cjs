const { app, BrowserWindow, Menu, dialog, session, shell, safeStorage } = require('electron');
const { join, resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { mkdir, writeFile } = require('node:fs/promises');
const { createStartupLog, errorCode, withStartupTimeout } = require('./startup.cjs');
const { createModelFetch } = require('./model-network.cjs');
const { createRequestLog } = require('./request-log.cjs');

const smoke = process.argv.includes('--smoke-test');
const profile = smoke && process.env.MARGIN_TEST_USER_DATA
  ? resolve(process.env.MARGIN_TEST_USER_DATA)
  : join(app.getPath('appData'), 'MarginChat');
// Keep the original profile and app identity so upgrades retain chats and keys.
app.setName('learn something');
app.setPath('userData', profile);
app.setPath('sessionData', join(profile, 'Session'));
const startupLog = createStartupLog(profile);
startupLog.write('main-entered', { version: app.getVersion(), pid: process.pid });
const ownsLock = app.requestSingleInstanceLock();
let window;
let server;
let desktopSession;
let quitting = false;
let origin;
let focusRequested = false;
let failureReported = false;
const report = { app: 'MarginChat', packaged: app.isPackaged, started: false, rendererLoaded: false, rendererErrors: 0 };

function isLocalPage(url) {
  try { return new URL(url).origin === origin; } catch { return false; }
}
function openDocumentation(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) void shell.openExternal(parsed.href);
  } catch { /* Ignore malformed navigation rather than executing it. */ }
}
async function saveSmokeReport(error) {
  if (!smoke || !process.env.MARGIN_SMOKE_REPORT) return;
  const reportPath = resolve(process.env.MARGIN_SMOKE_REPORT);
  await mkdir(require('node:path').dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify({ ...report, ...(error ? { error: String(error.message || error) } : {}) }, null, 2));
}
async function shutdown() {
  desktopSession?.flushStorageData();
  if (server?.listening) {
    server.closeAllConnections();
    await new Promise(resolveClose => server.close(resolveClose));
  }
}

async function failStartup(error) {
  if (failureReported || quitting) return;
  failureReported = true;
  const code = errorCode(error);
  startupLog.write('startup-failed', { code });
  await saveSmokeReport(error).catch(() => {});
  if (!smoke) dialog.showErrorBox('learn something 未能打开', code === 'EADDRINUSE'
    ? '程序使用的本机端口 4327 已被占用。请先关闭另一份客户端后重试。\n\n如果仍无法打开，请运行同目录的「启动诊断」。'
    : '程序启动未完成。请运行同目录的「启动诊断」，把生成的结果发给开发者。\n\n错误代码：' + code + '\n启动日志：' + startupLog.path);
  await shutdown().catch(() => {});
  app.exit(1);
}

if (!ownsLock) {
  startupLog.write('existing-instance-notified');
  app.quit();
} else {
  process.on('uncaughtException', error => { void failStartup(error); });
  process.on('unhandledRejection', error => { void failStartup(error); });
  app.on('child-process-gone', (_event, details) => startupLog.write('child-process-gone', { processType: details.type, reason: details.reason, exitCode: details.exitCode }));
  app.on('second-instance', () => {
    startupLog.write('second-instance');
    focusRequested = true;
    if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void shutdown().finally(() => app.quit());
  });
  app.whenReady().then(async () => {
    startupLog.write('app-ready');
    app.setAppUserModelId('com.marginchat.desktop');
    const { createAppServer } = require('./server.cjs');
    const { createProfileStore } = require('./profile-store.cjs');
    desktopSession = session.defaultSession;
    const requestLog = createRequestLog(profile);
    const token = randomBytes(32).toString('hex');
    server = createAppServer({
      env: { AI_BASE_URL: 'https://api.deepseek.com', AI_MODEL: 'deepseek-flash' },
      distDir: join(__dirname, 'dist'), accessToken: token, allowDevOrigins: false, timeoutMs: 300000,
      fetch: createModelFetch(desktopSession), transport: 'system-proxy', onRequestLog: record => requestLog.write(record),
      profileStore: createProfileStore({ filePath: join(profile, 'model-profiles.json'), safeStorage }),
    });
    server.listen(smoke ? 0 : 4327, '127.0.0.1');
    await withStartupTimeout(once(server, 'listening'));
    origin = `http://127.0.0.1:${server.address().port}`;
    startupLog.write('local-service-ready');
    server.on('error', error => { if (!quitting) void failStartup(error); });
    desktopSession.webRequest.onBeforeSendHeaders((details, callback) => {
      if (isLocalPage(details.url)) details.requestHeaders['X-Margin-Session'] = token;
      callback({ requestHeaders: details.requestHeaders });
    });
    desktopSession.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...details.responseHeaders };
      if (isLocalPage(details.url)) headers['Content-Security-Policy'] = ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'none'; frame-ancestors 'none'"];
      callback({ responseHeaders: headers });
    });
    desktopSession.setPermissionRequestHandler((contents, permission, callback) => callback(permission === 'clipboard-sanitized-write' && isLocalPage(contents.getURL())));
    desktopSession.setPermissionCheckHandler((contents, permission, requestingOrigin) => permission === 'clipboard-sanitized-write' && isLocalPage(requestingOrigin || contents?.getURL() || ''));
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'learn something', submenu: [{ label: '退出', role: 'quit' }] },
      { label: '编辑', submenu: [{ label: '撤销', role: 'undo' }, { label: '重做', role: 'redo' }, { type: 'separator' }, { label: '剪切', role: 'cut' }, { label: '复制', role: 'copy' }, { label: '粘贴', role: 'paste' }, { label: '全选', role: 'selectAll' }] },
      { label: '视图', submenu: [{ label: '重新加载', role: 'reload' }, { label: '放大', role: 'zoomIn' }, { label: '缩小', role: 'zoomOut' }, { label: '实际大小', role: 'resetZoom' }, { label: '全屏', role: 'togglefullscreen' }] },
    ]));
    window = new BrowserWindow({
      width: 1280, height: 860, minWidth: 760, minHeight: 600, title: 'learn something',
      backgroundColor: '#fff8e7', show: !smoke, autoHideMenuBar: true, icon: join(__dirname, 'icon.png'),
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, spellcheck: false, devTools: !app.isPackaged },
    });
    startupLog.write('window-created');
    if (focusRequested && !smoke) window.focus();
    window.webContents.setWindowOpenHandler(({ url }) => { openDocumentation(url); return { action: 'deny' }; });
    window.webContents.on('will-navigate', (event, url) => { if (!isLocalPage(url)) { event.preventDefault(); openDocumentation(url); } });
    window.webContents.on('will-redirect', (event, url) => { if (!isLocalPage(url)) event.preventDefault(); });
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.webContents.on('context-menu', (_event, params) => {
      if (!params.isEditable) return;
      Menu.buildFromTemplate([{ label: '撤销', role: 'undo' }, { label: '重做', role: 'redo' }, { type: 'separator' }, { label: '剪切', role: 'cut' }, { label: '复制', role: 'copy' }, { label: '粘贴', role: 'paste' }, { label: '全选', role: 'selectAll' }]).popup({ window });
    });
    window.webContents.on('console-message', event => { if (event.level === 'error') report.rendererErrors += 1; });
    window.webContents.on('render-process-gone', (_event, details) => {
      report.rendererCrash = details.reason;
      startupLog.write('renderer-process-gone', { reason: details.reason, exitCode: details.exitCode });
      if (!smoke) void failStartup(Object.assign(new Error('Renderer stopped'), { code: 'RENDERER_FAILED' }));
    });
    window.on('closed', () => { window = null; });
    startupLog.write('page-loading');
    await withStartupTimeout(window.loadURL(origin));
    report.started = true;
    report.rendererLoaded = true;
    startupLog.write('page-ready');
    if (!smoke) { window.show(); return; }
    // Startup verification reads only the application's HTTP contract and its
    // lifecycle events. No renderer script or UI automation is injected.
    const headers = { 'X-Margin-Session': token };
    report.unauthorizedBlocked = (await fetch(origin + '/api/settings')).status === 403;
    const settings = await (await fetch(origin + '/api/settings', { headers })).json();
    report.defaultDemo = settings.mode === 'demo';
    report.deepseekPreset = settings.baseURL === 'https://api.deepseek.com' && settings.model === 'deepseek-flash';
    report.noPackagedKey = settings.hasApiKey === false;
    const response = await fetch(origin + '/api/chat', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'main', messages: [{ role: 'user', content: '什么是广义相对论？' }] }) });
    report.demoStreaming = (await response.text()).includes('"type":"done"');
    await new Promise(resolveWait => setTimeout(resolveWait, 600));
    report.passed = report.started && report.rendererLoaded && report.rendererErrors === 0 && !report.rendererCrash && report.unauthorizedBlocked && report.defaultDemo && report.deepseekPreset && report.noPackagedKey && report.demoStreaming;
    await saveSmokeReport();
    if (!report.passed) { await failStartup(Object.assign(new Error('Startup check failed'), { code: 'SMOKE_FAILED' })); return; }
    app.quit();
  }).catch(failStartup);
}
