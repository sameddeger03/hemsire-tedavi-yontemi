const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dataUpdateGateAPI', {
  onResult: (callback) => ipcRenderer.on('data-update-result', (_event, result) => callback(result || {}))
})
