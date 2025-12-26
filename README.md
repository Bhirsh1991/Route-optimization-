# Route Optimization

A simple web application for planning an optimal travel route.

**Live demo:** https://bhirsh1991.github.io/Route-optimization-/

## Usage

1. Open `index.html` locally or visit the [live demo](https://bhirsh1991.github.io/Route-optimization-/).
2. Set your start and end addresses.
3. Add intermediate locations.
4. Click the optimize button to compute the best route and optionally open it in Google Maps.
5. Save routes for later use and open the saved-routes panel to load or preview parameters.

## Interface Highlights

- Light/dark mode updates the full layout, including the page background and theme color.
- Saved routes now live in a dedicated slide-over panel with preview details (start, end, and stops).

## PWA (Progressive Web App)

The app includes a service worker and manifest so it can be installed as a PWA.

1. Open the live demo in a supported browser (Chrome, Edge, or Safari on iOS).
2. Use **Install App** (desktop) or **Add to Home Screen** (mobile) to install it.
3. Launch the installed app to run it in a standalone window; it will cache assets for faster startup.

## Development

The application consists of a single HTML file that uses vanilla JavaScript and Tailwind CSS via CDN, so no build step is required.

## CI

Pull requests and pushes to `main` trigger a GitHub Actions workflow that performs several checks:

1. **Install dependencies** – Node.js is set up and `npm install` runs to fetch test tooling.
2. **Syntax check** – each JavaScript file is parsed with `node --check` to catch syntax errors early.
3. **Unit tests** – `npm test` executes the Jest test suite under `tests/`.
4. **Basic file check** – the existing `test.sh` script verifies that `index.html` is present and includes a `<title>` tag.

You can run these checks locally before opening a pull request:

```bash
npm install
npm test
bash test.sh
```
