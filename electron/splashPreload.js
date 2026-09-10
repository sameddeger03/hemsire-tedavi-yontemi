const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('splashAPI', {
  onStatus: callback => ipcRenderer.on('splash-status', (_event, value) => callback(value)),
  retry: () => ipcRenderer.send('splash-retry'),
  close: () => ipcRenderer.send('splash-close')
})
