const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('selark', Object.freeze({
  config: () => ipcRenderer.invoke('desktop:config'),
  connect: link => ipcRenderer.invoke('desktop:connect', link),
  disconnect: () => ipcRenderer.invoke('desktop:disconnect'),
  clearSession: () => ipcRenderer.invoke('desktop:clear-session'),
  listWsl: () => ipcRenderer.invoke('desktop:wsl-list'),
  startWsl: settings => ipcRenderer.invoke('desktop:wsl-start', settings),
  startNative: settings => ipcRenderer.invoke('desktop:native-start', settings),
  cancelWsl: () => ipcRenderer.invoke('desktop:wsl-cancel'),
  probe: address => ipcRenderer.invoke('desktop:probe', address),
  request: input => ipcRenderer.invoke('desktop:request', input),
  cancel: id => ipcRenderer.send('desktop:cancel', id),
  copyText: text => ipcRenderer.invoke('desktop:copy', text),
  theme: preference => ipcRenderer.send('desktop:theme', preference),
  onChooseBackend: callback => {
    const listener = (_event, mode) => { if (['windows', 'wsl', 'choose'].includes(mode)) callback(mode); };
    ipcRenderer.on('desktop:choose-backend', listener);
    return () => ipcRenderer.removeListener('desktop:choose-backend', listener);
  },
  onVisibility: callback => {
    const listener = (_event, visible) => callback(visible === true);
    ipcRenderer.on('desktop:visibility', listener);
    return () => ipcRenderer.removeListener('desktop:visibility', listener);
  },
  window: action => ipcRenderer.send('desktop:window', action),
}));
