const { app, BrowserWindow, ipcMain, session, screen, shell } = require('electron');
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
  // Get the available screen size
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  // Ensure nativeWindowOpen is disabled
  let windowOptions = {
    width,
    height,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // Security & performance improvement
      contextIsolation: true,
      webviewTag: true,
      enableRemoteModule: false, // Deprecated and slow
      nodeIntegrationInSubFrames: false, // Security & performance
      nativeWindowOpen: false,
      spellcheck: false, // Disable if not needed
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      offscreen: false, // Ensure on-screen rendering for GPU
      enableWebSQL: false, // Disable deprecated features
      plugins: false, // Disable plugins that might interfere with GPU
      // OAuth compatibility settings
      partition: 'persist:main',
      sandbox: false // Allow full browser capabilities for OAuth
    },
    fullscreen: false,
    autoHideMenuBar: true,
    icon: process.platform === 'darwin' 
      ? path.join(__dirname, 'assets/images/Logos/Nebula-Favicon.icns')
      : path.join(__dirname, 'assets/images/Logos/Nebula-favicon.png'),
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

  // ensure all embedded <webview> tags behave predictably without heavy injections
  win.webContents.on('did-attach-webview', (event, webContents) => {
    // Let the renderer/webview handle navigation; avoid extra JS injection that can stall
    webContents.setWindowOpenHandler(({ url }) => {
      webContents.loadURL(url);
      return { action: 'deny' };
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
  const loadStartTime = Date.now();
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(zoomFactor);
    
    // Track load time for performance monitoring
    const loadTime = Date.now() - loadStartTime;
    perfMonitor.trackLoadTime(win.webContents.getURL(), loadTime);
  });

  // Renderer manages history; no main-process recording here
}

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  // Check GPU status and handle errors
  const gpuStatus = await gpuConfig.checkGPUStatus();
  console.log('GPU Configuration Results:');
  console.log('- GPU Status:', gpuStatus);
  console.log('- Recommendations:', gpuConfig.getRecommendations());
  
  // Handle GPU process crashes
  app.on('gpu-process-crashed', (event, killed) => {
    console.warn('GPU process crashed, killed:', killed);
    if (!killed) {
      console.log('Attempting to recover GPU process...');
    }
  });

  // Optimize session settings for performance and OAuth compatibility
  const sessionsToConfigure = [session.fromPartition('persist:main'), session.defaultSession];
  try {
    for (const ses of sessionsToConfigure) {
      // Configure session for OAuth compatibility (Google, etc.)
      ses.setPermissionRequestHandler((webContents, permission, callback) => {
        // Allow necessary permissions for OAuth flows
        if (['notifications', 'geolocation', 'camera', 'microphone'].includes(permission)) {
          callback(false); // Deny by default for privacy
        } else {
          callback(true); // Allow others like storage access
        }
      });

      // Configure user agent for better compatibility
      ses.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Nebula/1.0.0');

      // Configure cookies for OAuth compatibility
      ses.cookies.on('changed', (event, cookie, cause, removed) => {
        // Log cookie changes for debugging OAuth issues
        if (cookie.domain && (cookie.domain.includes('google') || cookie.domain.includes('accounts'))) {
          console.log(`Cookie ${removed ? 'removed' : 'added'}: ${cookie.name} for ${cookie.domain}`);
        }
      });

      // Optional: add headers only for OAuth flows; avoid forcing cache headers globally
      ses.webRequest.onBeforeSendHeaders((details, callback) => {
        if (details.url.includes('accounts.google.com') || details.url.includes('oauth')) {
          details.requestHeaders['Referrer-Policy'] = 'strict-origin-when-cross-origin';
          details.requestHeaders['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
        }
        callback({ requestHeaders: details.requestHeaders });
      });
    }
    console.log('Session configured successfully for OAuth compatibility');
  } catch (err) {
    console.error('Session setup error:', err);
  }
  
  // Start performance monitoring
  perfMonitor.start();
  
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
