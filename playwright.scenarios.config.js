// @ts-check
// ペルソナ台本の scenario (tests/scenarios/{persona}-{手順}-{場面}.spec.js) 用の設定。
// 既存の e2e (playwright.config.js、testDir: tests/e2e) はそのまま残し、ここでは testDir だけ替える。
// サーバの起こし方 (worker ごとに PUA_DATA_ROOT 付きの server.py) と baseURL は e2e と同じ。
// 通常は scripts/verify.ps1 から呼ぶ。直接回すなら:
//   npx playwright test --config playwright.scenarios.config.js
const { defineConfig } = require('@playwright/test');
// e2e の projects (tests/e2e/scenarios と legacy) は持ち込まない。
// eslint-disable-next-line no-unused-vars
const { projects, ...base } = require('./playwright.config.js');

module.exports = defineConfig({
  ...base,
  testDir: './tests/scenarios',
  outputDir: './test-results/scenarios',
  timeout: 60 * 1000,
});
