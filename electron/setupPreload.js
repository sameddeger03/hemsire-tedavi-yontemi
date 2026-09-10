const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('setupAPI', {
  activate: values => ipcRenderer.invoke('api-key-activate', values)
})
