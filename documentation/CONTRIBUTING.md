# Contributing to Nebula

First off, thank you for considering contributing to Nebula! It's people like you that make open source such a great community.

## How Can I Contribute?

### Reporting Bugs

-   Ensure the bug was not already reported by searching on GitHub under [Issues](https://github.com/Bobbybear007/NebulaBrowser/issues).
-   If you're unable to find an open issue addressing the problem, [open a new one](https://github.com/Bobbybear007/NebulaBrowser/issues/new). Be sure to include a **title and clear description**, as much relevant information as possible, and a **code sample** or an **executable test case** demonstrating the expected behavior that is not occurring.

### Suggesting Enhancements

-   Open a new issue to discuss your enhancement. Please provide a clear description of the enhancement and its potential benefits.

### Pull Requests

1.  **Fork the repository** to your own GitHub account.
2.  **Clone the project** to your machine.
3.  **Create a new branch** for your changes:
    ```sh
    git checkout -b feature/your-feature-name
    ```
4.  **Make your changes** and commit them with a clear, descriptive commit message:
    ```sh
    git commit -m "Add some feature"
    ```
5.  **Push your branch** to your fork:
    ```sh
    git push origin feature/your-feature-name
    ```
6.  **Open a pull request** to the `main` branch of the original repository. Provide a clear title and description for your pull request, explaining the changes you've made.

## Styleguides

### Git Commit Messages

-   Use the present tense ("Add feature" not "Added feature").
-   Use the imperative mood ("Move cursor to..." not "Moves cursor to...").
-   Limit the first line to 72 characters or less.
-   Reference issues and pull requests liberally after the first line.

### Code of Conduct

We have a [Code of Conduct](CODE_OF_CONDUCT.md) that all contributors are expected to follow. Please make sure you are familiar with its contents.

### JavaScript Styleguide

-   All JavaScript must adhere to [StandardJS](https://standardjs.com/). This helps us maintain a consistent coding style.
-   Use soft-tabs with a two-space indent.
-   Prefer single quotes `'` over double quotes `"`.
-   No semicolons.
-   For more details, please refer to the [StandardJS rules](https://standardjs.com/rules.html).

### CSS Styleguide

-   Follow a BEM-like naming convention for classes (`block__element--modifier`).
-   Use soft-tabs with a two-space indent.
-   Write selectors and their properties on separate lines.
-   Organize properties logically (e.g., positioning, box model, typography, visual).
-   Use `rem` for font sizes and `px` for borders.
-   Use `===` and `!==` instead of `==` and `!=` for comparisons.
-   Always declare variables with `const` or `let` instead of `var`.
-   Use arrow functions instead of `function` where appropriate.
-   Prefer template literals over string concatenation.
