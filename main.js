const { app, BrowserWindow, BrowserView, ipcMain } = require('electron'); // Add ipcMain here
const path = require('node:path');

let mainWindow;
let browserView;

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webviewTag: false
        }
    });

    mainWindow.loadFile('index.html');

    // Open the DevTools.
    // mainWindow.webContents.openDevTools();

    browserView = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        }
    });

    mainWindow.setBrowserView(browserView);

    const navBarHeight = 80; // Make sure this matches your CSS navbar height
    const updateBrowserViewBounds = () => {
        const { width, height } = mainWindow.getBounds();
        browserView.setBounds({ x: 0, y: navBarHeight, width: width, height: height - navBarHeight });
    };

    updateBrowserViewBounds(); // Set initial bounds
    browserView.webContents.loadURL('https://www.google.com');

    mainWindow.on('resize', updateBrowserViewBounds);

    // --- IPC Handlers ---
    ipcMain.on('load-url', (event, url) => {
        let formattedUrl = url;
        // Basic URL formatting: if no protocol, assume https://
        if (!formattedUrl.match(/^[a-zA-Z]+:\/\//)) {
            formattedUrl = 'https://' + formattedUrl;
        }
        browserView.webContents.loadURL(formattedUrl).catch(err => {
            console.error('Failed to load URL:', err);
            // Optionally send an error back to the renderer
        });
    });

    ipcMain.on('go-back', () => {
        if (browserView.webContents.canGoBack()) {
            browserView.webContents.goBack();
        }
    });

    ipcMain.on('go-forward', () => {
        if (browserView.webContents.canGoForward()) {
            browserView.webContents.goForward();
        }
    });

    ipcMain.on('refresh-page', () => {
        browserView.webContents.reload();
    });
    // --- End IPC Handlers ---
};

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});