# Nebula

![Nebula Logo](assets/images/Logos/Nebula-Logo.svg)

A customizable and privacy-focused web browser built with Electron. Nebula is designed to be a lightweight, secure, and user-friendly browser with a focus on performance and privacy.

## Features

*   **Privacy Control:** Easily clear your browsing data (history, cookies, cache, local storage, and more).
*   **Tab Management:** Open new tabs, pop a tab out into a new window, and manage them efficiently.
*   **Bookmarks:** Save your favorite sites with automatic backup on save.
*   **History:** Keeps track of your browsing and search history with one-click clear.
*   **Downloads Manager:** Track downloads, pause/resume/cancel, and open or reveal completed files.
*   **Context Menu:** Native right‑click menu with Back/Forward/Reload, open/download links, image actions, and Inspect Element.
*   **Auth Compatibility:** Improved OAuth/SSO & WebAuthn support (popup windows enabled where needed).
*   **Performance Monitoring:** Built-in tools to monitor app performance and force GC when needed.
*   **GPU Acceleration Control:** Diagnostics and safe fallbacks to troubleshoot rendering issues.
*   **Themes & Customization:** Built-in themes and live editor to craft your own.
*   **Cross-Platform:** Runs on Windows, macOS, and Linux.

[**Learn more about Nebula's features.**](documentation/FEATURES.md)

## Getting Started

### Prerequisites

*   [Node.js](https://nodejs.org/) installed.

### Installation

1.  Clone the repository:
    ```sh
    git clone https://github.com/Bobbybear007/NebulaBrowser.git
    ```
2.  Navigate to the project directory:
    ```sh
    cd NebulaBrowser
    ```
3.  Install dependencies:
    ```sh
    npm install
    ```

### Running the Application

To start the browser, run the following command:

```sh
npm start
```

## Building the Application

To build the application for your platform, run:

```sh
npm run dist
```

This will create a distributable file in the `dist` directory.

Tip (Windows): If you encounter GPU issues, try starting with `start-gpu-safe.bat` to launch in a safer rendering mode.

## Project Structure

An overview of the project's structure. For a more detailed explanation, please see the [Project Structure documentation](documentation/PROJECT_STRUCTURE.md).

-   `main.js`: The main entry point for the Electron application.
-   `renderer/`: Contains all the front-end files.
-   `preload.js`: Bridges the main and renderer processes.
-   `performance-monitor.js`: Module for monitoring performance.
-   `gpu-config.js` & `gpu-fallback.js`: Modules for managing GPU settings.
-   `assets/`: Contains static assets.
-   `documentation/`: Contains additional documentation.

## Core Concepts

Nebula is built on several core concepts that are essential to understanding how it works. For a deeper dive, read the [Core Concepts documentation](documentation/CORE_CONCEPTS.md).

-   **Main and Renderer Processes**
-   **Inter-Process Communication (IPC)**
-   **Performance and GPU Management**

## Contributing

Contributions are welcome! Please read our [contributing guidelines](documentation/CONTRIBUTING.md) to get started.

## Technologies Used

*   [Electron](https://www.electronjs.org/)
*   HTML, CSS, JavaScript

## License

This project is licensed under the MIT License. [Read More](documentation/MIT.md)


## Documentation

* [MIT License](documentation/MIT.md)
* [GPU Fix](documentation/GPU-FIX-README.md)
* [Features](documentation/FEATURES.md)
* [Customization](documentation/Customization.md)
* [Project Structure](documentation/PROJECT_STRUCTURE.md)
* [Core Concepts](documentation/CORE_CONCEPTS.md)
* [Contributing Guide](documentation/CONTRIBUTING.md)
* [OAuth Debug](documentation/oauth-debug.md)
