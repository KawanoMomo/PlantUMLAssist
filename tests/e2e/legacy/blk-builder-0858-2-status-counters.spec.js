// @ts-check
// BLK-builder-20260908-0858-2 (design 7a / 7b): 件数を持つものを下端のステータスに寄せる。
// TICKET-owner-20261115-1840-prune: 指摘・指摘箱の件数はピン留め・指摘箱ごと外した。
// TICKET-owner-20261115-2141-prune: ± 差分 (btn-tab-diff / status-diff) も外したので、寄せる件数は今は無い。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
});

test('下端に件数の札 (± 差分・指摘・指摘箱) は出ない', async ({ page }) => {
  await expect(page.locator('#status-pins, #status-inbox, #status-diff, #btn-tab-diff')).toHaveCount(0);
});
