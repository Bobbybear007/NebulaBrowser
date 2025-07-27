const { app, BrowserWindow, ipcMain, session, screen, shell } = require('electron');
const fs = require('fs');
const path = require('path');
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
      plugins: false // Disable plugins that might interfere with GPU
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

  // ensure all embedded <webview> tags also use the same window
  win.webContents.on('did-attach-webview', (event, webContents) => {
    // Set up webview with preload script to provide electronAPI - fixed injection
    webContents.on('dom-ready', () => {
      // Simpler, more reliable API injection that doesn't require cloning
      webContents.executeJavaScript(`
        if (!window.electronAPI) {
          // Create a simple bridge without complex objects
          window.electronAPI = {
            invoke: function(channel) {
              const args = Array.prototype.slice.call(arguments, 1);
              return new Promise(function(resolve, reject) {
                try {
                  const ipcRenderer = require('electron').ipcRenderer;
                  ipcRenderer.invoke(channel, ...args).then(resolve).catch(reject);
                } catch (err) {
                  reject(err);
                }
              });
            }
          };
          console.log('electronAPI injected successfully');
        }
      `).catch(err => {
        console.error('Failed to inject electronAPI:', err);
        // Fallback: inject minimal API
        webContents.executeJavaScript(`
          window.electronAPI = { invoke: function() { return Promise.resolve(); } };
        `).catch(() => {});
      });
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
  const loadStartTime = Date.now();
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(zoomFactor);
    
    // Track load time for performance monitoring
    const loadTime = Date.now() - loadStartTime;
    perfMonitor.trackLoadTime(win.webContents.getURL(), loadTime);
  });

  // Debounced history recording to prevent excessive I/O
  let historyTimeout;
  const recordHistory = async (fileName, entry) => {
    // Clear existing timeout
    if (historyTimeout) {
      clearTimeout(historyTimeout);
    }
    
    // Debounce history recording by 500ms
    historyTimeout = setTimeout(async () => {
      if (fileName === 'site-history.json') {
        // Save to both file and send to renderer
        const filePath = path.join(__dirname, fileName);
        let data = [];
        try { 
          const fileContent = fs.readFileSync(filePath, 'utf8');
          data = JSON.parse(fileContent); 
        } catch {}
        
        if (data[0] !== entry) {
          data.unshift(entry);
          if (data.length > 100) data.pop();
          
          // Use async file operations to prevent blocking
          try {
            await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
          } catch (err) {
            console.error('Error writing site history:', err);
          }
        }
        // Also send to renderer for localStorage
        win.webContents.send('record-site-history', entry);
      } else {
        // Keep search history in JSON file for now
        const filePath = path.join(__dirname, fileName);
        let data = [];
        try { 
          const fileContent = fs.readFileSync(filePath, 'utf8');
          data = JSON.parse(fileContent); 
        } catch {}
        
        if (data[0] !== entry) {
          data.unshift(entry);
          if (data.length > 100) data.pop();
          
          try {
            await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
          } catch (err) {
            console.error('Error writing search history:', err);
          }
        }
      }
    }, 500);
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

  // Optimize session settings for performance
  const ses = session.defaultSession;
  
  try {
    // Enable request/response caching
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      details.requestHeaders['Cache-Control'] = 'max-age=3600';
      callback({ requestHeaders: details.requestHeaders });
    });
    
    // Skip preload registration as it's handled in window options
    console.log('Session configured successfully');
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
