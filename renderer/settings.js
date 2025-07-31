// Use require('electron') since webviews have nodeIntegrationInSubFrames: true
// In settings webview we use the same preload API as main windows
const { ipcRenderer } = require('electron');

const clearBtn = document.getElementById('clear-data-btn');
const statusDiv = document.getElementById('status');
const statusText = document.getElementById('status-text');

function showStatus(message) {
  statusText.textContent = message;
  statusDiv.classList.remove('hidden'); // Ensure the hidden class is removed
  setTimeout(() => {
    statusDiv.classList.add('hidden'); // Add the hidden class back after 2 seconds
  }, 2000);
}

clearBtn.onclick = async () => {
  statusDiv.classList.remove('hidden');
  statusText.textContent = 'Clearing all browser data...';

  try {
    const ok = await ipcRenderer.invoke('clear-browser-data');
    showStatus(ok
      ? 'All browser data and bookmarks cleared!'
      : 'Failed to clear browser data.');
  } catch (error) {
    console.error('Error clearing browser data:', error);
    showStatus('An error occurred while clearing data.');
  } finally {
    // Send theme update to host after clearing
    const currentTheme = window.browserCustomizer ? window.browserCustomizer.currentTheme : null;
    if (currentTheme && window.electronAPI && typeof window.electronAPI.sendToHost === 'function') {
      window.electronAPI.sendToHost('theme-update', currentTheme);
    }
  }
};
