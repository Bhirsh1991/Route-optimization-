const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

test('pasting previews locally and guided search waits for each address selection', async ({page}) => {
  const queries = [];
  await page.route('https://nominatim.openstreetmap.org/**', async route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    queries.push(query);
    const house = query.match(/\d+/)[0];
    await route.fulfill({ json: [{
      display_name: query, address: {house_number: house},
      lat: String(32 + Number(house) / 100), lon: '35'
    }] });
  });
  await page.goto('./');
  await page.locator('[data-step="3"] [data-step-toggle]').tap();
  await page.locator('summary').filter({hasText: 'WhatsApp'}).tap();
  const list = page.locator('#importRows');
  const guide = page.locator('#guidedImportBtn');
  await page.locator('#importMessage').fill([
    '[09:00, 1/2] דוגמה: אלפא הדגמה', 'כתובת- שביל הדמיון 1 דירה 5 קומה 3', '0000000001',
    '[09:00, 1/2] דוגמה: שם- *בטא* *הדגמה*', 'שביל הבדיקה 2', 'נייד 0000000002'
  ].join('\\\n'));

  await expect(list.locator('input')).toHaveCount(2);
  await expect(list.locator('input').first()).toHaveValue('שביל הדמיון 1');
  await expect(list).toContainText('דירה 5');
  await list.locator('input').last().fill('שביל הבדיקה 22');
  await page.getByRole('button', {name:'הצג כתובות לבדיקה'}).tap();
  await expect(list.locator('input').last()).toHaveValue('שביל הבדיקה 22');
  expect(queries).toEqual([]);

  await guide.tap();
  const first = list.getByRole('button', {name:'שביל הדמיון 1', exact:true});
  await expect(first).toBeVisible();
  expect(queries).toEqual(['שביל הדמיון 1']);
  await guide.tap();
  await expect(first).toHaveCount(0);
  await expect(list.locator('input')).toHaveCount(2);
  await guide.tap();
  await first.tap();
  await list.getByRole('button', {name:'שביל הבדיקה 22', exact:true}).tap();
  expect(queries).toEqual(['שביל הדמיון 1', 'שביל הבדיקה 22']);
  await expect(list.locator('input')).toHaveCount(0);
  await expect(page.locator('#intermediateLocationsList .chip')).toHaveCount(2);
});
