# Project Structure

This document provides an in-depth look at the project's file and directory structure.

-   **`main.js`**: This is the heart of the Electron application. It's the main process script that controls the application's lifecycle, creates browser windows, and handles all interactions with the operating system.

-   **`renderer/`**: This directory contains all the client-side code and assets for the browser's user interface (the renderer process).
    -   **`index.html`**: The main HTML file that serves as the container for the browser's UI, including the tab bar, address bar, and the webview for displaying web content.
    -   **`style.css`**: The primary stylesheet for the entire browser interface.
    -   **`script.js`**: The main JavaScript file for the renderer process. It handles all the user interactions within the browser window, such as creating new tabs, handling navigation, and communicating with the main process.
    -   **`home.html`**, **`home.css`**, **`home.js`**: These files define the content and behavior of the default home page (new tab page).
    -   **`settings.html`**, **`settings.css`**, **`settings.js`**: These files create the settings page, allowing users to configure the browser and manage their data.
    -   **`404.html`**, **`404.css`**: Files for the "page not found" error page.
    -   **`gpu-diagnostics.html`**: The page for displaying GPU information.
    -   **`performance.css`**: Styles for the performance monitoring page.
    -   **`icons.js`**, **`icons.json`**: Files related to managing icons within the UI.

-   **`preload.js`**: This script is a crucial part of Electron's security model. It runs in a privileged context before the renderer process's web page is loaded. It's used to selectively expose APIs from the main process to the renderer process via the `contextBridge`.

-   **`performance-monitor.js`**: A Node.js module that runs in the main process to track application performance metrics like memory usage and page load times.

-   **`gpu-config.js`** & **`gpu-fallback.js`**: These modules are responsible for managing GPU-related settings. `gpu-config.js` checks the system's GPU capabilities, and `gpu-fallback.js` provides mechanisms to disable or reduce GPU acceleration if problems are detected.

-   **`assets/`**: This directory holds all static assets.
    -   **`images/`**: Contains logos, icons, and other images used in the application.
    -   **`fonts/`**: Contains font files.

-   **`documentation/`**: Contains all supplementary documentation for the project.

-   **`*.json`**: Configuration and data files.
    -   **`package.json`**: Defines the project's metadata, dependencies, and scripts.
    -   **`bookmarks.json`**: Stores the user's bookmarks.
    -   **`site-history.json`**: Stores the user's browsing history.
    -   **`search-history.json`**: Stores the user's search history.

-   **`start-gpu-safe.bat`**: A batch script for Windows users to start the application in a GPU-safe mode.
