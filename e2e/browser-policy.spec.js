const {createHash} = require('node:crypto');
const {test, expect} = require('@playwright/test');

test.use({serviceWorkers: 'block'});

test('the planner and guide load their own scripts and styles under their shipped policies', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    window.policyViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.policyViolations.push(event.effectiveDirective));
  });
  for (const [path, connections] of [
    ['./', ["'self'", 'https://nominatim.openstreetmap.org', 'https://router.project-osrm.org']],
    ['./ai/', ["'self'"]]
  ]) {
    await page.goto(path);
    const policyText = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    const policy = new Map(policyText.split(';').map(directive => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    }));
    expect(policy.get('connect-src')).toEqual(connections);
    for (const directive of ['default-src', 'form-action', 'base-uri', 'object-src', 'script-src-attr', 'style-src-attr']) {
      expect(policy.get(directive)).toEqual(["'none'"]);
    }
    for (const [tag, directive] of [['script:not([src])', 'script-src'], ['style', 'style-src']]) {
      const blocks = await page.locator(tag).allTextContents();
      const hashes = blocks.map(text => "'sha256-" + createHash('sha256').update(text).digest('base64') + "'");
      expect(policy.get(directive)).toEqual(["'self'", ...hashes]);
    }
    if (path === './') {
      await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'strict-origin');
      await page.locator('#appearanceButton').tap();
      await expect(page.locator('#appearanceDialog')).toBeVisible();
    } else {
      await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
      await page.locator('#copyPrompt').tap();
      await expect(page.locator('#copyStatus')).toContainText('הועתקה');
    }
    expect(await page.evaluate(() => window.policyViolations)).toEqual([]);
  }
});
