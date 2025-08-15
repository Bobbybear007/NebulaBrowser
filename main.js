const { app, BrowserWindow, ipcMain, session, screen, shell, dialog } = require('electron');
const { pathToFileURL } = require('url');
const fs = require('fs');
const path = require('path');
const os = require('os');
const PerformanceMonitor = require('./performance-monitor');
const GPUFallback = require('./gpu-fallback');
const GPUConfig = require('./gpu-config');

// Initialize performance monitoring and GPU management
const perfMonitor = new PerformanceMonitor();
const gpuFallback = new GPUFallback();
const gpuConfig = new GPUConfig();

// Configure GPU settings before app is ready
gpuConfig.configure();

// Set a custom application name
app.setName('Nebula');

// Setup GPU crash handling
gpuFallback.setupCrashHandling();

// --- clear any prior registrations to prevent duplicate‐handler errors ---
ipcMain.removeHandler('window-minimize');
ipcMain.removeHandler('window-maximize');
ipcMain.removeHandler('window-close');



function createWindow(startUrl) {
  // Capture high‑resolution startup timing markers
  const perfMarks = { createWindow_called: performance.now() };

  // Get the available screen size (avoid full workArea allocation jank by starting slightly smaller then maximizing later if desired)
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const initialWidth = Math.min(width, Math.round(width * 0.9));
  const initialHeight = Math.min(height, Math.round(height * 0.9));

  // Window is created hidden; we only show after first meaningful paint to avoid OS‑level pointer jank while Chromium initializes
  let windowOptions = {
    width: initialWidth,
    height: initialHeight,
    show: false,
    useContentSize: true,
    backgroundColor: '#121212', // avoids white flash & early extra paints
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // Security & performance improvement
      contextIsolation: true,
      webviewTag: true,
      enableRemoteModule: false, // Deprecated and slow
      nodeIntegrationInSubFrames: false, // Security & performance
      nativeWindowOpen: false,
      spellcheck: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      offscreen: false,
      enableWebSQL: false,
      plugins: false,
      backgroundThrottling: false, // keep UI responsive during early load
      // OAuth compatibility settings
      partition: 'persist:main',
      sandbox: false
    },
    fullscreen: false,
    autoHideMenuBar: true,
    icon: process.platform === 'darwin'
      ? path.join(__dirname, 'assets/images/Logos/Nebula-Favicon.icns')
      : path.join(__dirname, 'assets/images/Logos/Nebula-favicon.png'),
    title: 'Nebula'
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
  perfMarks.browserWindow_instantiated = performance.now();

  // Allow window.open() popups (e.g. OAuth / SSO / school portals) so that
  // POST form submissions and opener relationships are preserved.
  // We still restrict to http/https for safety; everything else is denied.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return { action: 'allow' };
    }
    return { action: 'deny' };
  });

  // IMPORTANT: Do NOT intercept 'will-navigate' with preventDefault() because
  // that strips POST bodies (turning logins into GET requests). Let Chromium
  // perform the navigation normally. If you need to observe navigations, add
  // a listener without calling preventDefault().
  // (Previous code here was causing login forms to fail.)

  // Remove deprecated 'new-window' handler that forcibly loaded targets in the
  // same window; this also broke some auth popup flows. setWindowOpenHandler
  // above now governs popup behavior.

  // ensure all embedded <webview> tags behave predictably without heavy injections
  win.webContents.on('did-attach-webview', (event, webContents) => {
    // Allow popups inside <webview> as well (required for some login flows)
    webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return { action: 'allow' };
      }
      return { action: 'deny' };
    });
  });

  win.loadFile('renderer/index.html');
  perfMarks.loadFile_issued = performance.now();

  // if caller passed in a URL, forward it to the renderer after load
  if (startUrl) {
    win.webContents.once('did-finish-load', () => {
      win.webContents.send('open-url', startUrl);
    });
  }

  // Set default zoom to 100%
  const zoomFactor = 1.0;
  const loadStartTime = Date.now();
  // Show window ASAP after first paint for perceived performance
  let shown = false;
  const showNow = (reason) => {
    if (shown) return;
    shown = true;
    win.show();
    if (process.platform === 'win32') {
      // Defer maximize to next frame to avoid large-surface first paint cost
      setTimeout(() => {
        try { win.maximize(); } catch {}
      }, 16);
    }
    console.log(`[Startup] Window shown (${reason}) in ${(performance.now() - perfMarks.createWindow_called).toFixed(1)}ms`);
  };

  win.webContents.once('ready-to-show', () => showNow('ready-to-show'));
  // Fallback in case ready-to-show is delayed
  setTimeout(() => showNow('timeout-fallback'), 4000);

  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(zoomFactor);
    const loadTime = Date.now() - loadStartTime;
    perfMonitor.trackLoadTime(win.webContents.getURL(), loadTime);
    perfMarks.did_finish_load = performance.now();

    // Defer heavier, non‑critical tasks to next idle slice to keep UI smooth
    setTimeout(() => {
      // Kick off GPU status check here (was earlier) to avoid competing with first paint
      gpuConfig.checkGPUStatus()
        .then(gpuStatus => {
          console.log('[Deferred] GPU Configuration Results:');
          console.log('- GPU Status:', gpuStatus);
          console.log('- Recommendations:', gpuConfig.getRecommendations());
        })
        .catch(err => console.error('[Deferred] GPU status check failed:', err));

      // Start performance monitoring after initial load
      perfMonitor.start();
    }, 300);
  });

  // Renderer manages history; no main-process recording here
}

// This method will be called when Electron has finished initialization
// Configure sessions asynchronously (non-blocking for window creation)
function configureSessionsAsync() {
  const sessionsToConfigure = [session.fromPartition('persist:main'), session.defaultSession];
  try {
    for (const ses of sessionsToConfigure) {
      if (!ses) continue;
      ses.setPermissionRequestHandler((webContents, permission, callback) => {
        if (['notifications', 'geolocation', 'camera', 'microphone'].includes(permission)) {
          callback(false);
        } else {
          callback(true);
        }
      });
      try {
        const realUA = ses.getUserAgent();
        if (realUA && !realUA.includes('Nebula/')) {
          ses.setUserAgent(realUA + ' Nebula/1.0.0');
        }
      } catch (e) {
        console.warn('Failed to read real user agent, keeping default:', e);
      }
      ses.cookies.on('changed', (event, cookie, cause, removed) => {
        if (cookie.domain && (cookie.domain.includes('google') || cookie.domain.includes('accounts'))) {
          console.log(`Cookie ${removed ? 'removed' : 'added'}: ${cookie.name} for ${cookie.domain}`);
        }
      });
      ses.webRequest.onBeforeSendHeaders((details, callback) => {
        const headers = details.requestHeaders;
        if (details.url.includes('accounts.google.com') || details.url.includes('oauth')) {
          headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
          headers['Accept'] = headers['Accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
        }
        if (!headers['Accept-Language'] && !headers['accept-language']) {
          headers['Accept-Language'] = 'en-US,en;q=0.9';
        }
        callback({ requestHeaders: headers });
      });
    }
    console.log('Session configured successfully for OAuth compatibility');
  } catch (err) {
    console.error('Session setup error:', err);
  }
}

app.whenReady().then(() => {
  const t0 = performance.now();
  createWindow();
  console.log('[Startup] createWindow invoked in', (performance.now() - t0).toFixed(1), 'ms after app.whenReady');

  // Handle GPU process crashes (still register early)
  app.on('gpu-process-crashed', (event, killed) => {
    console.warn('GPU process crashed, killed:', killed);
    if (!killed) {
      console.log('Attempting to recover GPU process...');
    }
  });

  // Defer session configuration to microtask/next tick (already inexpensive) – keep explicit
  setImmediate(configureSessionsAsync);

  if (process.platform === 'darwin') {
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
  const filePath = path.join(__dirname, 'site-history.json');
  try {
    const data = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
});

ipcMain.handle('save-site-history', async (event, history) => {
  const filePath = path.join(__dirname, 'site-history.json');
  try {
    await fs.promises.writeFile(filePath, JSON.stringify(history, null, 2));
    return true;
  } catch (err) {
    return false;
  }
});

ipcMain.handle('clear-site-history', async () => {
  const filePath = path.join(__dirname, 'site-history.json');
  try {
    await fs.promises.writeFile(filePath, JSON.stringify([], null, 2));
    return true;
  } catch (err) {
    return false;
  }
});

ipcMain.handle('load-search-history', async () => {
  const filePath = path.join(__dirname, 'search-history.json');
  try {
    const data = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
});

ipcMain.handle('save-search-history', async (event, history) => {
  const filePath = path.join(__dirname, 'search-history.json');
  try {
    await fs.promises.writeFile(filePath, JSON.stringify(history, null, 2));
    return true;
  } catch (err) {
    return false;
  }
});

// debug: log default‐homepage changes from renderer
ipcMain.on('homepage-changed', (event, url) => {
  console.log('[MAIN] homepage-changed →', url);
});

// Bookmark management
ipcMain.handle('load-bookmarks', async () => {
  try {
    const bookmarksPath = path.join(__dirname, 'bookmarks.json');
    try {
      await fs.promises.access(bookmarksPath);
    } catch {
      console.log('No bookmarks file found, starting with empty array');
      return [];
    }
    const data = await fs.promises.readFile(bookmarksPath, 'utf8');
    const bookmarks = JSON.parse(data);
    console.log(`Loaded ${bookmarks.length} bookmarks from file`);
    return bookmarks;
  } catch (error) {
    console.error('Error loading bookmarks:', error);
    // Try to create a backup if the file is corrupted
    const bookmarksPath = path.join(__dirname, 'bookmarks.json');
    const backupPath = path.join(__dirname, `bookmarks.backup.${Date.now()}.json`);
    try {
      await fs.promises.copyFile(bookmarksPath, backupPath);
      console.log(`Corrupted bookmarks file backed up to: ${backupPath}`);
    } catch (backupError) {
      console.error('Failed to create backup:', backupError);
    }
    return [];
  }
});

ipcMain.handle('save-bookmarks', async (event, bookmarks) => {
  try {
    const bookmarksPath = path.join(__dirname, 'bookmarks.json');
    try {
      await fs.promises.access(bookmarksPath);
      const backupPath = path.join(__dirname, 'bookmarks.backup.json');
      await fs.promises.copyFile(bookmarksPath, backupPath);
    } catch {}
    await fs.promises.writeFile(bookmarksPath, JSON.stringify(bookmarks, null, 2));
    console.log(`Saved ${bookmarks.length} bookmarks to file`);
    return true;
  } catch (error) {
    console.error('Error saving bookmarks:', error);
    return false;
  }
});

ipcMain.handle('clear-browser-data', async () => {
  try {
    const sessionsToClear = [session.defaultSession, session.fromPartition('persist:main')];

    for (const ses of sessionsToClear) {
      if (!ses) continue;
      // Clear all common site storage types
      await ses.clearStorageData({
        storages: [
          'cookies',
          'localstorage',
          'indexdb',
          'filesystem',
          'websql',
          'serviceworkers',
          'caches',
          'shadercache',
          'appcache'
        ],
      });
      // Clear caches and auth
      await ses.clearCache();
      await ses.clearAuthCache();
    }

    // Also reset on-disk history JSON files managed by the app
    const siteHistoryPath = path.join(__dirname, 'site-history.json');
    const searchHistoryPath = path.join(__dirname, 'search-history.json');
    try { await fs.promises.writeFile(siteHistoryPath, JSON.stringify([], null, 2)); } catch {}
    try { await fs.promises.writeFile(searchHistoryPath, JSON.stringify([], null, 2)); } catch {}

    return true; // Indicate success
  } catch (error) {
    console.error('Failed to clear browser data:', error);
    return false; // Indicate failure
  }
});

// Optional: standalone clear for search history JSON
ipcMain.handle('clear-search-history', async () => {
  const filePath = path.join(__dirname, 'search-history.json');
  try {
    await fs.promises.writeFile(filePath, JSON.stringify([], null, 2));
    return true;
  } catch (err) {
    return false;
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
      const raw = await fs.promises.readFile(filePath, 'utf8');
      data = JSON.parse(raw);
    } catch {}
    // Remove if already exists to avoid duplicates
    data = data.filter(item => item !== url);
    // Add to beginning and clamp size
    data.unshift(url);
    if (data.length > 100) data = data.slice(0, 100);
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('[MAIN] Error saving site history entry:', err);
    return false;
  }
});

// Add performance monitoring IPC handlers
ipcMain.handle('get-performance-report', () => {
  return perfMonitor.getReport();
});

ipcMain.handle('force-gc', () => {
  perfMonitor.forceGC();
  return true;
});

// GPU diagnostics handler
ipcMain.handle('get-gpu-info', async () => {
  try {
    const gpuStatus = await gpuConfig.checkGPUStatus();
    const fallbackStatus = gpuFallback.getStatus();
    const recommendations = gpuConfig.getRecommendations();
    
    return {
      ...gpuStatus,
      fallbackStatus: fallbackStatus,
      recommendations: recommendations,
      isOptimized: gpuStatus.isSupported && !fallbackStatus.fallbackLevel
    };
  } catch (err) {
    console.error('Error getting GPU info:', err);
    return { error: err.message, isSupported: false };
  }
});

// Force GPU fallback handler
ipcMain.handle('apply-gpu-fallback', (event, level) => {
  try {
    gpuFallback.applyFallback(level);
    return { success: true, level: level };
  } catch (err) {
    console.error('Error applying GPU fallback:', err);
    return { error: err.message };
  }
});

// About/info handler
ipcMain.handle('get-about-info', () => {
  try {
    return {
      appName: app.getName(),
      appVersion: app.getVersion(),
      isPackaged: app.isPackaged,
      appPath: app.getAppPath(),
      userDataPath: app.getPath('userData'),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      v8Version: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      osType: os.type(),
      osRelease: os.release(),
      cpu: os.cpus()?.[0]?.model || 'Unknown CPU',
      totalMemGB: Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10,
    };
  } catch (err) {
    console.error('Error building about info:', err);
    return { error: err.message };
  }
});

// Toggle DevTools for the requesting window (main window webContents)
ipcMain.handle('open-devtools', (event) => {
  const wc = BrowserWindow.fromWebContents(event.sender);
  if (!wc) return false;
  const contents = wc.webContents;
  if (contents.isDevToolsOpened()) {
    contents.closeDevTools();
  } else {
  // Open docked inside the main window (bottom). Other options: 'right', 'undocked', 'detach'
  contents.openDevTools({ mode: 'bottom' });
  }
  return contents.isDevToolsOpened();
});

// Open local file dialog -> returns file:// URL (or null if cancelled)
ipcMain.handle('show-open-file-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'HTML Files', extensions: ['html', 'htm', 'xhtml'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return null;
    const filePath = result.filePaths[0];
    try {
      return pathToFileURL(filePath).href;
    } catch {
      // Fallback manual conversion
      let p = filePath.replace(/\\/g, '/');
      if (!p.startsWith('/')) p = '/' + p; // ensure leading slash for drive letters
      return 'file://' + (p.startsWith('/') ? '/' : '') + p; // double slash safety
    }
  } catch (err) {
    console.error('open-file dialog failed:', err);
    return null;
  }
});
