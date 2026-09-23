// @ts-check
// BLK-builder-20260908-0858-2 (design 7a / 7b): 件数を持つものを下端のステータスに寄せる。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
});

test('下端に ± 差分 / 指摘 / 指摘箱 が並ぶ', async ({ page }) => {
  await expect(page.locator('#status-diff')).toBeVisible();
  await expect(page.locator('#status-pins')).toBeVisible();
  await expect(page.locator('#status-inbox')).toBeVisible();
  await expect(page.locator('#status-pins')).toHaveText(/^うち この図 (\d+|−)$/);
  await expect(page.locator('#status-inbox')).toHaveText(/^指摘箱 (\d+|−)$/);
});

test('下端の件数はタブ列のボタンの件数と一致する', async ({ page }) => {
  const pairs = [
    ['#btn-tab-diff', '#status-diff'],
    ['#btn-tab-pins', '#status-pins'],
    ['#btn-tab-inbox', '#status-inbox'],
  ];
  for (const [src, out] of pairs) {
    const srcText = (await page.locator(src).textContent()) || '';
    const outText = (await page.locator(out).textContent()) || '';
    const token = (t) => (/([0-9]+|[−-])\s*$/.exec(t) || [, '−'])[1].replace('-', '−');
    expect(token(outText)).toBe(token(srcText));
  }
});

test('下端の「指摘」を押すと、タブ列の 📌 指摘 と同じパネルが開く', async ({ page }) => {
  await expect(page.locator('#pin-panel')).not.toHaveClass(/open/);
  await page.locator('#status-pins').click();
  await expect(page.locator('#pin-panel')).toHaveClass(/open/);
});

test('ツールを畳んでも件数は下端に残る', async ({ page }) => {
  await page.locator('#btn-tab-tools').click();
  await page.locator('#tool-menu-fold').click();

  await expect(page.locator('#btn-tab-pins')).toBeHidden();
  await expect(page.locator('#status-pins')).toBeVisible();
  await page.locator('#status-pins').click();
  await expect(page.locator('#pin-panel')).toHaveClass(/open/);
});
