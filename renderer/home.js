import { icons } from './icons.js';

const BOOKMARKS_KEY = 'steamos_browser_bookmarks';

const bookmarkList      = document.getElementById('bookmarkList');
const titleInput        = document.getElementById('titleInput');
const urlInput          = document.getElementById('urlInput');
const saveBookmarkBtn   = document.getElementById('saveBookmarkBtn');
const cancelBtn         = document.getElementById('cancelBtn');
const addPopup          = document.getElementById('addPopup');
const searchBtn         = document.getElementById('searchBtn');
const searchInput       = document.getElementById('searchInput');
const iconFilter       = document.getElementById('iconFilter');
const iconGrid         = document.getElementById('iconGrid');
const selectedIconInput= document.getElementById('selectedIcon');
let selectedIcon       = icons[0];

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
  icons
    .filter(name => name.includes(filter))
    .forEach(name => {
      const span = document.createElement('span');
      span.className = 'material-symbols-outlined icon-item';
      span.textContent = name;
      span.onclick = () => {
        iconGrid.querySelectorAll('.icon-item')
          .forEach(el => el.classList.remove('selected'));
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

searchBtn.addEventListener('click', () => {
  const input = searchInput.value.trim();
  const hasProtocol = /^https?:\/\//i.test(input);
  const looksLikeUrl = hasProtocol || /\./.test(input);
  let target;
  if (looksLikeUrl) {
    target = hasProtocol ? input : `https://${input}`;
  } else {
    target = `https://www.google.com/search?q=${encodeURIComponent(input)}`;
  }
  window.location.href = target;
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') searchBtn.click();
});

// initial render from localStorage
renderBookmarks();
