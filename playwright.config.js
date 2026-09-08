// @ts-check
const { defineConfig } = require('@playwright/test');
const PORT = Number(process.env.PUA_PORT || 8766);

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30 * 1000,
  // BLK-releaser-20260908-0800: E2E が作った保存フォルダを実行の最後に消す
  globalTeardown: require.resolve('./tests/e2e/global-teardown.js'),
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
  // BLK-releaser-20260908-2030-1: テストの正本はペルソナ台本の手順 (scenarios)。
  // legacy は台本に吸収されるまでの過去の spec 置き場。
  projects: [
    { name: 'scenarios', testDir: './tests/e2e/scenarios' },
    { name: 'legacy', testDir: './tests/e2e/legacy' },
  ],
});
