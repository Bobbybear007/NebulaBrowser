// renderer.js

window.electronAPI.onIsSteamOS((isSteamOS) => {
    console.log('Is SteamOS:', isSteamOS);
    if (isSteamOS) {
        // Apply the SteamOS stylesheet
        document.getElementById('steam-os-style').href = 'steamos.css';
        // You could also set a specific user agent for the webview if needed
        const webview = document.getElementById('webview');
        webview.useragent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36 SteamOS/3.0";
    }
});

// Bookmark management
let bookmarks = [];

// Load bookmarks from storage
async function loadBookmarks() {
    try {
        const result = await window.electronAPI.getBookmarks();
        bookmarks = result.bookmarks || [];
        updateBookmarksUI();
        updateBookmarkButton();
    } catch (error) {
        console.error('Error loading bookmarks:', error);
    }
}

// Update the bookmarks dropdown menu
function updateBookmarksUI() {
    const bookmarksList = document.getElementById('bookmarks-list');
    
    if (bookmarks.length === 0) {
        bookmarksList.innerHTML = '<p class="text-gray-400 text-sm">No bookmarks yet</p>';
        return;
    }
    
    bookmarksList.innerHTML = bookmarks.map(bookmark => `
        <div class="bookmark-item flex items-center justify-between p-2 hover:bg-gray-700 rounded mb-1">
            <div class="flex-grow cursor-pointer" onclick="loadBookmark('${bookmark.url}')">
                <div class="font-medium text-sm truncate">${bookmark.title}</div>
                <div class="text-xs text-gray-400 truncate">${bookmark.url}</div>
            </div>
            <button class="ml-2 px-2 py-1 text-red-400 hover:text-red-300 text-xs" onclick="removeBookmark('${bookmark.url}')">✕</button>
        </div>
    `).join('');
}

// Update bookmark button state
function updateBookmarkButton() {
    const bookmarkBtn = document.getElementById('bookmark-btn');
    const currentUrl = document.getElementById('url-bar').value;
    
    const isBookmarked = bookmarks.some(b => b.url === currentUrl);
    bookmarkBtn.textContent = isBookmarked ? '★' : '☆';
    bookmarkBtn.style.backgroundColor = isBookmarked ? '#dc2626' : '#2563eb';
}

// Add/remove bookmark
async function toggleBookmark() {
    const webview = document.getElementById('webview');
    const urlBar = document.getElementById('url-bar');
    const currentUrl = urlBar.value;
    
    if (!currentUrl) return;
    
    const isBookmarked = bookmarks.some(b => b.url === currentUrl);
    
    try {
        if (isBookmarked) {
            const result = await window.electronAPI.removeBookmark(currentUrl);
            if (result.success) {
                console.log('Bookmark removed');
                await loadBookmarks(); // Reload bookmarks
            } else {
                console.error('Failed to remove bookmark:', result.message);
            }
        } else {
            // Get page title from webview
            let pageTitle = currentUrl;
            try {
                pageTitle = await webview.executeJavaScript('document.title') || currentUrl;
            } catch (e) {
                console.log('Could not get page title, using URL');
            }
            
            const bookmark = {
                title: pageTitle,
                url: currentUrl
            };
            
            const result = await window.electronAPI.addBookmark(bookmark);
            if (result.success) {
                console.log('Bookmark added');
                await loadBookmarks(); // Reload bookmarks
            } else {
                console.error('Failed to add bookmark:', result.message);
            }
        }
    } catch (error) {
        console.error('Error toggling bookmark:', error);
    }
}

// Load a bookmark
function loadBookmark(url) {
    const webview = document.getElementById('webview');
    const urlBar = document.getElementById('url-bar');
    
    webview.loadURL(url);
    urlBar.value = url;
    
    // Hide bookmarks menu
    document.getElementById('bookmarks-menu').classList.add('hidden');
}

// Remove a bookmark
async function removeBookmark(url) {
    try {
        const result = await window.electronAPI.removeBookmark(url);
        if (result.success) {
            console.log('Bookmark removed');
            await loadBookmarks(); // Reload bookmarks
        } else {
            console.error('Failed to remove bookmark:', result.message);
        }
    } catch (error) {
        console.error('Error removing bookmark:', error);
    }
}

window.onload = () => {
    const webview = document.getElementById('webview');
    const urlBar = document.getElementById('url-bar');

    const backBtn = document.getElementById('back-btn');
    const forwardBtn = document.getElementById('forward-btn');
    const reloadBtn = document.getElementById('reload-btn');
    const homeBtn = document.getElementById('home-btn');
    const bookmarkBtn = document.getElementById('bookmark-btn');
    const bookmarksMenuBtn = document.getElementById('bookmarks-menu-btn');
    const bookmarksMenu = document.getElementById('bookmarks-menu');
    const menuBtn = document.getElementById('menu-btn');
    const menuDropdown = document.getElementById('menu-dropdown');

    // Load bookmarks on startup
    loadBookmarks();

    // Set home page as default
    webview.src = 'pages/home.html';

    // Navigation controls
    backBtn.addEventListener('click', () => webview.goBack());
    forwardBtn.addEventListener('click', () => webview.goForward());
    reloadBtn.addEventListener('click', () => webview.reload());
    
    // Home button functionality
    homeBtn.addEventListener('click', () => {
        webview.src = 'pages/home.html';
        urlBar.value = 'Type URL Here';
    });

    // Home button functionality (reload button can serve as home when on external sites)
    reloadBtn.addEventListener('dblclick', () => {
        webview.src = 'pages/home.html';
        urlBar.value = 'Type URL Here';
    });

    // Listen for navigation messages from home page
    webview.addEventListener('ipc-message', (event) => {
        if (event.channel === 'navigate') {
            const url = event.args[0];
            webview.loadURL(url);
            urlBar.value = url;
        }
    });

    // Bookmark controls
    bookmarkBtn.addEventListener('click', toggleBookmark);
    
    // Bookmarks menu toggle
    bookmarksMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        bookmarksMenu.classList.toggle('hidden');
    });

    // Burger menu toggle
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menuDropdown.classList.toggle('hidden');
        // Hide bookmarks menu if open
        bookmarksMenu.classList.add('hidden');
    });

    // Close menus when clicking outside
    document.addEventListener('click', (e) => {
        if (!bookmarksMenu.contains(e.target) && !bookmarksMenuBtn.contains(e.target)) {
            bookmarksMenu.classList.add('hidden');
        }
        if (!menuDropdown.contains(e.target) && !menuBtn.contains(e.target)) {
            menuDropdown.classList.add('hidden');
        }
    });

    // URL bar functionality
    urlBar.addEventListener('focus', () => {
        if (urlBar.value === 'Type URL Here') {
            urlBar.value = '';
        }
    });

    urlBar.addEventListener('blur', () => {
        if (urlBar.value.trim() === '') {
            const currentUrl = webview.getURL();
            if (currentUrl.endsWith('pages/home.html')) {
                urlBar.value = 'Type URL Here';
            }
        }
    });

    urlBar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            let url = urlBar.value.trim();
            if (url === '' || url === 'Type URL Here') {
                return;
            }
            // Simple check to add https:// if it's missing
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }
            webview.loadURL(url);
        }
    });

    function updateUrlBar(url) {
        if (url && url.endsWith('pages/home.html')) {
            urlBar.value = 'Type URL Here';
        } else {
            urlBar.value = url;
        }
        updateBookmarkButton();
    }

    // Update URL bar and bookmark button when webview navigates
    webview.addEventListener('did-navigate', (e) => {
        updateUrlBar(e.url);
    });

    webview.addEventListener('did-navigate-in-page', (e) => {
        updateUrlBar(e.url);
    });
    
    // Update bookmark button when URL bar changes
    urlBar.addEventListener('input', updateBookmarkButton);

    // Burger menu links
    document.getElementById('settings-link').addEventListener('click', (e) => {
        e.preventDefault();
        webview.src = 'pages/settings.html';
        urlBar.value = '';
        menuDropdown.classList.add('hidden');
    });
};
