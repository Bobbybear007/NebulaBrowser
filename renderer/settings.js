// Prefer contextBridge-exposed API
const ipc = (window.electronAPI && typeof window.electronAPI.invoke === 'function')
  ? window.electronAPI
  : null;

let clearBtn = document.getElementById('clear-data-btn');
const statusDiv = document.getElementById('status');
const statusText = document.getElementById('status-text');
const TAB_STORAGE_KEY = 'nebula-settings-active-tab';
const WEATHER_UNIT_KEY = 'nebula-weather-unit'; // 'auto' | 'c' | 'f'
const HOME_SEARCH_Y_KEY = 'nebula-home-search-y'; // number (vh)
const HOME_BOOKMARKS_Y_KEY = 'nebula-home-bookmarks-y'; // number (vh)
const HOME_GLANCE_CORNER_KEY = 'nebula-home-glance-corner'; // 'br'|'bl'|'tr'|'tl'

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
      statusText.textContent = 'Clearing cookies, storage, cache, and history...';
    }

    try {
      if (ipc) {
        const ok = await ipc.invoke('clear-browser-data');
        // Also clear localStorage site history in this context
        try { localStorage.removeItem('siteHistory'); } catch {}
        // Try to refresh lists if present
        try { if (typeof loadHistories === 'function') await loadHistories(); } catch {}
        showStatus(ok
          ? 'All browser data cleared.'
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

  // Wire per-section clear buttons to main when possible
  const clearSiteBtn = document.getElementById('clear-site-history-btn');
  if (clearSiteBtn) {
    clearSiteBtn.addEventListener('click', async () => {
      try {
        // Clear localStorage copy
        try { localStorage.removeItem('siteHistory'); } catch {}
        // Ask main to clear file-based history for consistency
        if (ipc) { await ipc.invoke('clear-site-history'); }
        showStatus('Site history cleared');
        try { if (typeof loadHistories === 'function') await loadHistories(); } catch {}
      } catch (e) {
        console.error('Clear site history error:', e);
        showStatus('Failed clearing site history');
      }
    });
  }
  const clearSearchBtn = document.getElementById('clear-search-history-btn');
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', async () => {
      try {
        if (ipc) { await ipc.invoke('clear-search-history'); }
        showStatus('Search history cleared');
      } catch (e) {
        console.error('Clear search history error:', e);
        showStatus('Failed clearing search history');
      }
    });
  }

  // Weather unit controls
  try {
    const stored = localStorage.getItem(WEATHER_UNIT_KEY) || 'auto';
    const radios = document.querySelectorAll('input[name="weather-unit"]');
    radios.forEach(r => r.checked = (r.value === stored));
    radios.forEach(radio => radio.addEventListener('change', () => {
      const val = document.querySelector('input[name="weather-unit"]:checked')?.value || 'auto';
      localStorage.setItem(WEATHER_UNIT_KEY, val);
      showStatus(`Weather units set to ${val === 'c' ? 'Celsius' : val === 'f' ? 'Fahrenheit' : 'Auto'}`);
      // Hint home page to refresh weather if it listens to storage events
      try { window.dispatchEvent(new StorageEvent('storage', { key: WEATHER_UNIT_KEY, newValue: val })); } catch {}
      if (window.electronAPI && typeof window.electronAPI.sendToHost === 'function') {
        window.electronAPI.sendToHost('settings-update', { weatherUnit: val });
      }
    }));
  } catch (e) { console.warn('Weather unit setup failed', e); }

  // Home layout controls
  try {
    const searchRange = document.getElementById('home-search-y');
    const searchVal = document.getElementById('home-search-y-val');
    const bmRange = document.getElementById('home-bookmarks-y');
    const bmVal = document.getElementById('home-bookmarks-y-val');
    const cornerRadios = document.querySelectorAll('input[name="home-glance-corner"]');

    const initNum = (key, def, input, label) => {
      const v = Number(localStorage.getItem(key) || def);
      if (input) input.value = String(v);
      if (label) label.textContent = v + 'vh';
      return v;
    };
    initNum(HOME_SEARCH_Y_KEY, 22, searchRange, searchVal);
    initNum(HOME_BOOKMARKS_Y_KEY, 40, bmRange, bmVal);
    const storedCorner = localStorage.getItem(HOME_GLANCE_CORNER_KEY) || 'br';
    cornerRadios.forEach(r => r.checked = (r.value === storedCorner));

    const notify = () => {
      if (window.electronAPI && typeof window.electronAPI.sendToHost === 'function') {
        window.electronAPI.sendToHost('settings-update', {
          searchY: Number(localStorage.getItem(HOME_SEARCH_Y_KEY) || 22),
          bookmarksY: Number(localStorage.getItem(HOME_BOOKMARKS_Y_KEY) || 40),
          glanceCorner: localStorage.getItem(HOME_GLANCE_CORNER_KEY) || 'br'
        });
      }
    };

    if (searchRange) searchRange.addEventListener('input', () => {
      const val = Number(searchRange.value);
      searchVal.textContent = val + 'vh';
      localStorage.setItem(HOME_SEARCH_Y_KEY, String(val));
      notify();
    });
    if (bmRange) bmRange.addEventListener('input', () => {
      const val = Number(bmRange.value);
      bmVal.textContent = val + 'vh';
      localStorage.setItem(HOME_BOOKMARKS_Y_KEY, String(val));
      notify();
    });
    cornerRadios.forEach(r => r.addEventListener('change', () => {
      const val = document.querySelector('input[name="home-glance-corner"]:checked')?.value || 'br';
      localStorage.setItem(HOME_GLANCE_CORNER_KEY, val);
      notify();
    }));
  } catch (e) { console.warn('Home layout control setup failed', e); }
});

// Tabs: simple controller
function activateTab(tabName) {
  const links = document.querySelectorAll('.tab-link');
  const panels = document.querySelectorAll('.tab-panel');
  
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
  // noop
  });
  try { localStorage.setItem(TAB_STORAGE_KEY, tabName); } catch {}
}

function initTabs() {
  const links = document.querySelectorAll('.tab-link');
  
  // Direct listeners (for accessibility focus handling)
  links.forEach((link, index) => {
    link.addEventListener('click', (e) => {
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
    tabContainer.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.tab-link') : null;
      if (!btn || !tabContainer.contains(btn)) return;
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
  activateTab(initial);
}

// Initialize tabs after DOM is ready but before customization init uses the DOM
window.addEventListener('DOMContentLoaded', () => {
  initTabs();
});

// About tab population
async function populateAbout() {
  try {
    const info = (window.aboutAPI && typeof window.aboutAPI.getInfo === 'function')
      ? await window.aboutAPI.getInfo()
      : null;
    if (!info || info.error) {
      console.warn('[ABOUT] Unable to load about info', info && info.error);
      return;
    }
    const byId = (id) => document.getElementById(id);
    byId('about-app-name').textContent = info.appName;
    byId('about-app-version').textContent = info.appVersion;
    byId('about-packaged').textContent = info.isPackaged ? 'Yes' : 'No';
    byId('about-userdata').textContent = info.userDataPath;

    byId('about-electron').textContent = info.electronVersion;
    byId('about-chrome').textContent = info.chromeVersion;
    byId('about-node').textContent = info.nodeVersion;
    byId('about-v8').textContent = info.v8Version;

    byId('about-os').textContent = `${info.osType} ${info.osRelease}`;
    byId('about-cpu').textContent = info.cpu;
    byId('about-arch').textContent = info.arch;
    byId('about-mem').textContent = `${info.totalMemGB} GB`;

    const copyBtn = document.getElementById('copy-about-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const payload = [
          `Nebula ${info.appVersion} (${info.isPackaged ? 'packaged' : 'dev'})`,
          `Electron ${info.electronVersion} | Chromium ${info.chromeVersion} | Node ${info.nodeVersion} | V8 ${info.v8Version}`,
          `${info.osType} ${info.osRelease} ${info.arch}`,
          `CPU: ${info.cpu}`,
          `RAM: ${info.totalMemGB} GB`,
          `UserData: ${info.userDataPath}`
        ].join('\n');
        try {
          await navigator.clipboard.writeText(payload);
          showStatus('Diagnostics copied');
        } catch (err) {
          console.error('Clipboard error:', err);
          showStatus('Failed to copy diagnostics');
        }
      });
    }
  } catch (err) {
    console.error('[ABOUT] Error populating about info:', err);
  }
}

// Populate about info after DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  populateAbout();
});

// Keep settings open when clicking GitHub by asking host to open externally/new tab
window.addEventListener('DOMContentLoaded', () => {
  const gh = document.getElementById('github-link');
  if (gh) {
    gh.addEventListener('click', (e) => {
      try {
        e.preventDefault();
        const url = gh.getAttribute('href');
        if (window.electronAPI && typeof window.electronAPI.sendToHost === 'function') {
          window.electronAPI.sendToHost('navigate', url, { newTab: true });
        } else if (window.parent) {
          window.parent.postMessage({ type: 'navigate', url, newTab: true }, '*');
        } else {
          window.open(url, '_blank', 'noopener');
        }
      } catch (err) {
        console.error('Failed to open GitHub link:', err);
        window.open(gh.getAttribute('href'), '_blank');
      }
    });
  }
  const help = document.getElementById('help-link');
  if (help) {
    help.addEventListener('click', (e) => {
      try {
        e.preventDefault();
        const url = help.getAttribute('href');
        if (window.electronAPI && typeof window.electronAPI.sendToHost === 'function') {
          window.electronAPI.sendToHost('navigate', url, { newTab: true });
        } else if (window.parent) {
          window.parent.postMessage({ type: 'navigate', url, newTab: true }, '*');
        } else {
          window.open(url, '_blank', 'noopener');
        }
      } catch (err) {
        console.error('Failed to open Help link:', err);
        window.open(help.getAttribute('href'), '_blank');
      }
    });
  }
});

// -----------------------------
// Plugins management (Settings)
// -----------------------------
async function loadPluginsUI() {
  const listEl = document.getElementById('plugins-list');
  const reloadAllBtn = document.getElementById('plugins-reload-all');
  if (!listEl) return;
  // Load list
  let items = [];
  try {
    items = (ipc ? await ipc.invoke('plugins-list') : []) || [];
  } catch (e) {
    console.warn('plugins-list failed', e);
  }
  listEl.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'plugin-item';
    empty.textContent = 'No plugins found';
    listEl.appendChild(empty);
  } else {
    for (const p of items) {
      const row = document.createElement('div');
      row.className = 'plugin-item';
      row.setAttribute('role', 'listitem');
      row.innerHTML = `
        <div class="plugin-meta">
          <div class="plugin-title">${escapeHtml(p.name)} <span style="opacity:.7;font-weight:400">v${escapeHtml(p.version)}</span></div>
          <div class="plugin-desc">${escapeHtml(p.description || '')}</div>
          <div class="plugin-desc" style="opacity:.6; font-size:.85em;">${escapeHtml(p.dir)}</div>
        </div>
        <div class="plugin-actions">
          <label style="display:flex; align-items:center; gap:6px;">
            <input type="checkbox" class="plugin-enable" ${p.enabled ? 'checked' : ''}>
            <span>${p.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
          <span class="spacer"></span>
          <button class="plugin-reload">Reload</button>
        </div>`;
      // Wire actions
      const enableInput = row.querySelector('input.plugin-enable');
      const labelSpan = row.querySelector('label span');
      enableInput.addEventListener('change', async () => {
        const enabled = enableInput.checked;
        try {
          if (ipc) await ipc.invoke('plugins-set-enabled', { id: p.id, enabled });
          labelSpan.textContent = enabled ? 'Enabled' : 'Disabled';
          showStatus(`${p.name}: ${enabled ? 'Enabled' : 'Disabled'}.`);
        } catch (e) {
          console.error('Failed to toggle plugin', p.id, e);
          enableInput.checked = !enabled;
          labelSpan.textContent = enableInput.checked ? 'Enabled' : 'Disabled';
          showStatus('Failed updating plugin');
        }
      });
      const reloadBtn = row.querySelector('button.plugin-reload');
      reloadBtn.addEventListener('click', async () => {
        try {
          if (ipc) await ipc.invoke('plugins-reload', { id: p.id });
          showStatus(`${p.name} reloaded.`);
        } catch (e) {
          console.error('Plugin reload failed', e);
          showStatus('Reload failed');
        }
      });
      listEl.appendChild(row);
    }
  }
  if (reloadAllBtn) reloadAllBtn.onclick = async () => {
    try { if (ipc) await ipc.invoke('plugins-reload', {}); showStatus('Plugins reloaded.'); } catch { showStatus('Reload failed'); }
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}

// Load when settings page shows Plugins tab for the first time
window.addEventListener('DOMContentLoaded', () => {
  const tabBtn = document.getElementById('tab-plugins');
  if (!tabBtn) return;
  let loaded = false;
  const ensureLoad = () => { if (!loaded) { loaded = true; loadPluginsUI(); } };
  tabBtn.addEventListener('click', ensureLoad);
  if (location.hash === '#plugins') ensureLoad();
});
