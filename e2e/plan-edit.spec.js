const {test, expect} = require('@playwright/test');

test.use({serviceWorkers: 'block'});

test('replacing a stop preserves the reordered list and requires a distinct selected address', async ({page}) => {
  test.setTimeout(60000);
  const points = [1, 2].map(n => ({address: 'Stop ' + n, lat: 31 + n / 100, lng: 35}));
  await page.goto('./');
  await page.evaluate(stops => localStorage.setItem('route-optimization:draft:v1',
    JSON.stringify({intermediateLocations: stops})), points);
  await page.reload();
  await page.route('https://nominatim.openstreetmap.org/**', route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    const n = Number(query.slice(-1));
    return route.fulfill({json: [{display_name: query, lat: 31 + n / 100, lon: 35, address: {road:'Stop', house_number:String(n)}}]});
  });
  const stops = page.locator('#intermediateLocationsList');
  await stops.getByRole('button', {name:'עריכת עצירה 2 · Stop 2'}).tap();
  await stops.getByRole('button', {name:'העלה את Stop 2'}).tap();
  const search = async n => {
    await page.locator('#intermediateAddressInput').fill('Stop ' + n);
    await page.locator('#addIntermediateLocationBtn').tap();
    await page.locator('#intermediateSuggestions button').first().tap();
  };
  await search(1);
  await expect(page.locator('#messageBox')).toContainText('כבר מופיע');
  await expect(stops.locator('.address')).toHaveText(['Stop 2','Stop 1']);
  await search(3);
  await expect(stops.locator('.address')).toHaveText(['Stop 3','Stop 1']);
  await page.reload();
  await expect(stops.locator('.address')).toHaveText(['Stop 3','Stop 1']);
});
