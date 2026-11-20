const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

test('a city containing contact details stays out of storage and geocoding', async ({page}) => {
  let requests = 0;
  await page.route('https://nominatim.openstreetmap.org/**', route => {
    requests++;
    return route.fulfill({json:[]});
  });
  await page.goto('/');
  await page.locator('#areaButton').tap();
  await page.locator('#searchCity').fill('Demo City, phone: 0000000001');
  expect(await page.evaluate(() => localStorage.getItem('route-optimizer-search-city'))).toBeNull();
  await page.locator('#closeArea').tap();
  await page.locator('[data-step="1"] [data-step-toggle]').tap();
  await page.locator('#startAddressInput').fill('Sample Park');
  await page.locator('#setStartLocationBtn').tap();
  await expect(page.locator('#startSuggestions')).toContainText('שם עיר בלבד');
  expect(requests).toBe(0);
});

test('GPS is requested on tap, stays out of storage, and biases a search only after confirmation', async ({page, context}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({latitude: 32.321234, longitude: 34.856789});
  await page.addInitScript(() => {
    window.locationRequests = 0;
    const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = (...args) => { window.locationRequests++; original(...args); };
  });
  const requests = [];
  await page.route('https://nominatim.openstreetmap.org/**', route => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({json: [{display_name: 'Park, Example City', lat: '32.3', lon: '34.85',
      address: {city: 'Example City', leisure: 'Park'}}]});
  });
  await page.goto('/');
  expect(await page.evaluate(() => window.locationRequests)).toBe(0);
  await page.locator('#areaButton').tap();
  await page.locator('#locateSearchArea').tap();
  await expect(page.locator('#searchAreaStatus')).toContainText('פעיל');
  expect(await page.evaluate(() => window.locationRequests)).toBe(1);
  expect(requests).toHaveLength(0);
  await page.locator('#closeArea').tap();
  await expect(page.locator('#areaButton')).toContainText('בקרבת מקום');
  await page.locator('[data-step="1"] [data-step-toggle]').tap();
  await page.locator('#startAddressInput').fill('Park');
  await page.locator('#setStartLocationBtn').tap();
  await expect(page.locator('#startSuggestions button')).toBeVisible();
  expect(requests.length).toBe(1);
  expect(requests[0].searchParams.get('viewbox')).toBeTruthy();
  expect(requests[0].href).not.toMatch(/32\.321234|34\.856789/);
  await page.locator('#areaButton').tap();
  await page.locator('#searchCity').fill('Example City');
  await expect(page.locator('#startSuggestions button')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#areaButton')).toContainText('Example City');
  await page.locator('#areaButton').tap();
  await expect(page.locator('#searchCity')).toHaveValue('Example City');
  expect(await page.evaluate(() => window.locationRequests)).toBe(0);
  await page.locator('#clearSearchArea').tap();
  await page.locator('#closeArea').tap();
  await page.locator('#startAddressInput').fill('Park');
  await page.locator('#setStartLocationBtn').tap();
  await expect(page.locator('#startSuggestions button')).toBeVisible();
  expect(requests.at(-1).searchParams.has('viewbox')).toBe(false);
});

test('denied GPS leaves the optional city and manual search available', async ({page}) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, failure) => failure({code: 1});
  });
  await page.goto('/');
  await page.locator('#areaButton').tap();
  await page.locator('#searchCity').fill('נתניה');
  await page.locator('#locateSearchArea').tap();
  await expect(page.locator('#searchAreaStatus')).toContainText('לא ניתנה הרשאת מיקום');
  await expect(page.locator('#searchCity')).toHaveValue('נתניה');
  await expect(page.locator('#locateSearchArea')).toBeEnabled();
});
