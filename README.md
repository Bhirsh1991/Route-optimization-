# Route Optimization

A simple web application for planning an optimal travel route.

**Live demo:** https://bhirsh1991.github.io/Route-optimization-/

## Usage

1. Open the [planner](https://bhirsh1991.github.io/Route-optimization-/). Optionally enter one city for the trip or tap the location button to prioritize nearby results. The browser requests permission on that tap. The planner keeps an approximate location in memory for this visit and shares a search area when you search.
2. Search for and select a start, end or intermediate address. For a delivery list, paste the copied WhatsApp messages, including timestamps and line breaks, in the import section. Review the extracted addresses and select each match. Contact and delivery details in the preview stay on the device.
3. Compute the route. The planner minimizes travel time according to the OSRM driving matrix for up to 14 intermediate stops and uses a nearest-neighbor estimate for larger trips.
4. For multi-stop trips, open the complete route in Google Maps using the selected pins. You can also open a link using readable addresses, or use shorter segments in a mobile browser. If Android shows just the first leg of a named route, expand the one-address-at-a-time option and open each leg in order.
5. For turn-by-turn trips on Waze, open the first destination, then return to the planner to open the next one. The planner keeps your place when you return or reload.
6. Your draft and its last calculated order are stored in this browser. Save a named route to keep multiple trips.

For numbered addresses in Netanya the planner cross-checks map pins against a local city extract. When records disagree, it can show multiple choices for inspection. The extract is downloaded on demand. [Data source, date and attribution](data/README.md)

## Interface Highlights

- Plan a trip in **תכנון** and follow the optimized stop sequence in **בדרך**. The WhatsApp importer is at the top of the planning screen.
- Open **עיצוב** to choose deep blue and sky, purple and plum, or orange and copper. Each palette supports light mode, dark mode, and the device setting. The browser remembers the palette and display mode on this device using local storage. Existing light/dark choices carry over.
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
