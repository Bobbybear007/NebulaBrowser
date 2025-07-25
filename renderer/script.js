const ipcRenderer = window.electronAPI;

// 1) cache hot DOM references
const urlBox       = document.getElementById('url');
const tabBarEl     = document.getElementById('tab-bar');
const webviewsEl   = document.getElementById('webviews');
const menuPopup    = document.getElementById('menu-popup');
const contextMenu  = document.getElementById('context-menu');
const menuItems    = contextMenu ? contextMenu.querySelectorAll('li') : [];

// Select all text on focus and prevent mouseup from deselecting
urlBox.addEventListener('focus', () => urlBox.select());
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

function createTab(inputUrl) {
  inputUrl = inputUrl || 'browser://home';
  console.log('[DEBUG] createTab() inputUrl =', inputUrl);
  const id = crypto.randomUUID();
  const resolvedUrl = resolveInternalUrl(inputUrl);
  console.log('[DEBUG] createTab() resolvedUrl =', resolvedUrl);

  const webview = document.createElement('webview');

  webview.id = `tab-${id}`;
  webview.src = resolvedUrl;
  webview.setAttribute('allowpopups', '');
  webview.setAttribute('partition', 'persist:default');
  webview.classList.add('active');

  webview.addEventListener('did-fail-load', handleLoadFail(id));
  webview.addEventListener('page-title-updated', e => updateTabMetadata(id, 'title', e.title));
  webview.addEventListener('page-favicon-updated', e => {
    if (e.favicons.length > 0) updateTabMetadata(id, 'favicon', e.favicons[0]);
  });

  webview.addEventListener('did-navigate', e => handleNavigation(id, e.url)); // was using inputUrl
  webview.addEventListener('did-navigate-in-page', e => handleNavigation(id, e.url)); // was using inputUrl

  // catch any target="_blank" or window.open() calls and open them as new tabs
  webview.addEventListener('new-window', e => {
    e.preventDefault();
    createTab(e.url);
  });

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
  renderTabs();
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
    renderTabs();
  }
}

function navigate() {
  const input = urlBox.value.trim();
  const tab = tabs.find(t => t.id === activeTabId);
  const webview = document.getElementById(`tab-${activeTabId}`);
  if (!tab || !webview) return;

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

  // Push to history using the original input
  tab.history = tab.history.slice(0, tab.historyIndex + 1);
  tab.history.push(input);
  tab.historyIndex++;

  tab.url = input; 
  webview.src = resolved;

  renderTabs();
  updateNavButtons();
}

function handleNavigation(tabId, newUrl) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  // --- record every real navigation into history ---
  if (tab.history[tab.historyIndex] !== newUrl) {
    tab.history = tab.history.slice(0, tab.historyIndex + 1);
    tab.history.push(newUrl);
    tab.historyIndex++;
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

  renderTabs();
  updateNavButtons();
}


function setActiveTab(id) {
  tabs.forEach(t => {
    const w = document.getElementById(`tab-${t.id}`);
    if (w) w.classList.remove('active');
  });

  const activeWebview = document.getElementById(`tab-${id}`);
  if (activeWebview) activeWebview.classList.add('active');

  activeTabId = id;

  const tab = tabs.find(t => t.id === id);
  if (tab) {
    // If the tab URL represents the home page, keep the URL bar blank.
    urlBox.value = tab.url === 'browser://home' ? '' : tab.url;
    renderTabs();
    updateNavButtons();
    updateZoomUI();            // ← update zoom display for new active tab
  }
}

function closeTab(id) {
  const w = document.getElementById(`tab-${id}`);
  if (w) w.remove();

  tabs = tabs.filter(t => t.id !== id);

  if (id === activeTabId) {
    if (tabs.length > 0) setActiveTab(tabs[0].id);
  }

  renderTabs();
  updateNavButtons();
}

// 2) streamline renderTabs with a fragment
function renderTabs() {
  const frag = document.createDocumentFragment();
  tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');

    if (tab.favicon) {
      const icon = document.createElement('img');
      icon.src = tab.favicon;
      icon.style.width = '16px';
      icon.style.height = '16px';
      icon.style.marginRight = '6px';
      el.appendChild(icon);
    }

    el.appendChild(document.createTextNode(tab.title || new URL(tab.url).hostname));

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    };

    // 2a) make tab draggable
    el.draggable = true;
    el.addEventListener('dragstart', e => {
      e.dataTransfer.setData('tabId', tab.id);
    });

    // 2b) on dragend outside window, open in new window and close here
    el.addEventListener('dragend', e => {
      if (
        e.clientX < 0 || e.clientX > window.innerWidth ||
        e.clientY < 0 || e.clientY > window.innerHeight
      ) {
        ipcRenderer.invoke('open-tab-in-new-window', tab.url);
        closeTab(tab.id);
      }
    });

    el.onclick = () => setActiveTab(tab.id);
    el.appendChild(closeBtn);
    frag.appendChild(el);
  });
  // add the “+” at the end
  const plus = document.createElement('div');
  plus.className = 'tab'; plus.textContent = '+'; plus.onclick = () => createTab();
  frag.appendChild(plus);

  tabBarEl.innerHTML = '';           // clear once
  tabBarEl.appendChild(frag);        // append in one shot
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
  const backBtn    = document.querySelector('.nav-left button:nth-child(1)');
  const forwardBtn = document.querySelector('.nav-left button:nth-child(2)');

  backBtn.disabled    = !webview || !webview.canGoBack();
  forwardBtn.disabled = !webview || !webview.canGoForward();
}

function reload() {
  const webview = document.getElementById(`tab-${activeTabId}`);
  if (webview) {
    webview.reload();
    updateNavButtons();    // keep back/forward buttons in sync after a reload
  }
}


function openSettings() {
  urlBox.value = 'browser://settings';
  navigate();
}

// Toggle menu dropdown
const menuBtn = document.getElementById('menu-btn');

menuBtn.addEventListener('click', () => {
  menuPopup.classList.toggle('hidden');
  if (!menuPopup.classList.contains('hidden')) {
    updateZoomUI();          // ← refresh zoom % whenever menu opens
  }
});

window.addEventListener('DOMContentLoaded', () => {
  createTab();
  // only now bind the reload button (guaranteed to exist)
  const reloadBtn = document.getElementById('reload-btn');
  reloadBtn.addEventListener('click', reload);

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

  // menu‐related code (moved here so #context-menu exists)
  const items = menu ? menu.querySelectorAll('li') : [];

  function showContextMenu(x, y) {
    if (!menu) return;
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;
    menu.classList.add('visible');
  }

  document.addEventListener('contextmenu', e => {
    if (e.target.tagName === 'WEBVIEW' ||
        e.composedPath().some(el => el.id === 'webviews')) {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY);
    }
  });

  document.addEventListener('click', () => {
    if (menu) menu.classList.remove('visible');
  });

  items.forEach(item => {
    item.addEventListener('click', async () => {
      const action = item.dataset.action;
      const win = remote.getCurrentWindow();

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
          win.webContents.inspectAccessibilityNode(e.clientX, e.clientY);
          break;
        case 'inspect-element':
          win.webContents.inspectElement(e.clientX, e.clientY);
          break;
      }

      menu.classList.remove('visible');
    });
  });

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

const fs = require('fs');
const { remote } = require('electron');

// 4) unify context-menu wiring
function showContextMenu(x,y) {
  if (!contextMenu) return;
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
      win.webContents.inspectAccessibilityNode(e.clientX, e.clientY);
      break;
    case 'inspect-element':
      win.webContents.inspectElement(e.clientX, e.clientY);
      break;
  }

  contextMenu.classList.remove('visible');
}));
