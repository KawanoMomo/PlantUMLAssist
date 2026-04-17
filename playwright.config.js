// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30 * 1000,
  webServer: {
    command: 'python server.py',
    port: 8766,
    reuseExistingServer: true,
    timeout: 10 * 1000,
  },
  use: {
    baseURL: 'http://127.0.0.1:8766',
    trace: 'on-first-retry',
  },
});
