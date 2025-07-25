const { contextBridge, ipcRenderer } = require('electron');

// Expose a limited set of IPC methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    loadURL: (url) => ipcRenderer.send('load-url', url),
    goBack: () => ipcRenderer.send('go-back'),
    goForward: () => ipcRenderer.send('go-forward'),
    refreshPage: () => ipcRenderer.send('refresh-page'),
    // You can add more APIs here as your browser grows
});