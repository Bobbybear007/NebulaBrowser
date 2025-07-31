import { icons as initialIcons, fetchAllIcons } from './icons.js';

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
let selectedIcon       = initialIcons[0];
let availableIcons     = initialIcons;

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
    const iconEl = document.createElement('span');
    iconEl.className = 'material-symbols-outlined';
    iconEl.textContent = b.icon || 'bookmark';
    box.appendChild(iconEl);

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
  iconGrid.innerHTML = '';
  availableIcons
    .filter(name => name.includes(filter))
    .forEach(name => {
      const span = document.createElement('span');
      span.className = 'material-symbols-outlined icon-item';
      span.textContent = name;
      span.onclick = () => {
        const currentSelected = iconGrid.querySelector('.icon-item.selected');
        if (currentSelected) {
          currentSelected.classList.remove('selected');
        }
        span.classList.add('selected');
        selectedIcon = name;
        selectedIconInput.value = name;
      };
      iconGrid.appendChild(span);
    });
  const first = iconGrid.querySelector('.icon-item');
  if (first) first.click();
}

// filter as the user types
iconFilter.addEventListener('input', () =>
  renderIconGrid(iconFilter.value.trim().toLowerCase())
);

// initial render
renderIconGrid();

// Asynchronously fetch all icons and update the grid
(async () => {
  try {
    const allIcons = await fetchAllIcons();
    availableIcons = allIcons;
    // Re-render with the full list, preserving any filter text
    renderIconGrid(iconFilter.value.trim().toLowerCase());
  } catch (error) {
    console.error('Failed to fetch all icons:', error);
  }
})();

saveBookmarkBtn.onclick = async () => {
  const title = titleInput.value.trim();
  const url   = urlInput.value.trim();
  const icon  = selectedIcon;
  if (!title || !url) return;

  bookmarks.push({ title, url, icon });
  await saveBookmarks();
  renderBookmarks();

  titleInput.value = '';
  urlInput.value = '';
  addPopup.classList.add('hidden');
};

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

// Load and render bookmarks immediately
(async () => {
  bookmarks = await loadBookmarks();
  renderBookmarks();
})();
