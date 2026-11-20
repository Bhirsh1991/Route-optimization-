const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
  },
  webServer: {
    command: 'python -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173'
  }
});
