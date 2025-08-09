// Try to get ipcRenderer, but don't fail if it's not available
let ipcRenderer = null;
try {
  if (typeof require !== 'undefined') {
    const electron = require('electron');
    ipcRenderer = electron.ipcRenderer;
  }
} catch (e) {
  console.log('[SETTINGS] Electron IPC not available, some features may be limited');
}

let clearBtn = document.getElementById('clear-data-btn');
const statusDiv = document.getElementById('status');
const statusText = document.getElementById('status-text');
const TAB_STORAGE_KEY = 'nebula-settings-active-tab';

function showStatus(message) {
  if (statusText && statusDiv) {
    statusText.textContent = message;
    statusDiv.classList.remove('hidden');
    setTimeout(() => {
      statusDiv.classList.add('hidden');
    }, 2000);
  } else {
    console.log('[STATUS]', message);
  }
}

function showStatus(message) {
  statusText.textContent = message;
  statusDiv.classList.remove('hidden'); // Ensure the hidden class is removed
  setTimeout(() => {
    statusDiv.classList.add('hidden'); // Add the hidden class back after 2 seconds
  }, 2000);
}

function attachClearHandler(btn) {
  if (!btn) return;
  btn.onclick = async () => {
    if (statusDiv && statusText) {
      statusDiv.classList.remove('hidden');
      statusText.textContent = 'Clearing all browser data...';
    }

    try {
      if (ipcRenderer) {
        const ok = await ipcRenderer.invoke('clear-browser-data');
        showStatus(ok
          ? 'All browser data and bookmarks cleared!'
          : 'Failed to clear browser data.');
      } else {
        showStatus('Clear data feature not available in this context.');
      }
    } catch (error) {
      console.error('Error clearing browser data:', error);
      showStatus('An error occurred while clearing data.');
    } finally {
      const currentTheme = window.browserCustomizer ? window.browserCustomizer.currentTheme : null;
      if (currentTheme && window.electronAPI && typeof window.electronAPI.sendToHost === 'function') {
        window.electronAPI.sendToHost('theme-update', currentTheme);
      }
    }
  };
}

// Try attaching immediately, and again on DOMContentLoaded
attachClearHandler(clearBtn);
window.addEventListener('DOMContentLoaded', () => {
  if (!clearBtn) {
    clearBtn = document.getElementById('clear-data-btn');
    attachClearHandler(clearBtn);
  }
});

// Tabs: simple controller
function activateTab(tabName) {
  console.log('[TABS] Activating tab:', tabName);
  const links = document.querySelectorAll('.tab-link');
  const panels = document.querySelectorAll('.tab-panel');
  console.log('[TABS] Found', links.length, 'tab links and', panels.length, 'panels');
  
  links.forEach(l => {
    const isActive = l.dataset.tab === tabName;
    l.classList.toggle('active', isActive);
    l.setAttribute('aria-selected', isActive ? 'true' : 'false');
    if (isActive) l.focus({ preventScroll: true });
  });
  panels.forEach(p => {
    const isActive = p.id === `panel-${tabName}`;
    p.classList.toggle('active', isActive);
    p.hidden = !isActive;
    console.log('[TABS] Panel', p.id, 'active:', isActive);
  });
  try { localStorage.setItem(TAB_STORAGE_KEY, tabName); } catch {}
}

function initTabs() {
  console.log('[TABS] Initializing tabs...');
  const links = document.querySelectorAll('.tab-link');
  console.log('[TABS] Found tab links:', links.length);
  
  // Direct listeners (for accessibility focus handling)
  links.forEach((link, index) => {
    console.log('[TABS] Setting up listener for tab', index, 'with data-tab:', link.dataset.tab);
    link.addEventListener('click', (e) => {
      console.log('[TABS] Tab clicked:', link.dataset.tab);
      e.preventDefault();
      e.stopPropagation();
      const name = link.dataset.tab;
      if (!name) return;
      if (location.hash !== `#${name}`) {
        history.replaceState(null, '', `#${name}`);
      }
      activateTab(name);
    });
  });
  
  // Delegation as a fallback if elements are re-rendered
  const tabContainer = document.querySelector('.tabs');
  if (tabContainer) {
    console.log('[TABS] Setting up delegation on tabs container');
    tabContainer.addEventListener('click', (e) => {
      console.log('[TABS] Container click detected');
      const btn = e.target && e.target.closest ? e.target.closest('.tab-link') : null;
      if (!btn || !tabContainer.contains(btn)) return;
      console.log('[TABS] Delegated click for tab:', btn.dataset.tab);
      const name = btn.dataset.tab;
      if (!name) return;
      if (location.hash !== `#${name}`) {
        history.replaceState(null, '', `#${name}`);
      }
      activateTab(name);
    });
  }

  // Resolve initial tab: hash > storage > default 'general'
  let initial = (location.hash || '').replace('#', '') || null;
  if (!initial) {
    try { initial = localStorage.getItem(TAB_STORAGE_KEY) || null; } catch {}
  }
  if (!initial) initial = 'general';
  console.log('[TABS] Initial tab:', initial);
  activateTab(initial);
}

// Initialize tabs after DOM is ready but before customization init uses the DOM
window.addEventListener('DOMContentLoaded', () => {
  console.log('[TABS] DOM loaded, initializing tabs...');
  initTabs();
  console.log('[TABS] Tabs initialized');
});
