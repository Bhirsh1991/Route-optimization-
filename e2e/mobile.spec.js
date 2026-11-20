const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });

function point(number, name = 'Stop ' + number) {
  return {display_name: name, lat: String(31 + number / 100), lon: '35',
    address: {road: 'Stop', house_number: String(number), city: 'Testville', country: 'Testland'}};
}

async function mockSearch(page, candidates = query => [point(Number(query.split(' ').at(-1)), query)]) {
  const queries = [];
  await page.route('https://nominatim.openstreetmap.org/**', async route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    queries.push(query);
    await route.fulfill({json: candidates(query)});
  });
  return queries;
}

async function selectAddress(page, field, query, choice = 0) {
  const searchButton = {start: 'setStartLocationBtn', end: 'setEndLocationBtn', intermediate: 'addIntermediateLocationBtn'}[field];
  const input = page.locator('#' + field + 'AddressInput');
  if (!await input.isVisible()) {
    const step = {start: 1, end: 2, intermediate: 3}[field];
    await page.locator('[data-step="' + step + '"] [data-step-toggle]').tap();
  }
  await input.fill(query);
  await page.locator('#' + searchButton).tap();
  await page.locator('#' + field + 'Suggestions button').nth(choice).tap();
  await expect(input).toHaveValue('');
}

function roadMatrix(url) {
  const coords = new URL(url).pathname.split('/driving/')[1].split(';');
  const positions = coords.map(c => Math.round((Number(c.split(',')[1]) - 31) * 100));
  return {code: 'Ok', durations: positions.map(from => positions.map(to => Math.abs(from - to)))};
}

function mapsPoints(url) {
  const params = new URL(url).searchParams;
  const via = params.get('waypoints');
  return [params.get('origin'), ...(via ? via.split('|') : []), params.get('destination')];
}

test('restoring a previous-release trip retains qualified names and exact fallback', async ({page}) => {
  await page.addInitScript(() => {
    const startLocation = {lat: 31, lng: 35, address: 'Example Road 3', fullAddress: '3, Example Road, Sample City, Testland'};
    const endLocation = {lat: 31.02, lng: 35, address: 'Another Road (ללא מספר)', fullAddress: 'Another Road, Sample City, Testland'};
    localStorage.setItem('route-optimization:draft:v1', JSON.stringify({
      startLocation, endLocation, intermediateLocations: [], optimizedOrder: [0, 1]
    }));
  });
  await page.goto('./');
  const link = page.locator('#openInGoogleMapsBtn');
  await expect(link).toBeVisible();
  const urls = new URL(await link.getAttribute('href')).searchParams;
  expect(urls.get('origin')).toBe('3 Example Road, Sample City, Testland');
  expect(urls.get('destination')).toBe('31.02,35');
  await expect(page.locator('#mapsAlternate')).toHaveText('פתיחת המסלול לפי מיקום מדויק');
  expect(mapsPoints(await page.locator('#mapsAlternate').getAttribute('href'))).toEqual(['31,35', '31.02,35']);
  await expect(page.locator('#mapsFallbackNote')).toBeVisible();
  await expect(page.locator('#mapsLegs')).toBeHidden();
});

test('five stops survive Google Maps export, draft restoration and named save/load', async ({ page, context }) => {
  test.setTimeout(60000);
  const queries = await mockSearch(page, query => {
    const item = point(Number(query.split(' ').at(-1)), query);
    if (query === 'Stop 2') delete item.address.city;
    return [item];
  });
  const requests = [];
  await page.route('https://router.project-osrm.org/**', route => {
    requests.push(route.request().url());
    return route.fulfill({json: roadMatrix(route.request().url())});
  });
  await context.route('https://www.google.com/maps/**', route => route.fulfill({body: 'Maps test destination'}));
  await page.goto('./');
  await selectAddress(page, 'start', 'Stop 0');
  await selectAddress(page, 'end', 'Stop 6');
  for (const number of [3, 1, 5, 2, 4]) await selectAddress(page, 'intermediate', 'Stop ' + number);
  const moveUp = page.getByRole('button', {name: 'העלה את Stop 1', exact: true});
  const touchTarget = await moveUp.boundingBox();
  expect(touchTarget.width).toBeGreaterThanOrEqual(44);
  expect(touchTarget.height).toBeGreaterThanOrEqual(44);
  await moveUp.tap();
  await expect(page.locator('#intermediateLocationsList .chip').first()).toContainText('Stop 1');

  await page.locator('#optimizeRouteBtn').tap();
  const ordered = Array.from({length: 7}, (_, i) => 'Stop ' + i);
  const orderedAddresses = page.locator('#optimizedRouteList li .address b');
  await expect(orderedAddresses).toHaveText(ordered);
  expect(queries).toHaveLength(7);
  expect(requests).toHaveLength(1);

  async function openMaps(link) {
    const newPage = context.waitForEvent('page');
    await link.tap();
    const maps = await newPage;
    await maps.waitForURL('https://www.google.com/maps/**');
    const stops = mapsPoints(maps.url());
    await maps.close();
    return stops;
  }
  const primary = page.locator('#openInGoogleMapsBtn');
  await expect(primary).toHaveAttribute('aria-label', /כל 7 הנקודות/);
  const exact = Array.from({length: 7}, (_, i) => point(i).lat + ',35');
  expect(await openMaps(primary)).toEqual(exact);
  const namesLink = page.getByRole('link', {name: 'פתיחת המסלול לפי שמות הכתובות', exact: true});
  const named = Array.from({length: 7}, (_, i) => 'Stop ' + i + ', Testville, Testland');
  named[2] = exact[2];
  expect(await openMaps(namesLink)).toEqual(named);

  await expect(page.locator('#mapsLegs')).not.toHaveAttribute('open', '');
  await page.locator('#mapsLegs summary').tap();
  const legs = page.locator('#mapsLegLinks a');
  await expect(legs).toHaveCount(6);
  const legUrls = await legs.evaluateAll(links => links.map(link => link.href));
  expect(legUrls.every(url => !new URL(url).searchParams.has('waypoints'))).toBe(true);
  expect(legUrls.map(mapsPoints)).toEqual(named.slice(1).map((stop, i) => [named[i], stop]));
  expect(await openMaps(page.getByRole('link', {name: 'נסיעה 2 מתוך 6 · Stop 2', exact: true})))
    .toEqual([named[1], exact[2]]);

  await page.locator('#mapsSegments summary').tap();
  const segments = page.locator('#mapsSegmentLinks a');
  await expect(segments).toHaveCount(4);
  const urls = await segments.evaluateAll(links => links.map(link => link.href));
  expect(urls.map(mapsPoints)).toEqual([exact.slice(0, 5), named.slice(0, 5), exact.slice(4), named.slice(4)]);

  await page.reload();
  await expect(orderedAddresses).toHaveText(ordered);
  await expect(page.locator('#openInGoogleMapsBtn')).toBeVisible();
  expect(mapsPoints(await primary.getAttribute('href'))).toEqual(exact);
  await page.locator('#tab-plan').tap();
  await page.locator('[data-step="4"] [data-step-toggle]').tap();
  await page.locator('#saveRouteNameInput').fill('סידורים <יום חמישי>');
  await page.locator('#saveRouteBtn').tap();
  await expect(page.locator('#saveSuccess')).toBeVisible();
  await expect(page.locator('#savedRoutesCount')).toHaveText('1');
  const saveHeading = page.locator('[data-step="4"] .step-title');
  const visibleAfterScroll = await saveHeading.evaluate(title => {
    window.scrollTo(0, window.scrollY + title.getBoundingClientRect().top - 24);
    const bounds = title.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.right - 2, bounds.top + bounds.height / 2);
    return hit?.closest('button') === title.closest('button');
  });
  expect(visibleAfterScroll).toBe(true);
  await page.locator('[data-step="3"] [data-step-toggle]').tap();
  await page.getByRole('button', {name: 'הסר את Stop 2', exact: true}).tap();
  await expect(page.locator('#openInGoogleMapsBtn')).toBeHidden();
  await page.locator('#savedRoutesToggleBtn').tap();
  await expect(page.getByRole('dialog')).toContainText('סידורים <יום חמישי>');
  await page.getByRole('button', {name: 'טען', exact: true}).tap();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.locator('#tab-drive').tap();
  await expect(orderedAddresses).toHaveText(ordered);
});

test('an over-limit Maps route opens ordered segments with every stop in both formats', async ({page}) => {
  const points = Array.from({length: 12}, (_, i) => ({
    lat: 31 + i / 100, lng: 35, address: 'Stop ' + i, mapsAddress: 'Stop ' + i + ', Testville'
  }));
  await page.addInitScript(stops => {
    localStorage.setItem('route-optimization:draft:v1', JSON.stringify({
      startLocation: stops[0], endLocation: stops.at(-1), intermediateLocations: stops.slice(1, -1),
      optimizedOrder: stops.map((_, i) => i)
    }));
  }, points);
  await page.goto('./');
  await expect(page.locator('#openInGoogleMapsBtn')).toBeHidden();
  await expect(page.locator('#mapsAlternate')).toBeHidden();
  await expect(page.locator('#mapsSegments')).toHaveAttribute('open', '');
  await expect(page.locator('#mapsFallbackNote')).toContainText('פתחו את המקטעים לפי הסדר');
  const links = page.locator('#mapsSegmentLinks');
  for (const [label, expected] of [
    ['לפי מיקום', points.map(p => p.lat + ',' + p.lng)],
    ['לפי שמות', points.map(p => p.mapsAddress)]
  ]) {
    const urls = await links.getByRole('link').filter({hasText: label}).evaluateAll(items => items.map(a => a.href));
    expect(urls).toHaveLength(3);
    expect(urls.flatMap((url, i) => mapsPoints(url).slice(i ? 1 : 0))).toEqual(expected);
  }
});

test('saving fails visibly when storage is full and preserves the typed name', async ({ page }) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'savedRoutes') throw new DOMException('Storage full', 'QuotaExceededError');
      return set.call(this, key, value);
    };
  });
  await mockSearch(page);
  await page.goto('./');
  await selectAddress(page, 'start', 'Stop 0');
  await page.locator('[data-step="4"] [data-step-toggle]').tap();
  await page.locator('#saveRouteNameInput').fill('טיוטה');
  await page.locator('#saveRouteBtn').tap();
  await expect(page.locator('#messageBox')).toContainText('לא ניתן לשמור');
  await expect(page.locator('#saveSuccess')).toBeHidden();
  await expect(page.locator('#saveRouteNameInput')).toHaveValue('טיוטה');
  await expect(page.locator('#savedRoutesCount')).toHaveText('0');
});

test('a late route response cannot undo an edit, and a disconnected route has no Maps link', async ({ page }) => {
  await mockSearch(page);
  // Keep the first fetch alive past cancellation to exercise stale-result protection as well as abort.
  await page.addInitScript(() => {
    const realFetch = window.fetch;
    window.fetch = (input, options) => String(input).includes('router.project-osrm.org')
      ? realFetch(input, {...options, signal: undefined}) : realFetch(input, options);
  });
  let releaseFirst;
  const held = new Promise(resolve => { releaseFirst = resolve; });
  let calls = 0;
  await page.route('https://router.project-osrm.org/**', async route => {
    if (++calls === 1) {
      await held;
      return route.fulfill({json: roadMatrix(route.request().url())});
    }
    return route.fulfill({json: {code: 'Ok', durations: [[0, null], [1, 0]]}});
  });
  await page.goto('./');
  await selectAddress(page, 'start', 'Stop 0');
  await selectAddress(page, 'end', 'Stop 6');
  await selectAddress(page, 'intermediate', 'Stop 2');
  const started = page.waitForRequest('https://router.project-osrm.org/**');
  await page.locator('#optimizeRouteBtn').tap();
  await started;
  await page.getByRole('button', {name: 'הסר את Stop 2', exact: true}).tap();
  const finished = page.waitForResponse('https://router.project-osrm.org/**');
  releaseFirst();
  await (await finished).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator('#openInGoogleMapsBtn')).toBeHidden();
  await expect(page.locator('#optimizedRouteList')).not.toContainText('Stop 2');
  await page.locator('#optimizeRouteBtn').tap();
  await expect(page.locator('#calculationStatus')).toContainText('אין מסלול נסיעה');
  await expect(page.locator('#openInGoogleMapsBtn')).toBeHidden();
});

test('WhatsApp stays local through preview, then uses the selected Hebrew address coordinates', async ({ page }) => {
  const query = 'רחוב צה"ל 4';
  const common = query + ', מרכז, ישראל';
  const candidates = ['אזור א', 'אזור ב'].map((area, index) => ({
    ...point(index === 0 ? 2 : 4, common + ', ' + area),
    address: {road: 'רחוב צה"ל', house_number: '4', city: area, country: 'ישראל'}
  }));
  const queries = await mockSearch(page, q => q === query ? candidates : [point(6, q)]);
  const tableUrls = [];
  await page.route('https://router.project-osrm.org/**', route => {
    tableUrls.push(route.request().url());
    return route.fulfill({json: roadMatrix(route.request().url())});
  });
  await page.goto('./');
  await page.locator('#importToggle').tap();
  await page.locator('#importMessage').fill('שם: ישראל ישראלי\nטלפון: 050-1234567\nכתובת: ' + query);
  await page.locator('#previewMessageBtn').tap();
  await expect(page.locator('#importRows input')).toHaveValue(query);
  expect(queries).toEqual([]);
  await page.getByRole('button', {name: 'חפש כתובת זו'}).tap();
  await page.getByRole('button', {name: common + ', אזור ב', exact: true}).tap();
  await expect(page.locator('#intermediateLocationsList')).toContainText(common);
  expect(queries).toEqual([query]);
  await page.locator('[data-step="2"] [data-step-toggle]').tap();
  await selectAddress(page, 'end', 'Stop 6');
  await page.locator('#optimizeRouteBtn').tap();
  await expect(page.locator('#openInGoogleMapsBtn')).toBeVisible();
  expect(new URL(tableUrls[0]).pathname).toMatch(/\/driving\/35,31\.04;35,31\.06$/);
  expect(queries).toEqual([query, 'Stop 6']);
});
