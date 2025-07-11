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

Pull requests and pushes to `main` run a small test script via GitHub Actions. The workflow runs `test.sh` which checks that `index.html` exists and contains a `<title>` tag.

You can run the same test locally before opening a pull request:

```bash
bash test.sh
```