const {test, expect} = require('@playwright/test');

test.use({serviceWorkers: 'block'});

test('every palette has a distinct readable light and dark colour scheme and persists across reload', async ({page}) => {
  await page.emulateMedia({colorScheme: 'dark'});
  await page.goto('./');
  const root = page.locator('html');
  const dialog = page.locator('#appearanceDialog');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(root).toHaveAttribute('data-palette', 'blue');
  await page.locator('#appearanceButton').click();
  await expect(dialog.locator('[data-mode="auto"]')).toHaveAttribute('aria-pressed', 'true');
  const backgrounds = new Set();
  for (const palette of ['blue', 'plum', 'copper']) {
    const colorButton = dialog.locator('[data-palette="' + palette + '"]');
    await colorButton.click();
    await expect(colorButton).toHaveAttribute('aria-pressed', 'true');
    for (const mode of ['dark', 'light']) {
      await dialog.locator('[data-mode="' + mode + '"]').click();
      const values = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        const token = name => style.getPropertyValue('--' + name).trim();
        return {surface:token('paper'), browser:document.querySelector('meta[name="theme-color"]').content,
          scheme:style.colorScheme, ink:token('ink'), muted:token('muted'), hero:token('hero-end'),
          onHero:token('hero-muted'), primary:token('primary'), onPrimary:token('on-primary')};
      });
      expect(values.scheme).toBe(mode);
      expect(values.browser).toBe(values.surface);
      expect(contrast(values.muted, values.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(values.onHero, values.hero)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(values.onPrimary, values.primary)).toBeGreaterThanOrEqual(4.5);
      backgrounds.add(values.surface);
    }
  }
  expect(backgrounds.size).toBe(6);
  await page.locator('#closeAppearance').click();
  await expect(page.locator('#appearanceButton')).toBeFocused();
  await page.reload();
  await expect(root).toHaveAttribute('data-palette', 'copper');
  await expect(root).toHaveAttribute('data-theme', 'light');
  await page.locator('#appearanceButton').click();
  await dialog.locator('[data-mode="auto"]').click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({colorScheme: 'light'});
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(root).toHaveAttribute('data-palette', 'copper');
});

function contrast(foreground, background) {
  function luminance(hex) {
    let channels = hex.slice(1);
    if (channels.length === 3) channels = [...channels].map(c => c + c).join('');
    const parts = channels.match(/../g).map(channel => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return parts[0] * 0.2126 + parts[1] * 0.7152 + parts[2] * 0.0722;
  }
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a,b) + 0.05) / (Math.min(a,b) + 0.05);
}

test('a returning user keeps their legacy explicit theme and can switch to the system setting', async ({page}) => {
  await page.emulateMedia({colorScheme: 'light'});
  await page.addInitScript(() => localStorage.setItem('preferredTheme', 'dark'));
  await page.goto('./');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await page.locator('#appearanceButton').click();
  await expect(page.locator('#appearanceDialog [data-mode=dark]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#appearanceDialog [data-mode=auto]').click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({colorScheme: 'dark'});
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('storage denial still allows theme and palette changes within the current visit', async ({page}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {get() { throw new DOMException('Storage blocked', 'SecurityError'); }});
  });
  await page.goto('./');
  await page.locator('#appearanceButton').click();
  await page.locator('#appearanceDialog [data-mode=dark]').click();
  await page.locator('#appearanceDialog [data-palette=plum]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#appearanceDialog')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'plum');
});
