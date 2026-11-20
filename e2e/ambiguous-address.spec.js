const { test, expect } = require('@playwright/test');

test.use({serviceWorkers: 'block'});

test('distant address matches can be checked on the map before choosing a neighbourhood', async ({page, context}) => {
  await context.route('https://www.openstreetmap.org/**', route => route.fulfill({body: 'Map preview'}));
  await page.goto('/');
  await page.evaluate(() => {
    RouteGeocode.findAddresses = async () => [
      {fullAddress: '42, רחוב דוגמה, אזור צפון, עיר בדיקה', address: 'רחוב דוגמה 42, אזור צפון',
        localityDetail: 'אזור צפון', lat: 32.1, lng: 34.8, ambiguous: true},
      {fullAddress: 'חנות דוגמה, רחוב דוגמה 42, אזור דרום, עיר בדיקה', address: 'רחוב דוגמה 42, אזור דרום',
        localityDetail: 'אזור דרום', placeName: 'חנות דוגמה', lat: 32.09, lng: 34.81, ambiguous: true, referenceMatched: true}
    ];
  });
  const input = page.locator('#startAddressInput');
  await page.locator('[data-step="1"] [data-step-toggle]').tap();
  await input.fill('רחוב דוגמה 42');
  await page.locator('#setStartLocationBtn').tap();
  const results = page.locator('#startSuggestions');
  await expect(results).toContainText('נקודות מרוחקות');
  const north = results.getByRole('button', {name: /אזור צפון/});
  const south = results.getByRole('button', {name: /אזור דרום/});
  await expect(north).toHaveCount(1);
  await expect(south).toContainText('מקום בכתובת · חנות דוגמה');
  await expect(south).toContainText('תואם למאגר כתובות נוסף');
  expect((await south.innerText()).match(/אזור דרום/g)).toHaveLength(1);
  expect((await south.innerText()).match(/חנות דוגמה/g)).toHaveLength(1);
  const preview = context.waitForEvent('page');
  await results.getByRole('link', {name: /בדוק במפה.*אזור דרום/}).tap();
  const map = await preview;
  await map.waitForURL('https://www.openstreetmap.org/**');
  const url = new URL(map.url());
  expect(url.searchParams.get('mlat')).toEqual('32.09');
  expect(url.searchParams.get('mlon')).toEqual('34.81');
  expect(url.hash).toEqual('#map=19/32.09/34.81');
  await map.close();
  await expect(input).toHaveValue('רחוב דוגמה 42');
  await expect(page.locator('#startStepStatus')).not.toContainText('אזור דרום');
  await south.tap();
  await expect(page.locator('#startStepStatus')).toContainText('אזור דרום');
});
