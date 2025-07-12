# Route Optimization

A simple web application for planning an optimal travel route.

**Live demo:** https://bhirsh1991.github.io/Route-optimization-/

## Usage

1. Open `index.html` locally or visit the [live demo](https://bhirsh1991.github.io/Route-optimization-/).
2. Set your start and end addresses.
3. Add intermediate locations.
4. Click the optimize button to compute the best route and optionally open it in Google Maps.

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