const { test, expect } = require('@playwright/test');

test('reopens the installed planner offline with local styles and scripts', async ({page, context}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once: true}));
    }
  });
  const cached = await page.evaluate(async () => {
    const name = (await caches.keys()).find(key => key.startsWith('route-optimizer:'));
    const cache = await caches.open(name);
    return (await cache.keys()).map(item => new URL(item.url).pathname);
  });
  expect(cached).toEqual(expect.arrayContaining(['/index.html', '/assets/planner.css', '/src/appearance.js', '/src/address-picker.js']));
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#importToggle')).toBeVisible();
  await expect(page.locator('#endAddressInput')).toBeHidden();
  await page.locator('#appearanceButton').tap();
  await page.locator('[data-mode="dark"]').tap();
  await page.locator('button[data-palette="copper"]').tap();
  await page.locator('#closeAppearance').tap();
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'copper');
  await page.locator('[data-step="3"] [data-step-toggle]').tap();
  await expect(page.locator('#intermediateAddressInput')).toBeVisible();
});
