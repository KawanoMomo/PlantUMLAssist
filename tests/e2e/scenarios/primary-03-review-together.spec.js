// @ts-check
// primary 台本 手順3: 直した結果をまとめて確認する(切り替えて見比べる)。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順3 直した図を切り替えて見比べられる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of ['spi_init_sequence', 'spi_state']) await S.putDoc(page, DIR, n, S.docFor(n));

  await S.openFolderItem(page, 'spi_init_sequence');
  expect(await page.locator('#editor').inputValue()).toContain('Spi_Driver');

  await S.openFolderItem(page, 'spi_state');
  // 到達条件: 一覧から切り替えるだけで次の図が読め、両方が開いたまま残る。
  expect(await page.locator('#editor').inputValue()).toContain('Spi_Driver');
  const tabs = page.locator('#tab-bar .tab, #doc-tabs .tab');
  expect(await tabs.count()).toBeGreaterThanOrEqual(2);
});
