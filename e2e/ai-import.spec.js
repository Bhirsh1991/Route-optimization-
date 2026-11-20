const {test, expect} = require('@playwright/test');

test.use({serviceWorkers: 'block'});

const city = 'עיר בדיקה';
const road = 'רחוב הדוגמה';
const draftKey = 'route-optimization:draft:v1';
const trip = {startLocation: {lat: 31, lng: 34, address: 'יציאה קודמת'}, intermediateLocations: [],
  endLocation: {lat: 31.1, lng: 34, address: 'סיום קודם'}, optimizedOrder: [0, 1],
  plannerView: 'drive', wazeStopIndex: 0, wazeLaunched: true};

function handoff() {
  const params = new URLSearchParams({route: '1', city, start: road + ' 10'});
  params.append('stop', road + ' 13');
  params.append('stop', road + ' 11');
  params.append('end', road + ' 14');
  return './#' + params;
}

function result(number, offset = 0) {
  return {display_name: number + ', ' + road + ', ' + city + ', ישראל',
    lat: String(32 + number / 1000 + offset), lon: '34.85', category: 'place',
    address: {road, house_number: String(number), city, country: 'ישראל', country_code: 'il'}};
}

async function setup(page, ambiguous = false) {
  const queries = [];
  await page.route('https://nominatim.openstreetmap.org/**', route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    queries.push(query);
    const number = Number(query.match(/\d+/)[0]);
    const records = [result(number)];
    if (ambiguous && number === 13) records.push(result(number, .004));
    return route.fulfill({json:records});
  });
  await page.goto('./');
  await page.evaluate(({key, trip}) => localStorage.setItem(key, JSON.stringify(trip)), {key:draftKey, trip});
  await page.reload();
  return queries;
}

function table(route) {
  const coords = new URL(route.request().url()).pathname.split('/driving/')[1].split(';');
  const lat = coords.map(c => Number(c.split(',')[1]));
  return {code:'Ok', durations:lat.map(a => lat.map(b => Math.abs(a-b)*10000))};
}

test('an AI handoff stays local until accepted and uses the same optimizer for complete numbered addresses', async ({page}) => {
  const queries = await setup(page);
  let tables = 0;
  await page.route('https://router.project-osrm.org/**', route => {
    tables++;
    return route.fulfill({json:table(route)});
  });
  await page.goto(handoff());
  const dialog = page.locator('#aiImportDialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#aiDraftNotice')).toBeVisible();
  await expect(dialog.locator('li')).toHaveCount(4);
  expect(new URL(page.url()).hash).toBe('');
  expect(queries).toHaveLength(0);
  expect(tables).toBe(0);
  await page.locator('#aiImportRun').tap();
  await expect(dialog).toBeHidden({timeout:15000});
  expect(queries).toHaveLength(4);
  expect(tables).toBe(1);
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.locator('#drive')).toBeVisible();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey);
  expect(saved.optimizedOrder).toEqual([0, 2, 1, 3]);
  expect(saved.startLocation.lat).toBeCloseTo(32.01);
  expect(saved.wazeLaunched).toBe(false);
  await page.reload();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#wazeNavigation')).toBeVisible();
});

test('ambiguous pins wait for a choice and keep the original draft intact on dismiss and pending work', async ({page}) => {
  const queries = await setup(page, true);
  await page.goto(handoff());
  await page.locator('#aiImportClose').tap();
  await expect(page.locator('#aiImportRows li')).toHaveCount(0);
  await expect(page.locator('#aiImportCity')).toHaveValue('');
  expect(queries).toHaveLength(0);
  await expect(page.locator('#drive')).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey)).toEqual(trip);
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  await page.route('https://router.project-osrm.org/**', async route => {
    await hold;
    await route.fulfill({json:table(route)}).catch(() => {});
  });
  await page.goto(handoff());
  await page.locator('#aiImportRun').tap();
  const choices = page.locator('#aiImportRows li').nth(1).locator('button');
  await expect(choices).toHaveCount(2, {timeout:10000});
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey)).toEqual(trip);
  const pending = page.waitForRequest('https://router.project-osrm.org/**');
  await choices.nth(1).tap();
  await pending;
  await page.locator('#aiImportClose').tap();
  release();
  await expect(page.locator('#drive')).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey)).toEqual(trip);
  expect(new URL(page.url()).hash).toBe('');
});

test('invalid AI links display a recoverable error and ordinary in-page anchors leave the planner alone', async ({page}) => {
  const queries = await setup(page);
  await page.goto('./#route=1&stop=' + encodeURIComponent('רחוב אחד 8'));
  await expect(page.locator('#aiImportDialog')).toBeVisible();
  await expect(page.locator('#aiImportStatus')).not.toHaveText('');
  await expect(page.locator('#aiImportRun')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.goto('./#driveMaps');
  await expect(page.locator('#aiImportDialog')).toBeHidden();
  expect(queries).toHaveLength(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey)).toEqual(trip);
});

test('an explicit location request biases the staged search without changing saved city or starting a lookup', async ({context, page}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({latitude:32.0102, longitude:34.8501});
  const queries = await setup(page);
  await page.evaluate(city => localStorage.setItem('route-optimizer-search-city', city), city);
  await page.goto(handoff());
  await page.locator('#aiImportLocate').tap();
  await expect(page.locator('#aiImportCity')).toHaveValue('');
  await expect(page.locator('#aiImportArea')).toContainText('המיקום');
  expect(queries).toEqual([]);
  const searched = page.waitForRequest('https://nominatim.openstreetmap.org/**');
  await page.locator('#aiImportRun').tap();
  expect(new URL((await searched).url()).searchParams.get('viewbox')).toBeTruthy();
  await page.locator('#aiImportClose').tap();
  expect(await page.evaluate(() => localStorage.getItem('route-optimizer-search-city'))).toBe(city);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey)).toEqual(trip);
});

test('a disconnected matrix keeps all original stops and retries without repeating the address searches', async ({page}) => {
  const queries = await setup(page);
  let tables = 0;
  await page.route('https://router.project-osrm.org/**', route => {
    const result = table(route);
    if (++tables === 1) result.durations = result.durations.map((row, i) => row.map((_, j) => i === j ? 0 : null));
    return route.fulfill({json:result});
  });
  await page.goto(handoff());
  const run = page.locator('#aiImportRun');
  await run.tap();
  await expect(run).toBeEnabled({timeout:15000});
  await expect(page.locator('#aiImportStatus')).not.toHaveText('');
  expect(queries).toHaveLength(4);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey)).toEqual(trip);
  await run.tap();
  await expect(page.locator('#aiImportDialog')).toBeHidden();
  expect(queries).toHaveLength(4);
  expect(tables).toBe(2);
  expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey)).optimizedOrder).toHaveLength(4);
});

test('two deliveries to the same pin require confirmation and each stays in the Waze itinerary', async ({page}) => {
  await setup(page);
  let tables = 0;
  await page.route('https://router.project-osrm.org/**', route => {
    tables++;
    return route.fulfill({json:table(route)});
  });
  const link = new URL(handoff(), 'http://example.test/');
  const params = new URLSearchParams(link.hash.slice(1));
  params.append('stop', road + ' 13');
  await page.goto('./#' + params);
  await page.locator('#aiImportRun').tap();
  const keep = page.locator('#aiImportKeepRepeats');
  await expect(keep).toBeVisible({timeout:15000});
  expect(tables).toBe(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey)).toEqual(trip);
  // Editing a row dismisses the previous confirmation before a new calculation.
  const repeated = page.locator('#ai-address-3');
  await repeated.fill(road + ' 11');
  await expect(keep).toBeHidden();
  await page.locator('#aiImportRun').tap();
  await expect(keep).toBeVisible();
  await keep.tap();
  await expect(page.locator('#aiImportDialog')).toBeHidden();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey);
  expect(new Set(saved.optimizedOrder).size).toBe(5);
  expect(saved.intermediateLocations[1]).toEqual(saved.intermediateLocations[2]);
  expect(tables).toBe(1);
  await expect(page.locator('#wazeNavigation')).toBeVisible();
});
