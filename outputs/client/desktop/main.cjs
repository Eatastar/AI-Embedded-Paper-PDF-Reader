const { app, BrowserWindow, Menu, dialog, session, shell, safeStorage, ipcMain } = require('electron');
const { join, resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { mkdir, writeFile } = require('node:fs/promises');
const { createStartupLog, errorCode, withStartupTimeout } = require('./startup.cjs');
const { createModelFetch } = require('./model-network.cjs');
const { createRequestLog } = require('./request-log.cjs');
const { createBackupStore } = require('./backup-store.cjs');
const { installDesktopBridge, createCloseGuard } = require('./desktop-bridge.cjs');

const smoke = process.argv.includes('--smoke-test');
const interactiveSmoke = smoke && process.argv.includes('--interactive');
const hiddenSmoke = smoke && process.argv.includes('--hidden');
const profile = smoke
  ? process.env.MARGIN_TEST_USER_DATA ? resolve(process.env.MARGIN_TEST_USER_DATA) : join(app.getPath('temp'), `LearnSomethingSmoke-${process.pid}`)
  : join(app.getPath('appData'), 'MarginChat');
// Keep the original profile and app identity so upgrades retain chats and keys.
app.setName('AI-Embedded Paper PDF Reader');
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
let desktopBridge;
let closeGuard;
let interfaceLocale = 'zh-CN';
const menuKeys = ['Quit', 'Edit', 'View', 'Reload', 'Zoom in', 'Zoom out', 'Actual size', 'Full screen', 'Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Select all', 'Retry saving', 'Cancel exit', 'Quit anyway'];
const menuWords = Object.fromEntries(Object.entries({
  es: ['Salir', 'Editar', 'Vista', 'Recargar', 'Ampliar', 'Alejar', 'Tamaño real', 'Pantalla completa', 'Deshacer', 'Rehacer', 'Cortar', 'Copiar', 'Pegar', 'Seleccionar todo', 'Reintentar guardado', 'Cancelar salida', 'Salir igualmente'],
  ja: ['終了', '編集', '表示', '再読み込み', '拡大', '縮小', '実際のサイズ', '全画面', '元に戻す', 'やり直す', '切り取り', 'コピー', '貼り付け', 'すべて選択', '保存を再試行', '終了をキャンセル', '保存せず終了'],
  de: ['Beenden', 'Bearbeiten', 'Ansicht', 'Neu laden', 'Vergrößern', 'Verkleinern', 'Originalgröße', 'Vollbild', 'Rückgängig', 'Wiederholen', 'Ausschneiden', 'Kopieren', 'Einfügen', 'Alles auswählen', 'Speichern wiederholen', 'Beenden abbrechen', 'Trotzdem beenden'],
  ar: ['خروج', 'تحرير', 'عرض', 'إعادة تحميل', 'تكبير', 'تصغير', 'الحجم الفعلي', 'ملء الشاشة', 'تراجع', 'إعادة', 'قص', 'نسخ', 'لصق', 'تحديد الكل', 'إعادة محاولة الحفظ', 'إلغاء الخروج', 'الخروج على أي حال'],
  fr: ['Quitter', 'Édition', 'Affichage', 'Recharger', 'Agrandir', 'Réduire', 'Taille réelle', 'Plein écran', 'Annuler', 'Rétablir', 'Couper', 'Copier', 'Coller', 'Tout sélectionner', 'Réessayer l’enregistrement', 'Annuler la fermeture', 'Quitter quand même'],
  'zh-TW': ['結束', '編輯', '檢視', '重新載入', '放大', '縮小', '實際大小', '全螢幕', '復原', '重做', '剪下', '複製', '貼上', '全選', '重試儲存', '取消結束', '直接結束'],
}).map(([code, words]) => [code, Object.fromEntries(menuKeys.map((key, i) => [key, words[i]]))]));
const local = (zh, en) => interfaceLocale === 'zh-CN' ? zh : menuWords[interfaceLocale]?.[en] || en;
function refreshMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'AI-Embedded Paper PDF Reader', submenu: [{ label: local('退出', 'Quit'), role: 'quit' }] },
    { label: local('编辑', 'Edit'), submenu: editMenu() },
    { label: local('视图', 'View'), submenu: [{ label: local('重新加载', 'Reload'), role: 'reload' }, { label: local('放大', 'Zoom in'), role: 'zoomIn' }, { label: local('缩小', 'Zoom out'), role: 'zoomOut' }, { label: local('实际大小', 'Actual size'), role: 'resetZoom' }, { label: local('全屏', 'Full screen'), role: 'togglefullscreen' }] },
  ]));
}
function editMenu() { return [{ label: local('撤销', 'Undo'), role: 'undo' }, { label: local('重做', 'Redo'), role: 'redo' }, { type: 'separator' }, { label: local('剪切', 'Cut'), role: 'cut' }, { label: local('复制', 'Copy'), role: 'copy' }, { label: local('粘贴', 'Paste'), role: 'paste' }, { label: local('全选', 'Select all'), role: 'selectAll' }]; }
const report = { app: 'MarginChat', packaged: app.isPackaged, started: false, rendererLoaded: false, rendererErrors: 0 };

function isLocalPage(url) {
  try { return new URL(url).origin === origin; } catch { return false; }
}
function openDocumentation(url) {
  try {
    const parsed = new URL(url);
    if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) void shell.openExternal(parsed.href);
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
  if (!smoke) dialog.showErrorBox('AI-Embedded Paper PDF Reader · 启动失败 / Startup failed', code === 'EADDRINUSE'
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
    if (closeGuard) void closeGuard.request();
    else { quitting = true; void shutdown().finally(() => app.quit()); }
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
    server.listen(smoke ? interactiveSmoke ? 4338 : 0 : 4327, '127.0.0.1');
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
    refreshMenu();
    window = new BrowserWindow({
      width: 1280, height: 860, minWidth: 760, minHeight: 600, title: 'AI-Embedded Paper PDF Reader',
      backgroundColor: '#fff8e7', show: !smoke || (interactiveSmoke && !hiddenSmoke), autoHideMenuBar: true, icon: join(__dirname, 'icon.png'),
      webPreferences: { preload: join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, spellcheck: false, devTools: !app.isPackaged },
    });
    desktopBridge = installDesktopBridge({ ipcMain, window, isLocalPage, backupStore: createBackupStore({ directory: join(profile, 'Backups'), version: app.getVersion() }), onLocale: locale => { interfaceLocale = locale; refreshMenu(); } });
    closeGuard = createCloseGuard({
      save: async () => { const saved = await desktopBridge.waitForSave(); report.exitSaveAcknowledged = saved; if (smoke && !saved) report.passed = false; return saved; }, shutdown,
      quit: () => { quitting = true; if (smoke) void saveSmokeReport().finally(() => app.quit()); else app.quit(); },
      choose: async () => {
        if (smoke && !interactiveSmoke) return 'leave';
        const { response } = await dialog.showMessageBox(window, { type: 'warning', title: local('保存尚未完成', 'Saving is incomplete'), message: local('本次保存或自动备份尚未完成，是否重试？', 'Saving or automatic backup has not finished. Retry?'), detail: local('选择取消会留在当前窗口。直接退出可能丢失最近的修改，已有记录和自动备份会保留。', 'Cancel keeps this window open. Quitting now may lose recent edits. Existing records and backups are kept.'), buttons: [local('重试保存', 'Retry saving'), local('取消退出', 'Cancel exit'), local('直接退出', 'Quit anyway')], defaultId: 1, cancelId: 1, noLink: true });
        if (response === 1) window.webContents.send('learn:cancel-close');
        return ['retry', 'cancel', 'leave'][response];
      },
    });
    window.on('close', event => { if (!quitting) { event.preventDefault(); void closeGuard.request(); } });
    startupLog.write('window-created');
    if (focusRequested && (!smoke || interactiveSmoke)) window.focus();
    window.webContents.setWindowOpenHandler(({ url }) => { openDocumentation(url); return { action: 'deny' }; });
    window.webContents.on('will-navigate', (event, url) => { if (!isLocalPage(url)) { event.preventDefault(); openDocumentation(url); } });
    window.webContents.on('will-redirect', (event, url) => { if (!isLocalPage(url)) event.preventDefault(); });
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.webContents.on('context-menu', (_event, params) => {
      if (!params.isEditable) return;
      Menu.buildFromTemplate(editMenu()).popup({ window });
    });
    window.webContents.on('console-message', event => { if (event.level === 'error') report.rendererErrors += 1; });
    window.webContents.on('render-process-gone', (_event, details) => {
      report.rendererCrash = details.reason;
      startupLog.write('renderer-process-gone', { reason: details.reason, exitCode: details.exitCode });
      if (!smoke) void failStartup(Object.assign(new Error('Renderer stopped'), { code: 'RENDERER_FAILED' }));
    });
    window.on('closed', () => { desktopBridge?.dispose(); window = null; });
    startupLog.write('page-loading');
    await withStartupTimeout(window.loadURL(origin));
    report.started = true;
    report.rendererLoaded = true;
    startupLog.write('page-ready');
    if (!smoke || interactiveSmoke) { if (!hiddenSmoke) window.show(); return; }
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
