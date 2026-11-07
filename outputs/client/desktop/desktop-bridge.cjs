const { randomUUID } = require('node:crypto');

function installDesktopBridge({ ipcMain, window, isLocalPage, backupStore, timeoutMs = 15000, onLocale = () => {} }) {
  let ready = false;
  let pending;
  const trusted = event => event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && isLocalPage(event.senderFrame?.url || '');
  const onReady = event => { if (trusted(event)) ready = true; };
  const onNotReady = event => { if (trusted(event)) ready = false; };
  const onLanguage = (event, locale) => { if (trusted(event) && ['zh-CN', 'en', 'es', 'ja', 'zh-TW', 'de', 'ar', 'fr'].includes(locale)) onLocale(locale); };
  const onResult = (event, result) => {
    if (!trusted(event) || !pending || result?.id !== pending.id) return;
    clearTimeout(pending.timer);
    const resolve = pending.resolve;
    pending = undefined;
    resolve(result.ok === true);
  };
  ipcMain.on('learn:ready', onReady);
  ipcMain.on('learn:not-ready', onNotReady);
  ipcMain.on('learn:close-result', onResult);
  ipcMain.on('learn:locale', onLanguage);
  for (const action of ['list', 'read', 'write', 'baseline']) ipcMain.handle(`learn:backups-${action}`, (event, value) => {
    if (!trusted(event)) throw new Error('此页面无法访问本机备份。');
    return backupStore[action](value);
  });
  return {
    waitForSave() {
      if (!ready) return Promise.resolve(false);
      if (pending) return pending.promise;
      const id = randomUUID();
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      const timer = setTimeout(() => { if (pending?.id === id) { pending = undefined; resolve(false); } }, timeoutMs);
      pending = { id, promise, resolve, timer };
      window.webContents.send('learn:prepare-close', id);
      return promise;
    },
    dispose() {
      if (pending) { clearTimeout(pending.timer); pending.resolve(false); pending = undefined; }
      ipcMain.removeListener('learn:ready', onReady); ipcMain.removeListener('learn:not-ready', onNotReady); ipcMain.removeListener('learn:close-result', onResult);
      ipcMain.removeListener('learn:locale', onLanguage);
      for (const action of ['list', 'read', 'write', 'baseline']) ipcMain.removeHandler(`learn:backups-${action}`);
    },
  };
}

/** One exit attempt at a time. Never tears down the server before renderer saves. */
function createCloseGuard({ save, shutdown, quit, choose }) {
  let running;
  let approved = false;
  return {
    get approved() { return approved; },
    request() {
      if (running) return running;
      const attempt = async () => {
        while (true) {
          const saved = await save().catch(() => false);
          if (!saved) {
            const choice = await choose();
            if (choice === 'retry') continue;
            if (choice !== 'leave') return;
          }
          await shutdown(); approved = true; quit(); return;
        }
      };
      running = attempt().finally(() => { running = undefined; });
      return running;
    },
  };
}
module.exports = { installDesktopBridge, createCloseGuard };
