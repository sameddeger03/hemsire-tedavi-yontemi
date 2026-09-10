const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('updateGateAPI', {
  onChecking: (callback) => ipcRenderer.on('update-checking', callback),
  onAvailable: (callback) => ipcRenderer.on('update-available', (_event, info) => callback(info)),
  onProgress: (callback) => ipcRenderer.on('update-download-progress', (_event, progress) => callback(progress)),
  onDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_event, info) => callback(info)),
  onNotAvailable: (callback) => ipcRenderer.on('update-not-available', callback),
  onError: (callback) => ipcRenderer.on('update-error', (_event, error) => callback(error))
})
