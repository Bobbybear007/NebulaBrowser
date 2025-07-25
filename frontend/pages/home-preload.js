// home-preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('homeAPI', {
  navigateTo: (url) => ipcRenderer.sendToHost('navigate', url),
  
  // Bookmarks
  getBookmarks: () => ipcRenderer.invoke('get-home-bookmarks'),
  addBookmark: (bookmark) => ipcRenderer.invoke('add-home-bookmark', bookmark),
  removeBookmark: (url) => ipcRenderer.invoke('remove-home-bookmark', url),
});
// Expose settings API for settings page
contextBridge.exposeInMainWorld('settingsAPI', {
  clearCookies: () => ipcRenderer.invoke('clear-cookies'),
  goHome: () => ipcRenderer.invoke('go-home'),
  clearBookmarks: () => ipcRenderer.invoke('clear-bookmarks'),
  clearHomeBookmarks: () => ipcRenderer.invoke('clear-home-bookmarks')
});
