import { icons as initialIcons, fetchAllIcons } from './icons.js';
import { iconSets } from './iconSets.js';

const bookmarkList      = document.getElementById('bookmarkList');
const titleInput        = document.getElementById('titleInput');
const urlInput          = document.getElementById('urlInput');
const saveBookmarkBtn   = document.getElementById('saveBookmarkBtn');
const cancelBtn         = document.getElementById('cancelBtn');
const addPopup          = document.getElementById('addPopup');
const searchBtn         = document.getElementById('searchBtn');
const searchInput       = document.getElementById('searchInput');
const searchEngineBtn   = document.getElementById('searchEngineBtn');
const searchEngineDropdown = document.getElementById('searchEngineDropdown');
const searchEngineLogo  = document.getElementById('searchEngineLogo');
const iconFilter       = document.getElementById('iconFilter');
const iconGrid         = document.getElementById('iconGrid');
const selectedIconInput= document.getElementById('selectedIcon');
const iconCategoryNav  = document.getElementById('iconCategoryNav');
const useFaviconCheckbox = document.getElementById('useFavicon');
let selectedIcon       = initialIcons[0];
let availableIcons     = initialIcons;
let currentIconSetKey  = 'material';
const loadedSetsCache  = new Map(); // key -> array
let unifiedCatalog     = []; // aggregated icons with categories
// Semantic icon categories (ordered) with predicate tests
const iconCategories = [
  { id: 'services', label: 'Services', test: (n, set) => set === 'simple' || /(github|gitlab|google|twitter|facebook|discord|slack|whatsapp|youtube|spotify|apple|microsoft|aws|azure|gcp|cloudflare|figma|notion|paypal|stripe|reddit|steam|xbox|playstation|nintendo|openai|vercel|netlify|docker|kubernetes)/.test(n), icon: 'cloud' },
  { id: 'settings', label: 'Settings', test: n => /(setting|settings|cog|gear|tools?|wrench|sliders?|command|preferences?)/.test(n), icon: 'settings' },
  { id: 'files', label: 'Files & Data', test: n => /(file|folder|archive|book|bookmark|save|upload|download|cloud|database|server)/.test(n), icon: 'folder' },
  { id: 'media', label: 'Media', test: n => /(camera|video|film|image|photo|music|play|pause|mic|microphone|volume|speaker)/.test(n), icon: 'video_camera_front' },
  { id: 'social', label: 'Social & Communication', test: n => /(chat|message|mail|envelope|phone|comment|share|rss)/.test(n), icon: 'chat' },
  { id: 'nav', label: 'Navigation', test: n => /(map|compass|globe|route|pin|location|world|earth)/.test(n), icon: 'explore' },
  { id: 'security', label: 'Security', test: n => /(lock|shield|key|alert|warning|info|question|bug)/.test(n), icon: 'security' },
  { id: 'commerce', label: 'Commerce', test: n => /(cart|shopping|wallet|credit|bank|price|tag|sale|bag|store|shop)/.test(n), icon: 'shopping_cart' },
  { id: 'status', label: 'Status', test: n => /(star|heart|award|trophy|badge|bell|notification)/.test(n), icon: 'star' },
  { id: 'food', label: 'Food', test: n => /(apple|cake|coffee|cookie|beer|wine|food|restaurant|cup|tea)/.test(n), icon: 'restaurant' },
  { id: 'devices', label: 'Devices', test: n => /(cpu|laptop|desktop|tablet|phone|smartphone|device|monitor|tv)/.test(n), icon: 'devices' },
  { id: 'other', label: 'Other', test: () => true, icon: 'more_horiz' }
];

const searchEngines = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q='
};
let selectedSearchEngine = 'google';

let bookmarks = [];

// Load bookmarks from main via Electron IPC
// Load bookmarks via contextBridge API
async function loadBookmarks() {
  try {
    let data = [];
    // Use bookmarksAPI if available
    if (window.bookmarksAPI && typeof window.bookmarksAPI.load === 'function') {
      data = await window.bookmarksAPI.load();
    } else if (window.electronAPI && typeof window.electronAPI.invoke === 'function') {
      data = await window.electronAPI.invoke('load-bookmarks');
    } else {
      console.error('No API available to load bookmarks');
    }
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error loading bookmarks:', error);
    return [];
  }
}

// Save bookmarks to main process
// Save bookmarks via contextBridge API
async function saveBookmarks() {
  try {
    await window.bookmarksAPI.save(bookmarks);
  } catch (error) {
    console.error('Error saving bookmarks:', error);
  }
}

// Render bookmarks
function renderBookmarks() {
  bookmarkList.innerHTML = '';

  // Render each bookmark
  bookmarks.forEach((b, index) => {
    const box = document.createElement('div');
    box.className = 'bookmark';

    // prepend icon
    const iconVal = b.icon || 'bookmark';
    let iconEl;
    if (typeof iconVal === 'string' && /^(https?:|data:)/.test(iconVal)) {
      // Treat as favicon/image URL
      iconEl = document.createElement('img');
      iconEl.src = iconVal;
      iconEl.alt = 'favicon';
      iconEl.className = 'bookmark-favicon';
      iconEl.referrerPolicy = 'no-referrer';
      // Apply filter for dark backgrounds to ensure visibility
      if (isDarkBackground()) {
        iconEl.style.filter = 'brightness(0) saturate(100%) invert(100%)';
      }
      box.appendChild(iconEl);
    } else {
      iconEl = document.createElement('span');
      iconEl.className = 'material-symbols-outlined';
      iconEl.textContent = iconVal;
      box.appendChild(iconEl);
    }

    const label = document.createElement('span');
    label.className = 'bookmark-title';
    label.textContent = b.title;

    const close = document.createElement('button');
    close.textContent = '×';
    close.className = 'delete-btn';
    close.onclick = async (e) => {
      e.stopPropagation();
      bookmarks.splice(index, 1);
      await saveBookmarks();
      renderBookmarks();
    };

    // Navigate via IPC to host page
    box.onclick = () => {
      const url = b.url;
      if (window.electronAPI && typeof window.electronAPI.sendToHost === 'function') {
        window.electronAPI.sendToHost('navigate', url);
      } else {
        console.error('Unable to send navigation IPC to host');
      }
      // Fallback: post message to embedding page
      if (window.parent && typeof window.parent.postMessage === 'function') {
        window.parent.postMessage({ type: 'navigate', url }, '*');
      }
    };

    box.appendChild(label);
    box.appendChild(close);
    bookmarkList.appendChild(box);
  });

  // Add "+" box
  const addBox = document.createElement('div');
  addBox.className = 'bookmark add-bookmark';
  addBox.textContent = '+';
  addBox.onclick = () => addPopup.classList.remove('hidden');

  bookmarkList.appendChild(addBox);
}

// draw the icon‐grid, filtering by the search term
function renderIconGrid(filter = '') {
  const f = filter.toLowerCase();
  iconGrid.innerHTML = '';
  const frag = document.createDocumentFragment();
  let lastCat = null;
  const filtered = unifiedCatalog.filter(e => !f || e.name.includes(f));
  filtered.forEach(entry => {
    if (entry.category !== lastCat) {
      lastCat = entry.category;
      const anchor = document.createElement('div');
      anchor.className = 'icon-section-anchor';
      anchor.id = `section-${entry.category}`;
      frag.appendChild(anchor);
    }
    const span = document.createElement('span');
    span.className = 'icon-item';
    const def = iconSets[entry.set];
    if (entry.set === 'material') {
      span.classList.add('material-symbols-outlined');
      span.textContent = entry.name;
    } else if (def && def.fontClass) {
      const i = document.createElement('i');
      i.className = def.fontClass(entry.name);
      span.appendChild(i);
    } else if (entry.dataUrl) {
      const img = document.createElement('img');
      img.src = entry.dataUrl; img.alt = entry.name; img.className = 'grid-svg';
      span.appendChild(img);
    } else {
      span.textContent = '…';
      (async () => {
        if (def && def.fetchIcon) {
          const dataUrl = await def.fetchIcon(entry.name);
            if (dataUrl) {
              entry.dataUrl = dataUrl;
              if (span.isConnected) {
                span.textContent='';
                const img=document.createElement('img');
                img.src=dataUrl; img.alt=entry.name; img.className='grid-svg';
                span.appendChild(img);
              }
            } else {
              // If SVG fetch fails, try font class or show truncated name
              if (def.fontClass && span.isConnected) {
                span.textContent='';
                const i = document.createElement('i');
                i.className = def.fontClass(entry.name);
                span.appendChild(i);
              } else {
                span.textContent = entry.name.slice(0,3);
              }
            }
        } else {
          // No fetchIcon available, show name
          span.textContent = entry.name.slice(0,3);
        }
      })();
    }
    span.onclick = () => {
      const currentSelected = iconGrid.querySelector('.icon-item.selected');
      if (currentSelected) currentSelected.classList.remove('selected');
      span.classList.add('selected');
      selectedIcon = entry.name;
      selectedIconInput.value = entry.name;
      selectedIconInput.dataset.iconSet = entry.set;
      if (entry.dataUrl) selectedIconInput.dataset.dataUrl = entry.dataUrl; else delete selectedIconInput.dataset.dataUrl;
    };
    frag.appendChild(span);
  });
  iconGrid.appendChild(frag);
  // Don't auto-select first icon to allow favicon usage
}

// filter as the user types
iconFilter.addEventListener('input', () => renderIconGrid(iconFilter.value.trim()));

// initial render
renderIconGrid();

// Asynchronously fetch all icons and update the grid
async function buildUnifiedCatalog() {
  const keys = Object.keys(iconSets);
  for (const k of keys) {
    if (!loadedSetsCache.has(k)) {
      try { loadedSetsCache.set(k, await iconSets[k].loader()); }
      catch(e) { console.warn('Icon set load failed', k, e); loadedSetsCache.set(k, []); }
    }
  }
  const temp = [];
  for (const k of keys) {
    const arr = loadedSetsCache.get(k) || [];
    for (const name of arr) {
      const lower = name.toLowerCase();
      const category = iconCategories.find(c => c.test(lower, k)).id;
      temp.push({ set: k, name, category });
    }
  }
  // order by category then by name
  unifiedCatalog = temp.sort((a,b)=> {
    if (a.category === b.category) return a.name.localeCompare(b.name);
    return iconCategories.findIndex(c=>c.id===a.category) - iconCategories.findIndex(c=>c.id===b.category);
  });
  buildCategoryNav();
  renderIconGrid(iconFilter.value.trim());
}
buildUnifiedCatalog();

// --- Favicon resolution helpers ---
async function resolveFavicon(rawUrl) {
  if (!rawUrl) return null;
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url; // assume https if protocol missing
  }
  try {
    const u = new URL(url);
    // Prefer Google favicon service for simplicity & size; fall back to /favicon.ico
    const googleService = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(u.origin)}`;
    // We'll optimisticly use google service; optionally we could verify it loads, but browsers will handle 404 gracefully.
    return googleService;
  } catch (_) {
    return null;
  }
}

// Helper function to detect if background is dark
function isDarkBackground() {
  // For SVG color modification, check if we have a dark theme
  const rootStyles = window.getComputedStyle(document.documentElement);
  const bgVar = rootStyles.getPropertyValue('--bg').trim();
  
  if (bgVar && bgVar.startsWith('#')) {
    const hex = bgVar.slice(1);
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16); 
    const b = parseInt(hex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }
  
  // Fallback: assume dark theme for this app
  return true;
}

saveBookmarkBtn.onclick = async () => {
  const title = titleInput.value.trim();
  const url   = urlInput.value.trim();
  let icon  = selectedIcon;
  if (!title || !url) return;

  // Check if user wants to use favicon via checkbox
  const wantFavicon = useFaviconCheckbox.checked;
  
  if (wantFavicon) {
    try {
      const faviconUrl = await resolveFavicon(url);
      if (faviconUrl) icon = faviconUrl;
    } catch (e) {
      console.warn('Favicon fetch failed, falling back to icon symbol:', e);
    }
  } else {
    // Use selected icon if available
    const hasSelectedIcon = document.querySelector('.icon-item.selected');
    if (hasSelectedIcon) {
      if (selectedIconInput.dataset.iconSet && selectedIconInput.dataset.iconSet !== 'material') {
        if (selectedIconInput.dataset.dataUrl) {
          icon = selectedIconInput.dataset.dataUrl;
          
          // For SVG icons, modify color based on background
          if (icon.startsWith('data:image/svg+xml') && isDarkBackground()) {
            try {
              // Decode the SVG and modify its color
              const svgData = decodeURIComponent(icon.split(',')[1]);
              const modifiedSvg = svgData.replace(/fill="[^"]*"/g, 'fill="white"')
                                        .replace(/stroke="[^"]*"/g, 'stroke="white"')
                                        .replace(/<svg([^>]*)>/, '<svg$1 style="color: white;">');
              icon = 'data:image/svg+xml;utf8,' + encodeURIComponent(modifiedSvg);
            } catch (e) {
              console.warn('Failed to modify SVG color:', e);
            }
          }
        } else {
          const def = iconSets[selectedIconInput.dataset.iconSet];
          if (def && def.fetchIcon) {
            const dataUrl = await def.fetchIcon(selectedIcon);
            if (dataUrl) {
              icon = dataUrl;
              
              // Apply same color modification for fetched SVGs
              if (icon.startsWith('data:image/svg+xml') && isDarkBackground()) {
                try {
                  const svgData = decodeURIComponent(icon.split(',')[1]);
                  const modifiedSvg = svgData.replace(/fill="[^"]*"/g, 'fill="white"')
                                            .replace(/stroke="[^"]*"/g, 'stroke="white"')
                                            .replace(/<svg([^>]*)>/, '<svg$1 style="color: white;">');
                  icon = 'data:image/svg+xml;utf8,' + encodeURIComponent(modifiedSvg);
                } catch (e) {
                  console.warn('Failed to modify fetched SVG color:', e);
                }
              }
            }
          }
        }
      } else {
        // For Material icons, just use the icon name - CSS will handle color
        icon = selectedIcon;
      }
    } else {
      // No icon selected and no favicon requested, use default bookmark icon
      icon = 'bookmark';
    }
  }

  bookmarks.push({ title, url, icon, iconSet: selectedIconInput.dataset.iconSet || 'material' });
  await saveBookmarks();
  renderBookmarks();

  titleInput.value = '';
  urlInput.value = '';
  iconFilter.value = '';
  useFaviconCheckbox.checked = false;
  // Clear any selected icon
  const selected = document.querySelector('.icon-item.selected');
  if (selected) selected.classList.remove('selected');
  addPopup.classList.add('hidden');
};

// Disable icon selection when favicon toggle is checked
useFaviconCheckbox.addEventListener('change', () => {
  const iconItems = document.querySelectorAll('.icon-item');
  if (useFaviconCheckbox.checked) {
    iconItems.forEach(item => {
      item.style.opacity = '0.5';
      item.style.pointerEvents = 'none';
    });
    // Clear any selection
    const selected = document.querySelector('.icon-item.selected');
    if (selected) selected.classList.remove('selected');
  } else {
    iconItems.forEach(item => {
      item.style.opacity = '';
      item.style.pointerEvents = '';
    });
  }
});

cancelBtn.onclick = () => {
  addPopup.classList.add('hidden');
};

// --- Search Engine Dropdown Logic ---
searchEngineBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  searchEngineDropdown.classList.toggle('hidden');
});

document.addEventListener('click', () => {
  if (!searchEngineDropdown.classList.contains('hidden')) {
    searchEngineDropdown.classList.add('hidden');
  }
});

searchEngineDropdown.addEventListener('click', (e) => {
  const option = e.target.closest('.search-engine-option');
  if (option) {
    selectedSearchEngine = option.dataset.engine;
    const newLogoSrc = option.querySelector('img').src;
    searchEngineLogo.src = newLogoSrc;
    searchEngineDropdown.classList.add('hidden');
  }
});
// --- End Search Engine Dropdown Logic ---

searchBtn.addEventListener('click', () => {
  const input = searchInput.value.trim();
  const hasProtocol = /^https?:\/\//i.test(input);
  const looksLikeUrl = hasProtocol || /\./.test(input);
  let target;
  if (looksLikeUrl) {
    target = hasProtocol ? input : `https://${input}`;
  } else {
    const searchEngineUrl = searchEngines[selectedSearchEngine];
    target = `${searchEngineUrl}${encodeURIComponent(input)}`;
  }
  // Always send navigation request to host
  if (window.electronAPI && typeof window.electronAPI.sendToHost === 'function') {
    window.electronAPI.sendToHost('navigate', target);
    return;
  }
  // Fallback: post message to embedding page
  if (window.parent && typeof window.parent.postMessage === 'function') {
    window.parent.postMessage({ type: 'navigate', url: target }, '*');
    return;
  }
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') searchBtn.click();
});

function buildCategoryNav() {
  iconCategoryNav.innerHTML = '';
  const usedCategories = [...new Set(unifiedCatalog.map(e=>e.category))];
  iconCategories.filter(c=>usedCategories.includes(c.id)).forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-cat-btn';
    
    // Create icon element
    const iconSpan = document.createElement('span');
    iconSpan.className = 'material-symbols-outlined';
    iconSpan.textContent = cat.icon;
    
    // Create text element  
    const textSpan = document.createElement('span');
    textSpan.textContent = cat.label;
    
    btn.appendChild(iconSpan);
    btn.appendChild(textSpan);
    
    btn.onclick = () => {
      const target = document.getElementById(`section-${cat.id}`);
      if (target) {
        const top = target.offsetTop;
        iconGrid.scrollTo({ top: top - 4, behavior: 'smooth' });
        iconCategoryNav.querySelectorAll('.icon-cat-btn').forEach(b => b.classList.toggle('active', b === btn));
      }
    };
    iconCategoryNav.appendChild(btn);
  });
  setupSectionObserver();
}

function setupSectionObserver() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
  const id = entry.target.id.replace('section-','');
  const cat = iconCategories.find(c=>c.id===id);
  if (!cat) return;
  iconCategoryNav.querySelectorAll('.icon-cat-btn').forEach(b => {
    const isActive = b.querySelector('span:last-child').textContent === cat.label;
    b.classList.toggle('active', isActive);
  });
      }
    });
  }, { root: iconGrid, threshold: 0, rootMargin: '0px 0px -85% 0px' });
  // Observe after grid populated
  const watch = () => {
    iconGrid.querySelectorAll('.icon-section-anchor').forEach(l => observer.observe(l));
  };
  // Re-run after each render
  const origRender = renderIconGrid;
  renderIconGrid = function(filter='') { origRender(filter); watch(); };
  watch();
}

// Load and render bookmarks immediately
(async () => {
  bookmarks = await loadBookmarks();
  // Wait a bit for styles to load before rendering
  setTimeout(() => {
    renderBookmarks();
  }, 100);
})();
