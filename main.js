const { app, BrowserWindow, ipcMain, session, screen, shell, dialog, Menu, clipboard, webContents } = require('electron');
const { pathToFileURL } = require('url');
const fs = require('fs');
const path = require('path');
const os = require('os');
const PerformanceMonitor = require('./performance-monitor');
const GPUFallback = require('./gpu-fallback');
const GPUConfig = require('./gpu-config');
const PluginManager = require('./plugin-manager');

// Initialize performance monitoring and GPU management
const perfMonitor = new PerformanceMonitor();
const gpuFallback = new GPUFallback();
const gpuConfig = new GPUConfig();
const pluginManager = new PluginManager();

// Try to enable WebAuthn/platform authenticator features early.
// This helps Chromium expose platform authenticators (Touch ID / built-in) where supported.
try {
  app.commandLine.appendSwitch('enable-experimental-web-platform-features');
  // Add common WebAuthn-related feature flags. These are safe attempts to enable platform
  // authenticators and related WebAuthn plumbing in embedded Chromium builds.
  app.commandLine.appendSwitch('enable-features', 'WebAuthn,WebAuthnNestedAssertions,WebAuthnCable');
} catch (e) {
  // Non-fatal: some environments may not allow commandLine changes at this time.
}

// Configure GPU settings before app is ready
gpuConfig.configure();

// Set a custom application name
app.setName('Nebula');

// --- Custom User Agent (hide Electron token & brand as Nebula) ---
// Many sites rely on UA sniffing. Default Electron UA contains 'Electron/x.y.z' which
// makes detection sites label the app as an Electron application. We construct a
// Chrome‑compatible UA string without the Electron token, appending a Nebula marker.
// NOTE: Keep the Chrome and Safari tokens for maximum compatibility.
// If you ever need to temporarily reveal Electron for debugging, set NEBULA_DEBUG_ELECTRON_UA=1.
const chromeVersion = process.versions.chrome; // matches bundled Chromium
const nebulaVersion = app.getVersion();
function computeBaseUA() {
  let platformPart;
  if (process.platform === 'win32') {
    // Use generic Windows 10 token; detailed build numbers rarely needed and can cause UA entropy issues.
    platformPart = 'Windows NT 10.0; Win64; x64';
  } else if (process.platform === 'darwin') {
    // A neutral modern macOS token; avoid exposing real minor version for stability.
    platformPart = 'Macintosh; Intel Mac OS X 10_15_7';
  } else {
    platformPart = 'X11; Linux x86_64';
  }
  return `Mozilla/5.0 (${platformPart}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36 Nebula/${nebulaVersion}`;
}

if (!process.env.NEBULA_DEBUG_ELECTRON_UA) {
  // Set a fallback UA so any new sessions inherit it automatically.
  try { app.userAgentFallback = computeBaseUA(); } catch {}
}

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
    // Use a hidden/transparent title bar on macOS so we can render a
    // custom, sleeker header in the renderer while still supporting
    // native traffic-light placement. The renderer will expose a
    // draggable region via CSS (-webkit-app-region: drag).
    Object.assign(windowOptions, {
      frame: true,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 15, y: 20 },
      // Transparent background so renderer chrome blends with content.
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
    // Diagnostic: check WebAuthn / platform authenticator availability in renderer
    try {
      win.webContents.executeJavaScript(`(async function(){
        const out = { hasNavigator: !!window.navigator, hasCredentials: !!navigator.credentials, hasCreate: !!(navigator.credentials && navigator.credentials.create), hasGet: !!(navigator.credentials && navigator.credentials.get) };
        try {
          if (window.PublicKeyCredential) {
            out.PublicKeyCredential = true;
            out.isUserVerifyingPlatformAuthenticatorAvailable = typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function' ? await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable() : 'unknown';
          } else {
            out.PublicKeyCredential = false;
          }
        } catch (e) { out.webauthnError = String(e); }
        return out;
      })()`)
      .then(result => {
        console.log('[WebAuthn Diagnostic] renderer report:', result);
      }).catch(err => {
        console.error('[WebAuthn Diagnostic] executeJavaScript failed:', err);
      });
    } catch (e) {
      console.warn('WebAuthn diagnostic injection skipped:', e);
    }

  // After the first load, let plugins know a window exists
  try { pluginManager.emit('window-created', win); } catch {}
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
        let realUA = ses.getUserAgent();
        // If Electron token present and we're not in debug mode, recompute using base builder.
        if (!process.env.NEBULA_DEBUG_ELECTRON_UA) {
          const hasElectron = /Electron\//i.test(realUA);
          if (hasElectron || !/Nebula\//.test(realUA)) {
            realUA = app.userAgentFallback || computeBaseUA();
            ses.setUserAgent(realUA);
          }
        } else {
          // Debug mode: just append Nebula tag if missing (keeps Electron segment visible)
            if (realUA && !/Nebula\//.test(realUA)) {
              ses.setUserAgent(realUA + ' Nebula/' + app.getVersion());
            }
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
  // Initialize user plugins after app ready
  try {
    pluginManager.ensureUserPluginsDir();
    pluginManager.loadAll();
    pluginManager.emit('app-ready');
  } catch (e) {
    console.error('[Plugins] initialization error:', e);
  }
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

  // Register download handlers for common sessions
  try {
    const mainSes = session.fromPartition('persist:main');
    const defSes = session.defaultSession;
    if (mainSes) registerDownloadHandling(mainSes);
    if (defSes && defSes !== mainSes) registerDownloadHandling(defSes);
  // Allow plugins to attach webRequest hooks
  if (mainSes) pluginManager.applyWebRequestHandlers(mainSes);
  if (defSes) pluginManager.applyWebRequestHandlers(defSes);
  pluginManager.emit('session-configured', { mainSes, defSes });
  } catch (e) {
    console.warn('Failed to register download handlers:', e);
  }

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

// Helper to build and show a native context menu for a given webContents + params
function buildAndShowContextMenu(sender, params = {}) {
  try {
    const embedder = sender.hostWebContents || sender;
    const template = [];

    template.push(
      { label: 'Back', enabled: sender.canGoBack?.(), click: () => { try { sender.goBack(); } catch {} } },
      { label: 'Forward', enabled: sender.canGoForward?.(), click: () => { try { sender.goForward(); } catch {} } },
      { label: 'Reload', click: () => { try { sender.reload(); } catch {} } },
      { type: 'separator' }
    );

    // Link actions
    const linkURL = params.linkURL && params.linkURL.startsWith('http') ? params.linkURL : undefined;
    if (linkURL) {
      template.push(
        { label: 'Open Link in New Tab', click: () => embedder.send('context-menu-command', { cmd: 'open-link-new-tab', url: linkURL }) },
        { label: 'Download Link', click: () => {
            try { (sender.hostWebContents || sender).downloadURL(linkURL); } catch (e) { console.error('downloadURL failed:', e); }
          }
        },
        { label: 'Open Link Externally', click: () => shell.openExternal(linkURL).catch(()=>{}) },
        { label: 'Copy Link Address', click: () => clipboard.writeText(linkURL) },
        { type: 'separator' }
      );
    }

    // Image actions
    const imageURL = (params.mediaType === 'image' && params.srcURL) ? params.srcURL : (params.imgURL || undefined);
    if (imageURL) {
      template.push(
        { label: 'Open Image in New Tab', click: () => embedder.send('context-menu-command', { cmd: 'open-image-new-tab', url: imageURL }) },
        { label: 'Copy Image Address', click: () => clipboard.writeText(imageURL) },
  { label: 'Save Image As...', click: () => embedder.send('context-menu-command', { cmd: 'save-image', url: imageURL, mime: params.mediaType === 'image' ? params.mimeType : undefined }) },
        { type: 'separator' }
      );
    }

    // Text / editable
    if (params.isEditable) {
      template.push(
        { label: 'Undo', role: 'undo' },
        { label: 'Redo', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', role: 'cut' },
        { label: 'Copy', role: 'copy' },
        { label: 'Paste', role: 'paste' },
        { label: 'Select All', role: 'selectAll' },
        { type: 'separator' }
      );
    } else if (params.selectionText) {
      template.push(
        { label: 'Copy', role: 'copy' },
        { label: 'Select All', role: 'selectAll' },
        { type: 'separator' }
      );
    }

    template.push({
      label: 'Inspect Element',
      click: () => {
        try {
          // Use the main window's webContents for DevTools
          const mainWin = BrowserWindow.fromWebContents(sender.hostWebContents || sender);
          const mainWC = mainWin.webContents;
          const inspectX = params.x ?? params.clientX ?? 0;
          const inspectY = params.y ?? params.clientY ?? 0;
          
          // Open DevTools docked at bottom if not already open
          if (!mainWC.isDevToolsOpened()) {
            mainWC.openDevTools({ mode: 'bottom' });
          }
          
          // Inspect the element
          setTimeout(() => {
            try {
              mainWC.inspectElement(inspectX, inspectY);
            } catch (e) {
              // Fallback: try on original sender
              try { sender.inspectElement(inspectX, inspectY); } catch {}
            }
          }, 50);
        } catch (err) {
          console.error('Inspect Element failed:', err);
        }
      }
    });

  // Allow plugins to customize/append context menu
  try { pluginManager.applyContextMenuContrib(template, params, sender); } catch {}
  const menu = Menu.buildFromTemplate(template);
    const win = BrowserWindow.fromWebContents(embedder);
    if (win) menu.popup({ window: win });
  } catch (err) {
    console.error('Failed to build context menu:', err);
  }
}

// IPC trigger (legacy / renderer-requested)
ipcMain.handle('show-context-menu', (event, params = {}) => {
  buildAndShowContextMenu(event.sender, params);
});

// Plugins: expose renderer preload list
ipcMain.handle('plugins-get-renderer-preloads', () => {
  try { return pluginManager.getRendererPreloads(); } catch { return []; }
});

// Plugins: expose registered internal pages (browser://<id>)
ipcMain.handle('plugins-get-pages', () => {
  try { return pluginManager.getRendererPages(); } catch { return []; }
});

// Plugins: management IPC for settings UI
ipcMain.handle('plugins-list', () => pluginManager.discoverPlugins());
ipcMain.handle('plugins-set-enabled', async (_e, { id, enabled }) => {
  const ok = await pluginManager.setEnabled(id, enabled);
  // Reload to apply enable/disable (requires app reload for renderer preloads)
  pluginManager.reload();
  return ok;
});
ipcMain.handle('plugins-reload', (_e, { id } = {}) => {
  pluginManager.reload(id);
  return true;
});

// Automatic native context menu for any webContents (windows + webviews)
app.on('web-contents-created', (event, contents) => {
  contents.on('context-menu', (e, params) => {
    buildAndShowContextMenu(contents, params);
  });

  // Emit to plugins
  try { pluginManager.emit('web-contents-created', contents); } catch {}

  // On macOS, when a page (or a <webview>) enters HTML fullscreen (e.g., YouTube video),
  // also toggle the BrowserWindow into simple fullscreen so the content uses the whole
  // screen and macOS traffic lights/titlebar are hidden. Revert when HTML fullscreen exits.
  if (process.platform === 'darwin') {
    const getOwningWindow = () => {
      try {
        const host = contents.hostWebContents || contents;
        return BrowserWindow.fromWebContents(host) || null;
      } catch { return null; }
    };

    contents.on('enter-html-full-screen', () => {
      const win = getOwningWindow();
      if (!win) return;
      win.__htmlFsDepth = (win.__htmlFsDepth || 0) + 1;
      // If the window is already in native fullscreen (green button), don't switch modes
      const alreadyNativeFs = typeof win.isFullScreen === 'function' && win.isFullScreen();
      if (!alreadyNativeFs && !win.isSimpleFullScreen?.()) {
        try { win.setSimpleFullScreen?.(true); win.__htmlFsUsingSimple = true; } catch {}
      }
    });

    contents.on('leave-html-full-screen', () => {
      const win = getOwningWindow();
      if (!win) return;
      win.__htmlFsDepth = Math.max(0, (win.__htmlFsDepth || 1) - 1);
      if (win.__htmlFsDepth === 0 && win.__htmlFsUsingSimple) {
        try { if (win.isSimpleFullScreen?.()) win.setSimpleFullScreen?.(false); } catch {}
        win.__htmlFsUsingSimple = false;
      }
    });
  }
});

// --- Image save handlers ---
ipcMain.handle('save-image-from-dataurl', async (event, { suggestedName = 'image', dataUrl }) => {
  try {
    if (!dataUrl || !dataUrl.startsWith('data:')) return false;
    const match = /^data:(.*?);base64,(.*)$/.exec(dataUrl);
    if (!match) return false;
    const mime = match[1] || 'application/octet-stream';
    const ext = (mime.split('/')[1] || 'png').split(';')[0];
    const buf = Buffer.from(match[2], 'base64');
    const win = BrowserWindow.fromWebContents(event.sender.hostWebContents || event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: `${suggestedName}.${ext}` });
    if (canceled || !filePath) return false;
    await fs.promises.writeFile(filePath, buf);
    return true;
  } catch (err) {
    console.error('save-image-from-dataurl failed:', err);
    return false;
  }
});

ipcMain.handle('save-image-from-url', async (event, { url }) => {
  if (!url) return false;
  const win = BrowserWindow.fromWebContents(event.sender.hostWebContents || event.sender);
  try {
    let dataBuf;
    if (url.startsWith('http')) {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP '+res.status);
      const arrayBuf = await res.arrayBuffer();
      dataBuf = Buffer.from(arrayBuf);
      const ctype = res.headers.get('content-type') || 'application/octet-stream';
      const ext = (ctype.split('/')[1] || 'png').split(';')[0];
      const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: `image.${ext}` });
      if (canceled || !filePath) return false;
      await fs.promises.writeFile(filePath, dataBuf);
      return true;
    } else if (url.startsWith('data:')) {
      // Forward to dataURL handler path – easier to keep logic single
      return ipcMain.emit('save-image-from-dataurl', event, { dataUrl: url });
    } else if (url.startsWith('file:')) {
      // Copy file to chosen destination
      const filePathSrc = new URL(url).pathname.replace(/^\//, '');
      const base = path.basename(filePathSrc);
      const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: base });
      if (canceled || !filePath) return false;
      await fs.promises.copyFile(filePathSrc, filePath);
      return true;
    } else {
      return false;
    }
  } catch (err) {
    console.error('save-image-from-url failed:', err);
    return false;
  }
});

// =========================
// Download manager plumbing
// =========================

// In-memory download registry
const downloads = new Map(); // id -> { id, url, filename, savePath, totalBytes, receivedBytes, state, startedAt, mime, canResume, paused }

function broadcastToAll(channel, payload) {
  try {
    for (const wc of webContents.getAllWebContents()) {
      try { wc.send(channel, payload); } catch {}
    }
  } catch (e) {
    // Fallback to windows only
    for (const win of BrowserWindow.getAllWindows()) {
      try { win.webContents.send(channel, payload); } catch {}
    }
  }
}

function registerDownloadHandling(ses) {
  if (!ses || ses.__nebulaDownloadsHooked) return;
  ses.__nebulaDownloadsHooked = true;
  ses.on('will-download', async (event, item, wc) => {
    try {
      // Build an id (prefer stable GUID if available)
      const id = typeof item.getGUID === 'function' ? item.getGUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      item.__nebulaId = id;
      const filename = item.getFilename();
      const mime = item.getMimeType?.() || 'application/octet-stream';
      const totalBytes = item.getTotalBytes();
      const url = item.getURL();

      // Choose a default save path under user's Downloads, ensure unique to avoid overwrite
      const defaultDir = app.getPath('downloads');
      const uniquePath = await computeUniqueSavePath(defaultDir, filename);
      try { item.setSavePath(uniquePath); } catch {}

      const info = {
        id, url, filename,
        savePath: uniquePath,
        totalBytes,
        receivedBytes: 0,
        state: 'in-progress',
        startedAt: Date.now(),
        mime,
        canResume: false,
        paused: false
      };
      downloads.set(id, { ...info, item });
  const payload = { ...info };
  broadcastToAll('downloads-started', payload);

      item.on('updated', (e, state) => {
        const d = downloads.get(id);
        if (!d) return;
        d.receivedBytes = item.getReceivedBytes();
        d.canResume = !!item.canResume?.();
        d.paused = !!item.isPaused?.();
        d.state = state === 'interrupted' ? 'interrupted' : 'in-progress';
        downloads.set(id, d);
        broadcastToAll('downloads-updated', {
          id,
          receivedBytes: d.receivedBytes,
          totalBytes: d.totalBytes,
          state: d.state,
          canResume: d.canResume,
          paused: d.paused
        });
      });

      item.once('done', (e, state) => {
        const d = downloads.get(id) || {};
        const finalState = state === 'completed' ? 'completed' : (state === 'cancelled' ? 'cancelled' : 'interrupted');
        const final = {
          id,
          url,
          filename,
          savePath: item.getSavePath?.() || d.savePath,
          totalBytes: d.totalBytes || item.getTotalBytes?.() || 0,
          receivedBytes: item.getReceivedBytes?.() || d.receivedBytes || 0,
          state: finalState,
          startedAt: d.startedAt || Date.now(),
          endedAt: Date.now(),
          mime
        };
        // Store minimal object; drop live item ref
        downloads.set(id, final);
        broadcastToAll('downloads-done', final);
      });
    } catch (err) {
      console.error('will-download handler error:', err);
    }
  });
}

async function computeUniqueSavePath(dir, baseName) {
  try {
    const target = path.join(dir, baseName);
    try {
      await fs.promises.access(target);
      // Already exists, create a (n) suffix
      const { name, ext } = splitNameExt(baseName);
      for (let i = 1; i < 10000; i++) {
        const candidate = path.join(dir, `${name} (${i})${ext}`);
        try { await fs.promises.access(candidate); } catch { return candidate; }
      }
      // Fallback if too many
      return path.join(dir, `${Date.now()}-${baseName}`);
    } catch {
      return target; // does not exist
    }
  } catch (e) {
    // Fallback to temp directory
    return path.join(app.getPath('downloads'), `${Date.now()}-${baseName}`);
  }
}

function splitNameExt(filename) {
  const ext = path.extname(filename);
  const name = filename.slice(0, filename.length - ext.length);
  return { name, ext };
}

// IPC: list downloads
ipcMain.handle('downloads-get-all', () => {
  return Array.from(downloads.values()).map(d => {
    const { item, ...rest } = d;
    if (item) {
      return {
        ...rest,
        receivedBytes: item.getReceivedBytes?.() ?? rest.receivedBytes ?? 0,
        totalBytes: item.getTotalBytes?.() ?? rest.totalBytes ?? 0,
        state: rest.state || 'in-progress',
        paused: item.isPaused?.() || false,
        canResume: item.canResume?.() || false
      };
    }
    return rest;
  });
});

// IPC: control a download (pause/resume/cancel/open/show)
ipcMain.handle('downloads-action', async (event, { id, action }) => {
  const d = downloads.get(id);
  if (!d) return false;
  const item = d.item;
  try {
    switch (action) {
      case 'pause':
        if (item && !item.isPaused?.()) item.pause?.();
        return true;
      case 'resume':
        if (item && item.canResume?.()) item.resume?.();
        return true;
      case 'cancel':
        if (item && d.state === 'in-progress') item.cancel?.();
        return true;
      case 'open-file':
        if (d.savePath) {
          await shell.openPath(d.savePath);
          return true;
        }
        return false;
      case 'show-in-folder':
        if (d.savePath) {
          shell.showItemInFolder(d.savePath);
          return true;
        }
        return false;
      default:
        return false;
    }
  } catch (e) {
    console.error('downloads-action error:', e);
    return false;
  }
});

// IPC: clear completed entries from the registry (keeps in-progress)
ipcMain.handle('downloads-clear-completed', () => {
  for (const [id, d] of downloads.entries()) {
    if (d.state === 'completed' || d.state === 'cancelled') downloads.delete(id);
  }
  broadcastToAll('downloads-cleared');
  return true;
});
