# Route Optimization

A simple web application for planning an optimal travel route.

**Live demo:** https://bhirsh1991.github.io/Route-optimization-/

## Usage

1. Open the [planner](https://bhirsh1991.github.io/Route-optimization-/) and search for a start, end or intermediate address. Select the matching result. The Israel-only filter is optional.
2. To import deliveries, paste a message into the WhatsApp section, review each suggested address, and search for it. Contact previews stay on the device.
3. Compute the route. The planner minimizes travel time according to the OSRM driving matrix for up to 14 intermediate stops and uses a nearest-neighbor estimate for larger trips.
4. Open the route in Google Maps. Five intermediate stops can open in one app link. For mobile browsers, use the alternative links with up to three intermediate stops per segment.
5. Your draft and its last calculated order are stored in this browser. Save a named route to keep multiple trips.

## Interface Highlights

- Light/dark mode updates the full layout, including the page background and theme color.
- Saved routes now live in a dedicated slide-over panel with preview details (start, end, and stops).

## PWA (Progressive Web App)

The app includes a service worker and manifest so it can be installed as a PWA.

1. Open the live demo in a supported browser (Chrome, Edge, or Safari on iOS).
2. Use **Install App** (desktop) or **Add to Home Screen** (mobile) to install it.
3. After the first successful online visit, the planner can reopen offline with locally stored routes. New address searches and driving-time calculations need a connection.

## Development

The published files are static. The page uses vanilla JavaScript and a local Tailwind stylesheet. Run `npm run build` after changing HTML, scripts or assets and commit the generated `assets/app.css` and `service-worker.js`. The build refreshes the offline shell revision.

## CI

Pull requests and pushes to `main` check generated assets and JavaScript syntax, run the Jest suite, and exercise the mobile planner in Chromium. Local browser tests use Python 3 to serve the static files.

```bash
npm ci
npm run build
npm test
bash test.sh
npx playwright install chromium
npm run test:browser
```
