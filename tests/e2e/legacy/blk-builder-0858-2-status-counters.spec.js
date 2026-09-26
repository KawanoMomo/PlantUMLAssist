// @ts-check
// BLK-builder-20260908-0858-2 (design 7a / 7b): 件数を持つものを下端のステータスに寄せる。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
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

