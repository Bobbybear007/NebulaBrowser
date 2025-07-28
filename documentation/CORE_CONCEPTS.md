# Core Concepts

This document explains the core architectural concepts of the Nebula browser.

### Main and Renderer Processes

Electron applications have two types of processes: the **main process** and one or more **renderer processes**.

-   **Main Process**: The main process, which runs the `main.js` script, is the entry point of the application. It runs in a Node.js environment, meaning it has access to all Node.js APIs like `fs` for file system access and `ipcMain` for communication. It is responsible for creating and managing `BrowserWindow` instances, which are the application's windows.

-   **Renderer Process**: Each `BrowserWindow` runs its own renderer process. The renderer process is responsible for rendering web content—in Nebula's case, the browser's user interface (UI) built with HTML, CSS, and JavaScript. The renderer process does not have direct access to Node.js APIs for security reasons.

### Inter-Process Communication (IPC)

Since the main and renderer processes are separate, they need a way to communicate. This is done through Inter-Process Communication (IPC).

-   **`ipcMain` and `ipcRenderer`**: Electron provides the `ipcMain` and `ipcRenderer` modules for this purpose. The main process can listen for messages from the renderer process using `ipcMain.handle`, and the renderer process can send messages using `ipcRenderer.invoke`.

-   **Context Bridge and Preload Script**: To securely expose APIs from the main process to the renderer process, Electron uses a **preload script** and the **context bridge**. The `preload.js` script runs in a special environment that has access to both the `window` object of the renderer process and Node.js APIs. The `contextBridge` is used to expose specific functions from the preload script to the renderer process, ensuring that the renderer process cannot access powerful Node.js APIs directly.

### Performance and GPU Management

-   **Performance Monitoring**: The `performance-monitor.js` module helps track the application's performance by monitoring metrics like memory usage and page load times. This is essential for identifying and addressing performance bottlenecks.

-   **GPU Configuration**: The `gpu-config.js` and `gpu-fallback.js` modules manage GPU acceleration. Electron uses the system's GPU to render content, which can significantly improve performance. However, GPU drivers can sometimes be a source of instability. These modules allow Nebula to check the GPU status and apply fallbacks (like disabling hardware acceleration) if issues are detected, ensuring a more stable experience.
