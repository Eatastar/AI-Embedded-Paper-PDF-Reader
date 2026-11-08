const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('learnSomething', {
  setLocale: locale => { if (['zh-CN', 'en', 'es', 'ja', 'zh-TW', 'de', 'ar', 'fr'].includes(locale)) ipcRenderer.send('learn:locale', locale); },
  onPrepareClose(handler, onCancel) {
    const listener = async (_event, id) => {
      try { await handler(); ipcRenderer.send('learn:close-result', { id, ok: true }); }
      catch { ipcRenderer.send('learn:close-result', { id, ok: false }); }
    };
    ipcRenderer.on('learn:prepare-close', listener);
    const cancelListener = () => onCancel();
    ipcRenderer.on('learn:cancel-close', cancelListener);
    ipcRenderer.send('learn:ready');
    return () => { ipcRenderer.removeListener('learn:prepare-close', listener); ipcRenderer.removeListener('learn:cancel-close', cancelListener); ipcRenderer.send('learn:not-ready'); };
  },
  backups: {
    list: () => ipcRenderer.invoke('learn:backups-list'),
    read: id => ipcRenderer.invoke('learn:backups-read', id),
    write: text => ipcRenderer.invoke('learn:backups-write', text),
    baseline: text => ipcRenderer.invoke('learn:backups-baseline', text),
    remove: id => ipcRenderer.invoke('learn:backups-remove', id),
    begin: input => ipcRenderer.invoke('learn:backups-begin', input),
    append: input => ipcRenderer.invoke('learn:backups-append', input),
    finish: id => ipcRenderer.invoke('learn:backups-finish', id),
    abort: id => ipcRenderer.invoke('learn:backups-abort', id),
    upgradeNeeded: () => ipcRenderer.invoke('learn:backups-upgradeNeeded'),
  },
});
