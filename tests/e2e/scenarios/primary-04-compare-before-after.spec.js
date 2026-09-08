// @ts-check
// primary 台本 手順4(場面: レビュー会議で変更前後を見せる):
// 手順2 の置換前後を「並べて見る」で表示し、参加者に見せるつもりでスクリーンショットを控える。
const { test, expect } = require('@playwright/test');
const { shotOut } = require('../helpers');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順4 置換の前後を並べて見せられ、その画面を控えられる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'spi_init_sequence', S.docFor('spi_init_sequence'));
  await S.openFolderItem(page, 'spi_init_sequence');

  await page.locator('#btn-tab-compare').click();
  // 到達条件その1: 変更前後を並べる参照ペインが開き、見せる図を選べる。
  await expect(page.locator('#compare-pane')).toBeVisible();
  await expect(page.locator('#compare-select')).toBeVisible();

  // 到達条件その2: 会議で見せるための静止画を控えられる。
  await page.screenshot({ path: shotOut('primary-04-compare.png'), fullPage: true });
});
