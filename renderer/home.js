import { icons as initialIcons, fetchAllIcons } from './icons.js';

const BOOKMARKS_KEY = 'steamos_browser_bookmarks';

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

let bookmarks = JSON.parse(localStorage.getItem(BOOKMARKS_KEY)) || [];

function saveBookmarks() {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
}

function renderBookmarks() {
  const list = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]');
  bookmarkList.innerHTML = '';

  // Render each bookmark
  list.forEach((b, index) => {
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
    close.onclick = (e) => {
      e.stopPropagation();
      bookmarks.splice(index, 1);
      saveBookmarks();
      renderBookmarks();
    };

    box.onclick = () => window.location.href = b.url;

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

saveBookmarkBtn.onclick = () => {
  const title = titleInput.value.trim();
  const url   = urlInput.value.trim();
  const icon  = selectedIcon;
  if (!title || !url) return;

  bookmarks.push({ title, url, icon });
  saveBookmarks();
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
  window.location.href = target;
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') searchBtn.click();
});

// initial render from localStorage
renderBookmarks();
