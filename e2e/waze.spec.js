const { test, expect } = require('@playwright/test');

test.use({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, serviceWorkers: 'block'});

const points = [0, 1, 2, 3].map(i => ({address: 'יעד בדיקה ' + i, lat: 31 + i / 100, lng: 35}));

async function restore(page, trip) {
  await page.goto('./');
  await page.evaluate(trip => localStorage.setItem('route-optimization:draft:v1', JSON.stringify(trip)), trip);
  await page.reload();
}

async function launch(context, link) {
  const opened = context.waitForEvent('page');
  await link.tap();
  const waze = await opened;
  await waze.waitForURL('https://waze.com/**');
  const url = new URL(waze.url());
  await waze.close();
  expect(url.searchParams.get('navigate')).toBe('yes');
  return url.searchParams.get('ll');
}

test('Waze opens each destination in optimized order and remembers the current stop after reload', async ({page, context}) => {
  await context.route('https://waze.com/**', route => route.fulfill({body: 'Waze destination'}));
  await restore(page, {
    startLocation: points[0], intermediateLocations: [points[2], points[1]], endLocation: points[3],
    optimizedOrder: [0, 2, 1, 3]
  });
  const section = page.locator('#wazeNavigation');
  const status = section.locator('[data-waze-status]');
  const primary = section.locator('a.primary:visible');
  const reopen = section.getByRole('link', {name: /פתיחה חוזרת/});
  const previous = page.getByRole('button', {name: 'חזרה ליעד הקודם'});
  const timeline = page.locator('#optimizedRouteList [aria-current="step"] .address');
  await expect(status).toHaveText('יעד 1 מתוך 3 · יעד בדיקה 1');
  await expect(timeline).toHaveText('יעד בדיקה 1');
  await expect(previous).toBeHidden();
  expect(await launch(context, primary)).toBe('31.01,35');
  await expect(status).toHaveText('יעד 1 מתוך 3 · יעד בדיקה 1');
  await expect(primary).toHaveAccessibleName(/ניווט ליעד הבא/);
  expect(await launch(context, primary)).toBe('31.02,35');
  await page.reload();
  await expect(status).toHaveText('יעד 2 מתוך 3 · יעד בדיקה 2');
  await expect(timeline).toHaveText('יעד בדיקה 2');
  await expect(primary).toHaveAccessibleName(/ניווט ליעד הבא/);
  expect(await launch(context, reopen)).toBe('31.02,35');
  await previous.tap();
  await expect(status).toHaveText('יעד 1 מתוך 3 · יעד בדיקה 1');
  expect(await launch(context, section.getByRole('link', {name: /ניווט ליעד הבא/}))).toBe('31.02,35');
  expect(await launch(context, primary)).toBe('31.03,35');
  await expect(status).toHaveText('יעד 3 מתוך 3 · יעד בדיקה 3');
  await expect(reopen).toBeVisible();
  await section.getByRole('button', {name: 'סיום המסלול'}).tap();
  await expect(timeline).toHaveCount(0);
  await page.reload();
  await expect(status).toHaveText('המסלול הושלם');
  await section.getByRole('button', {name: 'התחלה מחדש'}).tap();
  await expect(status).toHaveText('יעד 1 מתוך 3 · יעד בדיקה 1');
  expect(await launch(context, primary)).toBe('31.01,35');
});

test('with no fixed origin the first stop is a destination, and editing a trip resets progress', async ({page}) => {
  await page.route('https://router.project-osrm.org/**', route => route.fulfill({json: {
    code: 'Ok', durations: [[0, 1], [1, 0]]
  }}));
  await restore(page, {
    intermediateLocations: [points[1], points[2]], endLocation: points[3],
    optimizedOrder: [1, 0, 2], wazeStopIndex: 100, activeStep: 3
  });
  const section = page.locator('#wazeNavigation');
  await expect(section.locator('[data-waze-status]')).toHaveText('יעד 1 מתוך 3 · יעד בדיקה 2');
  await page.locator('#tab-plan').tap();
  await page.getByRole('button', {name: 'הסר את יעד בדיקה 2'}).tap();
  await expect(section).toBeHidden();
  await page.locator('#optimizeRouteBtn').tap();
  await expect(section.locator('[data-waze-status]')).toHaveText('יעד 1 מתוך 2 · יעד בדיקה 1');
});
