const ipcRenderer = window.electronAPI;
// Lightweight debug logger (toggleable)
const DEBUG = false;
const debug = (...args) => { if (DEBUG) console.log(...args); };

// Site history management using localStorage
function getSiteHistory() {
  try {
    const history = localStorage.getItem('siteHistory');
    return history ? JSON.parse(history) : [];
  } catch (err) {
    console.error('Error reading site history from localStorage:', err);
    return [];
  }
}

function addToSiteHistory(url) {
  try {
    let history = getSiteHistory();
    // Remove if already exists to avoid duplicates
    history = history.filter(item => item !== url);
    // Add to beginning
    history.unshift(url);
    // Keep only last 100 entries
    if (history.length > 100) {
      history = history.slice(0, 100);
    }
    localStorage.setItem('siteHistory', JSON.stringify(history));
  } catch (err) {
    console.error('Error saving site history to localStorage:', err);
  }
}

// 1) cache hot DOM references
const urlBox       = document.getElementById('url');
const tabBarEl     = document.getElementById('tab-bar');
const webviewsEl   = document.getElementById('webviews');
const menuPopup    = document.getElementById('menu-popup');
const contextMenu  = document.getElementById('context-menu');
const menuItems    = contextMenu ? contextMenu.querySelectorAll('li') : [];
let lastContextPos = { x: 0, y: 0 };

// Select all text on focus and prevent mouseup from deselecting
urlBox.addEventListener('focus', () => {
  urlBox.select();
});
urlBox.addEventListener('mouseup', e => e.preventDefault());
// Add Enter key navigation
urlBox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    navigate();
  }
});

let tabs = [];
let activeTabId = null;
const allowedInternalPages = ['settings', 'home'];
let bookmarks = [];

// Efficient render scheduling to avoid redundant DOM work
let tabsRenderPending = false;
// Track previous order and positions for FLIP animations
let lastTabOrder = [];
let closingTabs = new Set();
function scheduleRenderTabs() {
  if (tabsRenderPending) return;
  tabsRenderPending = true;
  requestAnimationFrame(() => {
    tabsRenderPending = false;
    renderTabs();
  });
}

// Debounce nav button updates to reduce layout work
let navButtonsPending = false;
let backBtnCached = null;
let fwdBtnCached = null;
function scheduleUpdateNavButtons() {
  if (navButtonsPending) return;
  navButtonsPending = true;
  requestAnimationFrame(() => {
    navButtonsPending = false;
    try { updateNavButtons(); } catch {}
  });
}

// Derive a stable, safe label for a tab without throwing on non-URLs
function getTabLabel(tab) {
  if (tab.title && tab.title !== 'New Tab') return tab.title;
  const u = tab.url || '';
  try {
    if (u.startsWith('http')) return new URL(u).hostname;
    if (u.startsWith('browser://')) return u.replace('browser://', '');
    return u || 'New Tab';
  } catch {
    return u || 'New Tab';
  }
}

// Load bookmarks on startup
async function loadBookmarks() {
  try {
    bookmarks = await ipcRenderer.invoke('load-bookmarks');
  } catch (error) {
    console.error('Error loading bookmarks in main context:', error);
    bookmarks = [];
  }
}

// Function to save bookmarks
async function saveBookmarks(newBookmarks) {
  try {
    bookmarks = newBookmarks;
    await ipcRenderer.invoke('save-bookmarks', bookmarks);
  } catch (error) {
    console.error('Error saving bookmarks in main context:', error);
  }
}

// Load bookmarks when the script starts
loadBookmarks();
// Initial home tab will be created on DOMContentLoaded

// Remove iframe-based navigation listener (using webview IPC now)

// Listen for site history updates from main process
ipcRenderer.on('record-site-history', (event, url) => {
  debug('[DEBUG] Received site history update:', url);
  addToSiteHistory(url);
});

function createTab(inputUrl) {
  inputUrl = inputUrl || 'browser://home';
  debug('[DEBUG] createTab() inputUrl =', inputUrl);
  const id = crypto.randomUUID();
  
  // Handle home page specially
  if (inputUrl === 'browser://home') {
    // Show home container and hide webviews
    const homeContainer = document.getElementById('home-container');
    const webviewsEl = document.getElementById('webviews');
    if (homeContainer) homeContainer.classList.add('active');
    if (webviewsEl) webviewsEl.classList.add('hidden');
    const tab = {
        id,
        url: inputUrl,
        title: 'New Tab',
        favicon: '',
        history: [inputUrl],
        historyIndex: 0,
        isHome: true
    };
    tabs.push(tab);
  setActiveTab(id);
  // Render the tab bar so the new home tab appears
  scheduleRenderTabs();
    return id;
  }
  
  // For all other URLs, use webview
  const resolvedUrl = resolveInternalUrl(inputUrl);
  debug('[DEBUG] createTab() resolvedUrl =', resolvedUrl);

  const webview = document.createElement('webview');
  // give the webview an id and set its source and attributes so it actually loads and can be managed
  webview.id = `tab-${id}`;
  webview.src = resolvedUrl;
  webview.setAttribute('allowpopups', '');
  webview.setAttribute('partition', 'persist:main');
  webview.setAttribute('preload', '../preload.js');
  // Add attributes needed for Google OAuth and sign-in flows
  webview.setAttribute('webpreferences', 'allowRunningInsecureContent=false,javascript=true,webSecurity=true');
  webview.setAttribute('useragent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Nebula/1.0.0');

  webview.addEventListener('page-favicon-updated', e => {
    if (e.favicons.length > 0) updateTabMetadata(id, 'favicon', e.favicons[0]);
  });

  // Send bookmarks to home page when it loads
  webview.addEventListener('dom-ready', () => {
    if (inputUrl === 'browser://home') {
      webview.executeJavaScript(`
        if (window.receiveBookmarks) {
          window.receiveBookmarks(${JSON.stringify(bookmarks)});
        } else {
          // Store bookmarks for when the page script loads
          window._pendingBookmarks = ${JSON.stringify(bookmarks)};
        }
      `);
    }
  });

  // Consolidated navigation recording - only use did-navigate to avoid duplicates
  webview.addEventListener('did-navigate', e => {
    handleNavigation(id, e.url);
    if (e.url.startsWith('http')) debug('[DEBUG] Recording navigation to:', e.url);
  });
  
  webview.addEventListener('did-navigate-in-page', e => {
    handleNavigation(id, e.url);
    if (e.url.startsWith('http')) debug('[DEBUG] Recording in-page navigation to:', e.url);
  });

  // After load, just refresh nav buttons to avoid jank
  webview.addEventListener('did-finish-load', () => {
    scheduleUpdateNavButtons();
  });

  // catch any target="_blank" or window.open() calls and open them as new tabs
  webview.addEventListener('new-window', e => {
    e.preventDefault();
    createTab(e.url);
  });

  // After creating dynamic webview:
  webview.addEventListener('ipc-message', e => {
    if (e.channel === 'navigate' && e.args[0]) {
      const targetUrl = e.args[0];
      const opts = e.args[1] || {};
      if (opts.newTab) {
        createTab(targetUrl);
      } else {
        urlBox.value = targetUrl;
        navigate();
      }
    } else if (e.channel === 'theme-update') {
      const home = document.getElementById('home-webview');
      if (home) home.send('theme-update', ...e.args);
    }
  });

  // Ensure interacting with the webview closes any open menu popup
  attachCloseMenuOnInteract(webview);

  webviewsEl.appendChild(webview);

  tabs.push({
    id,
    url: inputUrl, // ← save the original input like "browser://home"
    title: 'New Tab',
    favicon: null,
    history: [inputUrl],
    historyIndex: 0
  });

  setActiveTab(id);
  scheduleRenderTabs();
}



function resolveInternalUrl(url) {
  if (url.startsWith('browser://')) {
    const page = url.replace('browser://', '');
    if (allowedInternalPages.includes(page)) return `${page}.html`;
    else return '404.html';
  }
  return url.startsWith('http') ? url : `https://${url}`;
}


function handleLoadFail(tabId) {
  return (event) => {
    if (!event.validatedURL.includes('browser://') && event.errorCode !== -3) {
      const webview = document.getElementById(`tab-${tabId}`);
      webview.src = `404.html?url=${encodeURIComponent(tabs.find(t => t.id === tabId).url)}`;
    }
  };
}

function updateTabMetadata(id, key, value) {
  const tab = tabs.find(t => t.id === id);
  if (tab) {
    tab[key] = value;
  scheduleRenderTabs();
  }
}

function navigate() {
  const input = urlBox.value.trim();
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;

  // decide if this is a search query or a URL/internal page
  const hasProtocol = /^https?:\/\//i.test(input);
  const isInternal = input.startsWith('browser://');
  const isLikelyUrl = hasProtocol || input.includes('.');
  let resolved;
  if (!isInternal && !isLikelyUrl) {
    resolved = `https://www.google.com/search?q=${encodeURIComponent(input)}`;
  } else {
    resolved = resolveInternalUrl(input);
  }

  // If current tab is a home tab and we're navigating to a website, 
  // we need to convert it to a webview tab or create a new one
  if (tab.isHome && !input.startsWith('browser://')) {
    // Convert home tab to webview tab
    convertHomeTabToWebview(tab.id, input, resolved);
    return;
  }

  // For regular webview tabs, just navigate
  const webview = document.getElementById(`tab-${activeTabId}`);
  if (!webview) return;

  // Push to history using the original input
  tab.history = tab.history.slice(0, tab.historyIndex + 1);
  tab.history.push(input);
  tab.historyIndex++;

  tab.url = input; 
  webview.src = resolved;

  scheduleRenderTabs();
  scheduleUpdateNavButtons();
}

function convertHomeTabToWebview(tabId, inputUrl, resolvedUrl) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  // Ensure webviews container is visible
  const webviewsEl = document.getElementById('webviews');
  if (webviewsEl) webviewsEl.classList.remove('hidden');
  // Create a new webview for this tab
  const webview = document.createElement('webview');
  webview.id = `tab-${tabId}`;
  webview.src = resolvedUrl;
  webview.setAttribute('allowpopups', '');
  webview.setAttribute('partition', 'persist:main');
  webview.setAttribute('preload', '../preload.js');
  // Add attributes needed for Google OAuth and sign-in flows
  webview.setAttribute('webpreferences', 'allowRunningInsecureContent=false,javascript=true,webSecurity=true');
  webview.setAttribute('useragent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Nebula/1.0.0');

  // Add event listeners
  webview.addEventListener('did-fail-load', handleLoadFail(tabId));
  webview.addEventListener('page-title-updated', e => updateTabMetadata(tabId, 'title', e.title));
  webview.addEventListener('page-favicon-updated', e => {
    if (e.favicons.length > 0) updateTabMetadata(tabId, 'favicon', e.favicons[0]);
  });

  webview.addEventListener('did-navigate', e => {
    handleNavigation(tabId, e.url);
  });
  webview.addEventListener('did-navigate-in-page', e => {
    handleNavigation(tabId, e.url);
  });
  webview.addEventListener('did-finish-load', () => {
    scheduleUpdateNavButtons();
  });

  webview.addEventListener('new-window', e => {
    createTab(e.url);
  });

  // After creating dynamic webview:
  webview.addEventListener('ipc-message', e => {
    if (e.channel === 'theme-update') {
      const home = document.getElementById('home-webview');
      if (home) home.send('theme-update', ...e.args);
    }
  });

  // Add webview to DOM
  webviewsEl.appendChild(webview);

  // Ensure interacting with the webview closes any open menu popup
  attachCloseMenuOnInteract(webview);

  // Update tab properties
  tab.isHome = false;
  tab.webview = webview;
  tab.url = inputUrl;
  tab.history = [inputUrl];
  tab.historyIndex = 0;

  // Hide home container and show webview
  const homeContainer = document.getElementById('home-container');
  if (homeContainer) homeContainer.classList.remove('active');
  webview.classList.add('active');

  scheduleUpdateNavButtons();
  // Activate converted webview tab and update UI
  setActiveTab(tabId);
  scheduleRenderTabs();
}

function handleNavigation(tabId, newUrl) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  debug('[DEBUG] handleNavigation called with:', newUrl);

  // --- record every real navigation into history ---
  if (tab.history[tab.historyIndex] !== newUrl) {
    tab.history = tab.history.slice(0, tab.historyIndex + 1);
    tab.history.push(newUrl);
    tab.historyIndex++;
  }

  // Record site history in localStorage (skip internal pages and file:// URLs)
  if (!newUrl.endsWith('home.html') && 
      !newUrl.endsWith('settings.html') && 
      !newUrl.startsWith('file://') && 
      !newUrl.includes('browser://') &&
      newUrl.startsWith('http')) {
  debug('[DEBUG] Adding to site history:', newUrl);
    addToSiteHistory(newUrl);
    // Also send to main process for file storage
    ipcRenderer.invoke('save-site-history-entry', newUrl);
  }

  // translate local files back to our browser:// scheme
  const isHome     = newUrl.endsWith('home.html');
  const isSettings = newUrl.endsWith('settings.html');
  const displayUrl = isHome
    ? 'browser://home'
    : isSettings
      ? 'browser://settings'
      : newUrl;

  tab.url = displayUrl;

  if (tabId === activeTabId) {
    urlBox.value = displayUrl === 'browser://home' ? '' : displayUrl;
  }

  scheduleRenderTabs();
  scheduleUpdateNavButtons();
}


function setActiveTab(id) {
  // hide all individual webviews
  tabs.forEach(t => {
    const w = document.getElementById(`tab-${t.id}`);
    if (w) w.classList.remove('active');
  });
  // toggle containers
  const homeContainer = document.getElementById('home-container');
  const webviewsEl = document.getElementById('webviews');

  const tab = tabs.find(t => t.id === id);
  if (tab) {
    if (tab.isHome) {
      homeContainer.classList.add('active');
      webviewsEl.classList.add('hidden');
    } else {
      if (homeContainer) homeContainer.classList.remove('active');
      webviewsEl.classList.remove('hidden');
      const activeWebview = document.getElementById(`tab-${id}`);
      if (activeWebview) activeWebview.classList.add('active');
    }
  }

  activeTabId = id;

  if (tab) {
    // If the tab URL represents the home page, keep the URL bar blank.
    urlBox.value = tab.url === 'browser://home' ? '' : tab.url;
  scheduleRenderTabs();
    updateNavButtons();
    updateZoomUI();            // ← update zoom display for new active tab
  }
}

function closeTab(id) {
  // Play closing animation on tab button, then remove
  const btn = tabBarEl.querySelector(`[data-tab-id="${id}"]`);
  if (btn && !closingTabs.has(id)) {
    closingTabs.add(id);
    btn.classList.add('tab--closing');
    // Pre-calc which tab should become active if we're closing the active tab
    const idx = tabs.findIndex(t => t.id === id);
    const nextActiveId = (id === activeTabId)
      ? (tabs[idx - 1]?.id ?? tabs[idx + 1]?.id ?? tabs[0]?.id)
      : activeTabId;
    btn.addEventListener('animationend', () => {
      // Remove webview
      const w = document.getElementById(`tab-${id}`);
      if (w) w.remove();
      // Remove from model
      tabs = tabs.filter(t => t.id !== id);
      // Choose a new active tab if needed
      if (tabs.length > 0 && nextActiveId) setActiveTab(nextActiveId);
      closingTabs.delete(id);
      scheduleRenderTabs();
      updateNavButtons();
    }, { once: true });
    return;
  }
  // Fallback (no button rendered yet)
  const w = document.getElementById(`tab-${id}`);
  if (w) w.remove();
  tabs = tabs.filter(t => t.id !== id);
  if (id === activeTabId && tabs.length > 0) setActiveTab(tabs[0].id);
  scheduleRenderTabs();
  updateNavButtons();
}

// 2) streamline renderTabs with a fragment
function renderTabs() {
  // Measure initial positions (First) for existing elements
  const firstRects = new Map();
  const existing = Array.from(tabBarEl.querySelectorAll('.tab'));
  existing.forEach(el => {
    firstRects.set(el.dataset.tabId, el.getBoundingClientRect());
  });

  const frag = document.createDocumentFragment();
  if (tabBarEl && tabBarEl.getAttribute('role') !== 'tablist') {
    tabBarEl.setAttribute('role', 'tablist');
  }

  // Create tab elements
  const currentOrder = [];
  tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
    el.classList.add('tab--flip');
    el.setAttribute('role', 'tab');
    el.setAttribute('aria-selected', String(tab.id === activeTabId));
    el.setAttribute('tabindex', tab.id === activeTabId ? '0' : '-1');
    el.dataset.tabId = tab.id;
    currentOrder.push(tab.id);

    if (!lastTabOrder.includes(tab.id)) {
      // New tab enters with animation
      el.classList.add('tab--enter');
    }

    if (tab.favicon) {
      const icon = document.createElement('img');
      icon.src = tab.favicon;
      icon.className = 'tab-favicon';
      el.appendChild(icon);
    }

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = getTabLabel(tab);
    el.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.title = 'Close tab';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });
    el.appendChild(closeBtn);

    el.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(tab.id);
      }
    });

    el.draggable = true;
    el.addEventListener('dragstart', e => {
      e.dataTransfer.setData('tabId', tab.id);
      e.dataTransfer.setData('text/plain', tab.id);
    });
    el.addEventListener('dragover', e => { e.preventDefault(); });
    el.addEventListener('drop', e => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData('tabId') || e.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === tab.id) return;
      const fromIndex = tabs.findIndex(t => t.id === draggedId);
      const toIndex = tabs.findIndex(t => t.id === tab.id);
      if (fromIndex === -1 || toIndex === -1) return;
      const rect = el.getBoundingClientRect();
      const after = (e.clientX - rect.left) > rect.width / 2;
      const newIndex = toIndex + (after ? 1 : 0);
      const [moved] = tabs.splice(fromIndex, 1);
      const adjIndex = fromIndex < newIndex ? newIndex - 1 : newIndex;
      tabs.splice(adjIndex, 0, moved);
      scheduleRenderTabs();
    });
    el.addEventListener('dragend', e => {
      if (
        e.clientX < 0 || e.clientX > window.innerWidth ||
        e.clientY < 0 || e.clientY > window.innerHeight
      ) {
        ipcRenderer.invoke('open-tab-in-new-window', tab.url);
        closeTab(tab.id);
      }
    });

    el.addEventListener('click', () => setActiveTab(tab.id));
    frag.appendChild(el);
  });

  // New tab button
  const plus = document.createElement('button');
  plus.className = 'new-tab-button';
  plus.title = 'New tab';
  plus.setAttribute('aria-label', 'New tab');
  plus.textContent = '+';
  plus.addEventListener('click', () => createTab());
  frag.appendChild(plus);

  // Swap DOM: to support FLIP, we need to keep the old nodes around until we can measure Last
  tabBarEl.innerHTML = '';
  tabBarEl.appendChild(frag);

  // Measure final positions (Last)
  const lastRects = new Map();
  Array.from(tabBarEl.querySelectorAll('.tab')).forEach(el => {
    lastRects.set(el.dataset.tabId, el.getBoundingClientRect());
  });

  // Apply FLIP: invert then play
  Array.from(tabBarEl.querySelectorAll('.tab')).forEach(el => {
    const id = el.dataset.tabId;
    const first = firstRects.get(id);
    const last = lastRects.get(id);
    if (!first || !last) return;
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (dx || dy) {
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.getBoundingClientRect(); // force reflow
      el.style.transform = '';
    }
  });

  // Update order for next render
  lastTabOrder = currentOrder.slice();
}

// 1) handle URL sent by main for a detached window
ipcRenderer.on('open-url', (event, url) => {
  tabs = [];
  activeTabId = null;
  webviewsEl.innerHTML = '';
  tabBarEl.innerHTML = '';
  createTab(url);
});

function goBack() {
  const webview = document.getElementById(`tab-${activeTabId}`);
  if (webview && webview.canGoBack()) {
    webview.goBack();
  }
}

function goForward() {
  const webview = document.getElementById(`tab-${activeTabId}`);
  if (webview && webview.canGoForward()) {
    webview.goForward();
  }
}

function updateNavButtons() {
  const webview = document.getElementById(`tab-${activeTabId}`);
  if (!backBtnCached || !fwdBtnCached) {
    backBtnCached = document.querySelector('.nav-left button:nth-child(1)');
    fwdBtnCached  = document.querySelector('.nav-left button:nth-child(2)');
  }
  if (backBtnCached) backBtnCached.disabled = !webview || !webview.canGoBack();
  if (fwdBtnCached)  fwdBtnCached.disabled  = !webview || !webview.canGoForward();
}

function reload() {
  const webview = document.getElementById(`tab-${activeTabId}`);
  if (webview) {
    webview.reload();
  scheduleUpdateNavButtons();    // keep back/forward buttons in sync after a reload
  }
}

function hardReload() {
  const webview = document.getElementById(`tab-${activeTabId}`);
  if (webview && typeof webview.reloadIgnoringCache === 'function') {
    webview.reloadIgnoringCache();
    scheduleUpdateNavButtons();
  } else if (webview) {
    // Fallback
    webview.reload();
  }
}

function freshReload() {
  const webview = document.getElementById(`tab-${activeTabId}`);
  if (!webview) return;
  try {
    const u = new URL(webview.getURL());
    u.searchParams.set('_bust', Date.now().toString());
    webview.src = u.toString();
  } catch {
    // If URL parsing fails (e.g., internal pages), fall back to hard reload
    hardReload();
  }
}

// Function to open the Settings page
function openSettings() {
  createTab('browser://settings');
}

// Toggle menu dropdown
const menuBtn = document.getElementById('menu-btn');
const menuWrapper = document.querySelector('.menu-wrapper');

// Open/close on button click; stop propagation so outside-click handler doesn't immediately close it
menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  menuPopup.classList.toggle('hidden');
  if (!menuPopup.classList.contains('hidden')) {
    updateZoomUI();          // ← refresh zoom % whenever menu opens
  }
});

// Prevent clicks inside the popup from bubbling to the document
if (menuPopup) {
  menuPopup.addEventListener('click', (e) => e.stopPropagation());
}

// Close when clicking anywhere outside the menu wrapper
document.addEventListener('click', (e) => {
  if (!menuPopup || menuPopup.classList.contains('hidden')) return;
  if (menuWrapper && !menuWrapper.contains(e.target)) {
    menuPopup.classList.add('hidden');
  }
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menuPopup && !menuPopup.classList.contains('hidden')) {
    menuPopup.classList.add('hidden');
  }
});

// Also close when interacting with main content areas (covers webview clicks)
const homeContainerEl = document.getElementById('home-container');
if (webviewsEl) {
  webviewsEl.addEventListener('pointerdown', () => {
    if (!menuPopup.classList.contains('hidden')) menuPopup.classList.add('hidden');
  });
}
if (homeContainerEl) {
  homeContainerEl.addEventListener('pointerdown', () => {
    if (!menuPopup.classList.contains('hidden')) menuPopup.classList.add('hidden');
  });
}

window.addEventListener('DOMContentLoaded', () => {
  // Initial boot
  createTab();
  // Handle IPC messages from the static home webview (bookmarks navigation)
  const staticHome = document.getElementById('home-webview');
  if (staticHome) {
  // Close menu when interacting with the home webview
  attachCloseMenuOnInteract(staticHome);
    staticHome.addEventListener('ipc-message', (e) => {
      if (e.channel === 'navigate' && e.args[0]) {
        urlBox.value = e.args[0];
        navigate();
      }
    });
  }
  // Listen for IPC messages from other webviews (e.g., settings)
  webviewsEl.addEventListener('ipc-message', (e) => {
    // Navigation messages from home or other pages
    if (e.channel === 'navigate' && e.args[0]) {
      const targetUrl = e.args[0];
      const opts = e.args[1] || {};
      if (opts.newTab) {
        // Open in a new tab, leaving settings/home intact
        createTab(targetUrl);
      } else {
        urlBox.value = targetUrl;
        navigate();
      }
    }
    // Theme update from settings webview
    if (e.channel === 'theme-update' && e.args[0]) {
      const homeWebview = document.getElementById('home-webview');
      if (homeWebview) {
        homeWebview.send('theme-update', e.args[0]);
      }
    }
  });
  // Fallback: listen for postMessage navigations from embedded pages (home/settings)
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'navigate' && event.data.url) {
      if (event.data.newTab) {
        createTab(event.data.url);
      } else {
        urlBox.value = event.data.url;
        navigate();
      }
    }
  });
  // only now bind the reload button (guaranteed to exist)
  const reloadBtn = document.getElementById('reload-btn');
  reloadBtn.addEventListener('click', reload);
  const hardReloadBtn = document.getElementById('hard-reload-btn');
  if (hardReloadBtn) hardReloadBtn.addEventListener('click', hardReload);
  const freshReloadBtn = document.getElementById('fresh-reload-btn');
  if (freshReloadBtn) freshReloadBtn.addEventListener('click', freshReload);

  // bind zoom buttons (single binding)
  const zoomInBtn = document.getElementById('zoom-in-btn');
  const zoomOutBtn = document.getElementById('zoom-out-btn');
  zoomInBtn.addEventListener('click', zoomIn);
  zoomOutBtn.addEventListener('click', zoomOut);

  // wire up back/forward buttons
  const backBtn = document.querySelector('.nav-left button:nth-child(1)');
  const forwardBtn = document.querySelector('.nav-left button:nth-child(2)');
  backBtn.addEventListener('click', goBack);
  forwardBtn.addEventListener('click', goForward);
  // cache for faster updates
  backBtnCached = backBtn;
  fwdBtnCached = forwardBtn;

  // settings button
  const settingsBtn = document.getElementById('open-settings-btn');
  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);

  // window control bindings
  const minBtn   = document.getElementById('min-btn');
  const maxBtn   = document.getElementById('max-btn');
  const closeBtn = document.getElementById('close-btn');
  if (minBtn && maxBtn && closeBtn) {
    if (process.platform !== 'darwin') {
      minBtn.addEventListener('click', () => ipcRenderer.invoke('window-minimize'));
      maxBtn.addEventListener('click', () => ipcRenderer.invoke('window-maximize'));
      closeBtn.addEventListener('click', () => ipcRenderer.invoke('window-close'));
    } else {
      document.getElementById('window-controls').style.display = 'none';
    }
  }

  // update initial zoom display
  ipcRenderer.invoke('get-zoom-factor').then(z => {
    document.getElementById('zoom-percent').textContent = `${Math.round(z * 100)}%`;
  });

  // (Removed broken duplicate context menu wiring)

  // Migrate existing site history from JSON file to localStorage (one-time migration)
  const migrateSiteHistory = async () => {
    try {
      // Check if we already have data in localStorage
      const existingHistory = getSiteHistory();
      if (existingHistory.length === 0) {
        // Try to load from the old JSON file system
        console.log('Attempting to migrate site history from JSON file...');
        // Since we can't access the file directly, we'll just start fresh
        // The site-history.json file was the old method, localStorage is the new method
      }
    } catch (err) {
      console.log('Site history migration skipped:', err.message);
    }
  };
  migrateSiteHistory();

  // ipcRenderer.invoke('load-bookmarks').then(bs => {
  //   bookmarks = bs;
  //   console.log('[DEBUG] Loaded bookmarks:', bookmarks);
  // });
});

// zoom helpers
function updateZoomUI() {
  const zp = document.getElementById('zoom-percent');
  if (zp) {
    ipcRenderer.invoke('get-zoom-factor').then(zf => {
      // just show "NN%", not "Zoom: NN%"
      zp.textContent = `${Math.round(zf * 100)}%`;
    });
  }
}

function zoomIn()  { ipcRenderer.invoke('zoom-in').then(updateZoomUI); }
function zoomOut() { ipcRenderer.invoke('zoom-out').then(updateZoomUI); }

// Utility: close the menu when interacting with a given element (e.g., webview)
function attachCloseMenuOnInteract(el) {
  if (!el) return;
  const closeIfOpen = () => {
    if (menuPopup && !menuPopup.classList.contains('hidden')) {
      menuPopup.classList.add('hidden');
    }
  };
  el.addEventListener('mousedown', closeIfOpen);
  el.addEventListener('pointerdown', closeIfOpen);
  el.addEventListener('focus', closeIfOpen, true);
}

// Attempt to load Node modules if available for context-menu actions
let fs, remote;
try {
  fs = require('fs');
  remote = require('electron').remote;
} catch (err) {
  console.warn('fs or remote modules unavailable in renderer:', err);
}

// 4) unify context-menu wiring
function showContextMenu(x,y) {
  if (!contextMenu) return;
  lastContextPos = { x, y };
  contextMenu.style.top = `${y}px`;
  contextMenu.style.left = `${x}px`;
  contextMenu.classList.add('visible');
}
document.addEventListener('contextmenu', e => {
  if (e.target.tagName==='WEBVIEW' || e.composedPath().some(el=>el.id==='webviews')) {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY);
  }
});
document.addEventListener('click', ()=> contextMenu && contextMenu.classList.remove('visible'));
if (remote && fs) {
  menuItems.forEach(item => item.addEventListener('click', async evt => {
    const action = item.dataset.action;
    const win    = remote.getCurrentWindow();

    switch (action) {
      case 'save-page': {
        const { canceled, filePath } = await remote.dialog.showSaveDialog(win, { defaultPath: 'page.html' });
        if (!canceled && filePath) win.webContents.savePage(filePath, 'HTMLComplete');
        break;
      }
      case 'select-all':
        document.execCommand('selectAll');
        break;
      case 'screenshot': {
        const image = await win.webContents.capturePage();
        const { canceled, filePath } = await remote.dialog.showSaveDialog(win, { defaultPath: 'screenshot.png' });
        if (!canceled && filePath) fs.writeFileSync(filePath, image.toPNG());
        break;
      }
      case 'view-source': {
        const html = document.documentElement.outerHTML;
        const { canceled, filePath } = await remote.dialog.showSaveDialog(win, { defaultPath: 'source.html' });
        if (!canceled && filePath) fs.writeFileSync(filePath, html);
        break;
      }
      case 'inspect-accessibility':
        win.webContents.inspectAccessibilityNode(lastContextPos.x, lastContextPos.y);
        break;
      case 'inspect-element':
        win.webContents.inspectElement(lastContextPos.x, lastContextPos.y);
        break;
    }

    contextMenu.classList.remove('visible');
  }));
}
