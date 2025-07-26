const { app, BrowserWindow, ipcMain, session, screen, shell } = require('electron');
const fs = require('fs');
const path = require('path');

app.commandLine.appendSwitch('ignore-gpu-blacklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-native-gpu-memory-buffers');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,CanvasOopRasterization');
app.commandLine.appendSwitch('no-sandbox'); // Optional, for some setups

// Set a custom application name
app.setName('Nebula');

// --- clear any prior registrations to prevent duplicate‐handler errors ---
ipcMain.removeHandler('window-minimize');
ipcMain.removeHandler('window-maximize');
ipcMain.removeHandler('window-close');

function createWindow(startUrl) {
  // Get the available screen size
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  // Ensure nativeWindowOpen is disabled
  let windowOptions = {
    width,
    height,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: true, // was false
      webviewTag: true,
      enableRemoteModule: true, // Enable the remote module
      nodeIntegrationInSubFrames: true,    // ← allow require() inside your <webview>
      nativeWindowOpen: false // Prevent Electron from creating new windows
    },
    fullscreen: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets/images/Logos/Nebula-favicon.png'),
    title: 'Nebula',
  };

  if (process.platform === 'darwin') {
    Object.assign(windowOptions, {
      frame: true,
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 15, y: 20 },
      backgroundColor: '#00000000',
      transparent: true,
    });
  } else if (process.platform === 'win32') {
    Object.assign(windowOptions, {
      frame: true, // Use default Windows title bar.
      // removed titleBarOverlay to restore native Windows controls.
    });
  } else {
    windowOptions.frame = true;
  }

  const win = new BrowserWindow(windowOptions);

  // Handle window.open() calls – load URL in this window
  win.webContents.setWindowOpenHandler(({ url }) => {
    win.loadURL(url);
    return { action: 'deny' };
  });

  // Intercept direct navigations (e.g., user clicks a link) – load URL in this window
  win.webContents.on('will-navigate', (event, url) => {
    event.preventDefault(); // Prevent navigation in the current window
    win.loadURL(url);
  });

  // Intercept legacy new-window events – load URL in this window
  win.webContents.on('new-window', (event, url) => {
    event.preventDefault(); // Prevent new Electron window
    win.loadURL(url);
  });

  // ensure all embedded <webview> tags also use the same window
  win.webContents.on('did-attach-webview', (event, webContents) => {
    // Set up webview with preload script to provide electronAPI
    webContents.on('dom-ready', () => {
      webContents.executeJavaScript(`
        window.electronAPI = {
          invoke: (channel, ...args) => {
            return new Promise((resolve, reject) => {
              const { ipcRenderer } = require('electron');
              ipcRenderer.invoke(channel, ...args).then(resolve).catch(reject);
            });
          }
        };
      `);
    });

    // intercept window.open() inside webview
    webContents.setWindowOpenHandler(({ url }) => {
      webContents.loadURL(url);
      // record history for webview navigations
      recordHistory('site-history.json', url);
      const m = /[?&](?:q|query)=([^&]+)/.exec(url);
      if (m && m[1]) {
        const query = decodeURIComponent(m[1].replace(/\+/g, ' '));
        recordHistory('search-history.json', query);
      }
      return { action: 'deny' };
    });
    // intercept legacy new-window on webview
    webContents.on('new-window', (e, url) => {
      e.preventDefault();
      webContents.loadURL(url);
      // record history for webview navigations
      recordHistory('site-history.json', url);
      const m = /[?&](?:q|query)=([^&]+)/.exec(url);
      if (m && m[1]) {
        const query = decodeURIComponent(m[1].replace(/\+/g, ' '));
        recordHistory('search-history.json', query);
      }
    });
    // intercept navigation on webview (e.g. user clicks link)
    webContents.on('will-navigate', (e, url) => {
      e.preventDefault();
      webContents.loadURL(url);
      // record history for webview navigations
      recordHistory('site-history.json', url);
      const m = /[?&](?:q|query)=([^&]+)/.exec(url);
      if (m && m[1]) {
        const query = decodeURIComponent(m[1].replace(/\+/g, ' '));
        recordHistory('search-history.json', query);
      }
    });
  });

  win.loadFile('renderer/index.html');

  // if caller passed in a URL, forward it to the renderer after load
  if (startUrl) {
    win.webContents.once('did-finish-load', () => {
      win.webContents.send('open-url', startUrl);
    });
  }

  // Set default zoom to 100%
  const zoomFactor = 1.0;
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(zoomFactor);
  });

  // record site and search history on every navigation
  const recordHistory = async (fileName, entry) => {
    if (fileName === 'site-history.json') {
      // Save to both file and send to renderer
      const filePath = path.join(__dirname, fileName);
      let data = [];
      try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch {}
      if (data[0] !== entry) {
        data.unshift(entry);
        if (data.length > 100) data.pop();
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      }
      // Also send to renderer for localStorage
      win.webContents.send('record-site-history', entry);
    } else {
      // Keep search history in JSON file for now
      const filePath = path.join(__dirname, fileName);
      let data = [];
      try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch {}
      if (data[0] !== entry) {
        data.unshift(entry);
        if (data.length > 100) data.pop();
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      }
    }
  };

  win.webContents.on('did-navigate', (event, url) => {
    recordHistory('site-history.json', url);
    const m = /[?&](?:q|query)=([^&]+)/.exec(url);
    if (m && m[1]) {
      const query = decodeURIComponent(m[1].replace(/\+/g, ' '));
      recordHistory('search-history.json', query);
    }
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();
  if (process.platform === 'darwin') {
    // Set macOS dock icon using an icns file for proper display.
    app.dock.setIcon(path.join(__dirname, 'assets/images/Logos/Nebula-Icon.icns'));
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ipcMain handlers

// --- window control handlers (only registered once now)
ipcMain.handle('window-minimize', event => {
  BrowserWindow.fromWebContents(event.sender).minimize();
});
ipcMain.handle('window-maximize', event => {
  const w = BrowserWindow.fromWebContents(event.sender);
  w.isMaximized() ? w.unmaximize() : w.maximize();
});
ipcMain.handle('window-close', event => {
  BrowserWindow.fromWebContents(event.sender).close();
});

// Add site and search history IPC handlers
// Site history is now handled via localStorage in the renderer
// But keep these handlers for compatibility and potential future use
ipcMain.handle('load-site-history', async () => {
  // Read from the site history file for settings page
  const filePath = path.join(__dirname, 'site-history.json');
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
});

ipcMain.handle('save-site-history', async (event, history) => {
  // Save to both file and localStorage
  const filePath = path.join(__dirname, 'site-history.json');
  try {
    fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
    return true;
  } catch (err) {
    return false;
  }
});

ipcMain.handle('clear-site-history', async () => {
  const filePath = path.join(__dirname, 'site-history.json');
  try {
    fs.writeFileSync(filePath, JSON.stringify([], null, 2));
    return true;
  } catch (err) {
    return false;
  }
});

ipcMain.handle('load-search-history', async () => {
  const filePath = path.join(__dirname, 'search-history.json');
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
});

ipcMain.handle('save-search-history', async (event, history) => {
  const filePath = path.join(__dirname, 'search-history.json');
  try {
    fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
    return true;
  } catch (err) {
    return false;
  }
});

// debug: log default‐homepage changes from renderer
ipcMain.on('homepage-changed', (event, url) => {
  console.log('[MAIN] homepage-changed →', url);
});


ipcMain.handle('clear-browser-data', async () => {
  try {
    const ses = session.defaultSession;

    // Clear cookies
    await ses.clearStorageData({ storages: ['cookies'] });

    // Clear local storage and other storage data
    await ses.clearStorageData({ storages: ['localstorage', 'indexdb', 'filesystem', 'websql'] });

    // Clear cache
    await ses.clearCache();

    // Clear HTTP authentication cache
    await ses.clearAuthCache();

    // Clear all cookies explicitly to ensure logged-in accounts are logged out
    const cookies = await ses.cookies.get({});
    for (const cookie of cookies) {
      await ses.cookies.remove(cookie.url, cookie.name);
    }

    return true; // Indicate success
  } catch (error) {
    console.error('Failed to clear browser data:', error);
    return false; // Indicate failure
  }
});

ipcMain.handle('get-zoom-factor', event => {
  const wc = BrowserWindow.fromWebContents(event.sender).webContents;
  return wc.getZoomFactor();
});

ipcMain.handle('zoom-in', event => {
  const wc = BrowserWindow.fromWebContents(event.sender).webContents;
  const current = wc.getZoomFactor();
  const z = Math.min(current + 0.1, 3);
  wc.setZoomFactor(z);
  return z;
});


ipcMain.handle('zoom-out', event => {
  const wc = BrowserWindow.fromWebContents(event.sender).webContents;
  const current = wc.getZoomFactor();
  const z = Math.max(current - 0.1, 0.25);
  wc.setZoomFactor(z);
  return z;
});

// allow renderer to pop a tab into its own window
ipcMain.handle('open-tab-in-new-window', (event, url) => {
  createWindow(url);
});

ipcMain.handle('save-site-history-entry', async (event, url) => {
  const filePath = path.join(__dirname, 'site-history.json');
  try {
    let data = [];
    try { 
      data = JSON.parse(fs.readFileSync(filePath, 'utf8')); 
    } catch {}
    
    // Remove if already exists to avoid duplicates
    data = data.filter(item => item !== url);
    // Add to beginning
    data.unshift(url);
    // Keep only last 100 entries
    if (data.length > 100) {
      data = data.slice(0, 100);
    }
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log('[MAIN] Saved site history entry:', url);
    return true;
  } catch (err) {
    console.error('[MAIN] Error saving site history entry:', err);
    return false;
  }
});
