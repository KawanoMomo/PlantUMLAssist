// @ts-check
const { defineConfig } = require('@playwright/test');
const servers = require('./tests/e2e/servers.js');

// BLK-releaser-20260908-2030-2 — worker ごとに別ポートのサーバを使う。
// Playwright は config を worker プロセスでも読み直し、そのとき TEST_PARALLEL_INDEX が
// 入っている。globalSetup が書いた割り当て(test-results/e2e-ports.json)を引いて
// worker ごとの baseURL を作るので、spec 側は goto('/') のままでよい。
const PARALLEL_INDEX = Number(process.env.TEST_PARALLEL_INDEX || 0);
const PORT = servers.portForParallelIndex(PARALLEL_INDEX);

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30 * 1000,
  // BLK-builder-20260924-2152-3b: Playwright は起動のたびに outputDir を丸ごと消す。既定の test-results/ だと
  // unit が書いた test-results/corpus-roundtrip.json (metrics.py の往復テストの結果) まで消えるので、専用の下位に寄せる。
  outputDir: './test-results/e2e',
  // worker 1 つにつきサーバ 1 台を立てるので、既定値(CPU 数の半分)ではなく明示する。
  // PUA_WORKERS で変えられる。--workers はこれより優先される
  workers: Number(process.env.PUA_WORKERS || 4),
  // BLK-releaser-20260908-0800: E2E が作った保存フォルダを実行の最後に消す
  // BLK-releaser-20260908-2030-2: サーバの起動/停止も globalSetup/globalTeardown で行う
  globalSetup: require.resolve('./tests/e2e/global-setup.js'),
  globalTeardown: require.resolve('./tests/e2e/global-teardown.js'),
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
