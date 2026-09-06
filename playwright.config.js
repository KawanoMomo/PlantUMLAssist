// @ts-check
const { defineConfig } = require('@playwright/test');
const PORT = Number(process.env.PUA_PORT || 8766);

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30 * 1000,
  webServer: {
    command: 'python server.py',
    port: PORT,
    reuseExistingServer: true,
    timeout: 10 * 1000,
    env: { PUA_PORT: String(PORT) },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
});
