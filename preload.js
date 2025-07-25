// preload.js

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  onIsSteamOS: (callback) => ipcRenderer.on('is-steam-os', (_event, value) => callback(value)),
  
  // Bookmark API
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  addBookmark: (bookmark) => ipcRenderer.invoke('add-bookmark', bookmark),
  removeBookmark: (url) => ipcRenderer.invoke('remove-bookmark', url),

  // Home Bookmark API
  getHomeBookmarks: () => ipcRenderer.invoke('get-home-bookmarks'),
  addHomeBookmark: (bookmark) => ipcRenderer.invoke('add-home-bookmark', bookmark),
  removeHomeBookmark: (url) => ipcRenderer.invoke('remove-home-bookmark', url),
});

contextBridge.exposeInMainWorld('settingsAPI', {
    clearCookies: () => ipcRenderer.invoke('clear-cookies'),
    goHome: () => ipcRenderer.invoke('go-home'),
    clearBookmarks: () => ipcRenderer.invoke('clear-bookmarks'),
    clearHomeBookmarks: () => ipcRenderer.invoke('clear-home-bookmarks'),
});
