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
  await expect(page.locator('#mapsFallbackNote')).toBeVisible();
});

test('five stops survive Google Maps export, draft restoration and named save/load', async ({ page, context }) => {
  test.setTimeout(60000);
  const queries = await mockSearch(page);
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
  const ordered = Array.from({length: 7}, (_, i) => (i + 1) + '. Stop ' + i);
  await expect(page.locator('#optimizedRouteList li')).toHaveText(ordered);
  expect(queries).toHaveLength(7);
  expect(requests).toHaveLength(1);

  const newPage = context.waitForEvent('page');
  await page.locator('#openInGoogleMapsBtn').tap();
  const maps = await newPage;
  await maps.waitForURL('https://www.google.com/maps/**');
  const params = new URL(maps.url()).searchParams;
  const named = [params.get('origin'), ...params.get('waypoints').split('|'), params.get('destination')];
  expect(named).toHaveLength(7);
  named.forEach((name, i) => {
    expect(name).toContain('Stop');
    expect(name).toContain(String(i));
    expect(name).toContain('Testville');
  });
  await maps.close();

  await page.locator('#mapsSegments summary').tap();
  const segments = page.locator('#mapsSegmentLinks a');
  await expect(segments).toHaveCount(2);
  const urls = await segments.evaluateAll(links => links.map(link => link.href));
  const stops = urls.map(url => {
    const p = new URL(url).searchParams;
    return [p.get('origin'), ...p.get('waypoints').split('|'), p.get('destination')];
  });
  expect(stops[0]).toEqual(named.slice(0, 5));
  expect(stops[1]).toEqual(named.slice(4));
  await page.locator('#mapsExact').check();
  const exact = new URL(await page.locator('#openInGoogleMapsBtn').getAttribute('href')).searchParams;
  expect(exact.get('origin')).toBe('31,35');
  expect(exact.get('waypoints').split('|')).toEqual([1, 2, 3, 4, 5].map(i => point(i).lat + ',35'));
  expect(exact.get('destination')).toBe('31.06,35');
  const exactSegment = new URL(await segments.nth(1).getAttribute('href')).searchParams;
  expect(exactSegment.get('origin')).toBe('31.04,35');
  expect(exactSegment.get('waypoints')).toBe('31.05,35');

  await page.reload();
  await expect(page.locator('#optimizedRouteList li')).toHaveText(ordered);
  await expect(page.locator('#openInGoogleMapsBtn')).toBeVisible();
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
  await expect(page.locator('#optimizedRouteList li')).toHaveText(ordered);
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
  await expect(page.locator('#optimizedRouteList')).toContainText('אין מסלול נסיעה');
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
  await page.locator('[data-step="3"] [data-step-toggle]').tap();
  await page.locator('summary').filter({hasText: 'WhatsApp'}).tap();
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
