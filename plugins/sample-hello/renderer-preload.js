// Renderer preload for sample plugin
// You can expose new APIs to the page
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sampleHello', {
  ping: () => ipcRenderer.invoke('sample-hello:ping'),
  onHello: (handler) => ipcRenderer.on('sample-hello', (_e, payload) => handler(payload))
});
