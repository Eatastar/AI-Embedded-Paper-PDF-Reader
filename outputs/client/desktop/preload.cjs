const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('learnSomething', {
  setLocale: locale => { if (locale === 'zh-CN' || locale === 'en') ipcRenderer.send('learn:locale', locale); },
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
  },
});
