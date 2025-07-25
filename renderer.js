document.addEventListener('DOMContentLoaded', () => {
    const addressBar = document.getElementById('address-bar');
    const goButton = document.getElementById('go-button');
    const backButton = document.getElementById('back-button');
    const forwardButton = document.getElementById('forward-button');
    const refreshButton = document.getElementById('refresh-button');

    // Load initial URL if present in address bar
    const initialUrl = addressBar.value;
    if (initialUrl) {
        window.electronAPI.loadURL(initialUrl);
    }

    goButton.addEventListener('click', () => {
        const url = addressBar.value;
        if (url) {
            window.electronAPI.loadURL(url);
        }
    });

    addressBar.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const url = addressBar.value;
            if (url) {
                window.electronAPI.loadURL(url);
            }
        }
    });

    backButton.addEventListener('click', () => {
        window.electronAPI.goBack();
    });

    forwardButton.addEventListener('click', () => {
        window.electronAPI.goForward();
    });

    refreshButton.addEventListener('click', () => {
        window.electronAPI.refreshPage();
    });

    // You can add more logic here, e.g., to update the address bar
    // when the BrowserView navigates to a new URL. This requires
    // IPC communication from the main process to the renderer.
    // We'll leave that as a potential enhancement for later.
});