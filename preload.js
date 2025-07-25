// preload.js
const { contextBridge, ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  console.log("Browser UI loaded.");
});

// stubbed preload—no-op or expose an API as needed
contextBridge.exposeInMainWorld('electronAPI', {
  send: (ch, ...args) => ipcRenderer.send(ch, ...args),
  invoke: (ch, ...args) => ipcRenderer.invoke(ch, ...args),
  on: (ch, fn) => ipcRenderer.on(ch, (e, ...args) => fn(...args))
});

contextBridge.exposeInMainWorld('bookmarksAPI', {
  load: () => ipcRenderer.invoke('load-bookmarks'),
  save: (data) => ipcRenderer.invoke('save-bookmarks', data)
});