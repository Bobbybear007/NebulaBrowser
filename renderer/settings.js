// Use require('electron') since webviews have nodeIntegrationInSubFrames: true
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
  statusDiv.classList.remove('hidden'); // Show spinner immediately
  statusText.textContent = 'Clearing all browser data...'; // Update text while clearing

  try {
    // Invoke the main process to clear cookies, local storage, and cache
    const ok = await ipcRenderer.invoke('clear-browser-data');
    showStatus(ok
      ? 'All browser data and bookmarks cleared!'
      : 'Failed to clear browser data.');
  } catch (error) {
    console.error('Error clearing browser data:', error);
    showStatus('An error occurred while clearing data.');
  }
};
