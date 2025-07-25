document.addEventListener('DOMContentLoaded', () => {
    const clearCookiesBtn = document.getElementById('clearCookiesBtn');
    const backToHomeBtn = document.getElementById('backToHome');

    if (clearCookiesBtn) {
        clearCookiesBtn.addEventListener('click', () => {
            if (window.settingsAPI && window.settingsAPI.clearCookies) {
                window.settingsAPI.clearCookies();
                alert('Cookies have been cleared.');
            } else {
                console.error('Settings API not available.');
                alert('Could not clear cookies. API not found.');
            }
        });
    }

    if (backToHomeBtn) {
        backToHomeBtn.addEventListener('click', () => {
            if (window.settingsAPI && window.settingsAPI.goHome) {
                window.settingsAPI.goHome();
            } else {
                // Fallback if the API isn't available
                window.history.back();
            }
        });
    }
    // Clear bookmarks button
    const clearBookmarksBtn = document.getElementById('clearBookmarksBtn');
    if (clearBookmarksBtn) {
        clearBookmarksBtn.addEventListener('click', () => {
            if (window.settingsAPI && window.settingsAPI.clearBookmarks) {
                window.settingsAPI.clearBookmarks().then(result => {
                    if (result && result.success) {
                        alert('All bookmarks have been cleared.');
                    } else {
                        alert('Could not clear bookmarks.');
                        console.error(result.error);
                    }
                });
            } else {
                console.error('Settings API for clearing bookmarks not available.');
                alert('Could not clear bookmarks. API not found.');
            }
        });
    }
    // Clear home bookmarks button
    const clearHomeBookmarksBtn = document.getElementById('clearHomeBookmarksBtn');
    if (clearHomeBookmarksBtn) {
        clearHomeBookmarksBtn.addEventListener('click', () => {
            if (window.settingsAPI && window.settingsAPI.clearHomeBookmarks) {
                window.settingsAPI.clearHomeBookmarks().then(result => {
                    if (result && result.success) {
                        alert('All home bookmarks have been cleared.');
                    } else {
                        alert('Could not clear home bookmarks.');
                        console.error(result.error);
                    }
                });
            } else {
                console.error('Settings API for clearing home bookmarks not available.');
                alert('Could not clear home bookmarks. API not found.');
            }
        });
    }
});
