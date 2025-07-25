// main.js

// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain, session } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const os = require('os');
const fs = require('fs');


app.commandLine.appendSwitch('ignore-gpu-blacklist');


if (process.platform === 'win32') {
    app.commandLine.appendSwitch('disable-gpu-sandbox');
    
    app.commandLine.appendSwitch('no-sandbox');
}



// Function to check if the application is running on SteamOS
const isSteamOS = () => {

  return os.platform() === 'linux' && os.release().includes('steam');
};

// Bookmark management functions
const bookmarksPath = path.join(__dirname, 'data', 'bookmarks.json');
const homeBookmarksPath = path.join(__dirname, 'data', 'home-bookmarks.json');

const loadBookmarks = () => {
  try {
    if (fs.existsSync(bookmarksPath)) {
      const data = fs.readFileSync(bookmarksPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading bookmarks:', error);
  }
  return { bookmarks: [] };
};

const saveBookmarks = (bookmarksData) => {
  try {
    fs.writeFileSync(bookmarksPath, JSON.stringify(bookmarksData, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving bookmarks:', error);
    return false;
  }
};

const loadHomeBookmarks = () => {
  try {
    if (fs.existsSync(homeBookmarksPath)) {
      const data = fs.readFileSync(homeBookmarksPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading home bookmarks:', error);
  }
  return { home_bookmarks: [] };
};

const saveHomeBookmarks = (bookmarksData) => {
  try {
    fs.writeFileSync(homeBookmarksPath, JSON.stringify(bookmarksData, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving home bookmarks:', error);
    return false;
  }
};

// IPC handlers for bookmark functionality
ipcMain.handle('get-bookmarks', () => {
  return loadBookmarks();
});

ipcMain.handle('get-home-bookmarks', () => {
  return loadHomeBookmarks();
});

ipcMain.handle('add-bookmark', (event, bookmark) => {
  const bookmarksData = loadBookmarks();
  
  // Check if bookmark already exists
  const exists = bookmarksData.bookmarks.some(b => b.url === bookmark.url);
  if (exists) {
    return { success: false, message: 'Bookmark already exists' };
  }
  
  // Add timestamp
  bookmark.dateAdded = new Date().toISOString();
  
  bookmarksData.bookmarks.push(bookmark);
  const saved = saveBookmarks(bookmarksData);
  
  return { success: saved, message: saved ? 'Bookmark added' : 'Failed to save bookmark' };
});

ipcMain.handle('add-home-bookmark', (event, bookmark) => {
  const bookmarksData = loadHomeBookmarks();
  
  // Check if bookmark already exists
  const exists = bookmarksData.home_bookmarks.some(b => b.url === bookmark.url);
  if (exists) {
    return { success: false, message: 'Bookmark already exists' };
  }
  
  // Add timestamp
  bookmark.dateAdded = new Date().toISOString();
  
  bookmarksData.home_bookmarks.push(bookmark);
  const saved = saveHomeBookmarks(bookmarksData);
  
  return { success: saved, message: saved ? 'Bookmark added' : 'Failed to save bookmark' };
});

ipcMain.handle('remove-bookmark', (event, url) => {
  const bookmarksData = loadBookmarks();
  const initialLength = bookmarksData.bookmarks.length;
  
  bookmarksData.bookmarks = bookmarksData.bookmarks.filter(b => b.url !== url);
  
  if (bookmarksData.bookmarks.length < initialLength) {
    const saved = saveBookmarks(bookmarksData);
    return { success: saved, message: saved ? 'Bookmark removed' : 'Failed to save bookmarks' };
  }
  
  return { success: false, message: 'Bookmark not found' };
});

ipcMain.handle('remove-home-bookmark', (event, url) => {
  const bookmarksData = loadHomeBookmarks();
  const initialLength = bookmarksData.home_bookmarks.length;
  
  bookmarksData.home_bookmarks = bookmarksData.home_bookmarks.filter(b => b.url !== url);
  
  if (bookmarksData.home_bookmarks.length < initialLength) {
    const saved = saveHomeBookmarks(bookmarksData);
    return { success: saved, message: saved ? 'Bookmark removed' : 'Failed to save bookmarks' };
  }
  
  return { success: false, message: 'Bookmark not found' };
});

// Handle clear cookies request from settings page
ipcMain.handle('clear-cookies', async (event) => {
    try {
        const ses = event.sender.session;
        await ses.clearStorageData({ storages: ['cookies'] });
        return { success: true };
    } catch (error) {
        console.error('Error clearing cookies:', error);
        return { success: false, error: error.message };
    }
});
// Handle go-home request from settings page to navigate back to home
ipcMain.handle('go-home', (event) => {
    // event.sender is the webContents of the webview
    const wc = event.sender;
    const homePath = path.join(__dirname, 'frontend', 'pages', 'home.html');
    // Convert file path to file:// URL and load in the webview
    const homeUrl = pathToFileURL(homePath).href;
    wc.loadURL(homeUrl);
    return { success: true };
});

// Handle clear bookmarks request from settings page
ipcMain.handle('clear-bookmarks', (event) => {
    try {
        fs.writeFileSync(bookmarksPath, JSON.stringify({ bookmarks: [] }, null, 2));
        return { success: true };
    } catch (error) {
        console.error('Error clearing bookmarks:', error);
        return { success: false, error: error.message };
    }
});

// Handle clear home bookmarks request from settings page
ipcMain.handle('clear-home-bookmarks', (event) => {
    try {
        fs.writeFileSync(homeBookmarksPath, JSON.stringify({ home_bookmarks: [] }, null, 2));
        return { success: true };
    } catch (error) {
        console.error('Error clearing home bookmarks:', error);
        return { success: false, error: error.message };
    }
});

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // The webview tag is essential for our browser's core functionality.
      webviewTag: true,
      // For security reasons, it's good practice to disable nodeIntegration
      // and use a preload script to expose specific functionalities.
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Remove default application menu (File, Edit, View)
  mainWindow.removeMenu();

  // Load the index.html of the app.
  mainWindow.loadFile('frontend/index.html');

  // Pass the SteamOS status to the renderer process
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('is-steam-os', isSteamOS());
  });

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.