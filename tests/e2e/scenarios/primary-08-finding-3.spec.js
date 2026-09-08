// @ts-check
// primary 台本 手順8: レビュー指摘 3 があれば反映する。
// 指摘 3 は「反映したつもりが漏れている」型。反映後に漏れが 0 だと画面が言い切ることが到達条件。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順8 指摘 3 を反映したあと、漏れが 0 だと画面が言い切る', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of ['spi_init_sequence', 'spi_state', 'driver_common_class']) {
    await S.putDoc(page, DIR, n, S.docFor(n));
  }
  await page.reload();
  await page.waitForSelector('#preview-svg');

  await S.runCommand(page, '一括置換');
  const allDocs = page.locator('#rename-all-docs');
  if (!(await allDocs.isChecked())) await allDocs.check();
  await page.locator('#rename-from').fill('SpiDrv');
  await page.locator('#rename-to').fill('Spi_Driver');
  await page.waitForTimeout(900);

  // 到達条件: 旧名のヒットが 0 件で、適用ボタンが押せない(= 直すものが残っていない)。
  await expect(page.locator('#btn-rename-apply')).toBeDisabled();
});
