// preload.js - Optimized version
const { contextBridge, ipcRenderer } = require('electron');

// Cache DOM references for performance
let domReady = false;
window.addEventListener('DOMContentLoaded', () => {
  domReady = true;
  console.log("Browser UI loaded.");
});

// Optimized API exposure with error handling and caching
const electronAPI = {
  send: (ch, ...args) => {
    try {
      return ipcRenderer.send(ch, ...args);
    } catch (err) {
      console.error('IPC send error:', err);
    }
  },
  // Send message to embedding page (webview host)
  sendToHost: (ch, ...args) => {
    try {
      return ipcRenderer.sendToHost(ch, ...args);
    } catch (err) {
      console.error('IPC sendToHost error:', err);
    }
  },
  invoke: (ch, ...args) => {
    try {
      return ipcRenderer.invoke(ch, ...args);
    } catch (err) {
      console.error('IPC invoke error:', err);
      return Promise.reject(err);
    }
  },
  on: (ch, fn) => {
    try {
      return ipcRenderer.on(ch, (e, ...args) => fn(...args));
    } catch (err) {
      console.error('IPC on error:', err);
    }
  },
  // Add removeListener for cleanup
  removeListener: (ch, fn) => {
    try {
      return ipcRenderer.removeListener(ch, fn);
    } catch (err) {
      console.error('IPC removeListener error:', err);
    }
  },
  toggleDevTools: () => {
    try {
      return ipcRenderer.invoke('open-devtools');
    } catch (err) {
      console.error('IPC open-devtools error:', err);
      return Promise.reject(err);
    }
  }
};

// Cache for bookmarks to reduce IPC calls
let bookmarksCache = null;
let bookmarksCacheTime = 0;
const CACHE_DURATION = 5000; // 5 seconds

const bookmarksAPI = {
  load: async () => {
    const now = Date.now();
    if (bookmarksCache && (now - bookmarksCacheTime) < CACHE_DURATION) {
      return bookmarksCache;
    }
    try {
      bookmarksCache = await ipcRenderer.invoke('load-bookmarks');
      bookmarksCacheTime = now;
      return bookmarksCache;
    } catch (err) {
      console.error('Bookmarks load error:', err);
      return [];
    }
  },
  save: async (data) => {
    try {
      bookmarksCache = data; // Update cache immediately
      bookmarksCacheTime = Date.now();
      return await ipcRenderer.invoke('save-bookmarks', data);
    } catch (err) {
      console.error('Bookmarks save error:', err);
      return false;
    }
  }
};

// Expose APIs to main world
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
contextBridge.exposeInMainWorld('bookmarksAPI', bookmarksAPI);

// Minimal about API for settings page
contextBridge.exposeInMainWorld('aboutAPI', {
  getInfo: () => ipcRenderer.invoke('get-about-info')
});