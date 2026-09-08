// @ts-check
// junior 台本 手順3: GUI の設定で保存先を persona-data\junior に変更する。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順3 設定で保存先を変えると、上部バーの表示がその場で追いつく', async ({ page }) => {
  await S.bootDownloadMode(page);
  // 未設定ならダウンロードになることが先に出る。
  await expect(page.locator('#top-save-target')).toHaveAttribute('data-mode', 'download');

  await page.locator('#top-save-target').click();
  await expect(page.locator('#cfg-modal')).toBeVisible();
  await page.locator('input[name="cfg-backend"][value="file"]').check();
  await page.locator('#cfg-file-dir').fill(DIR);
  await page.locator('#cfg-ok').click();
  await page.waitForTimeout(400);

  // 到達条件: 保存先が設定済みだと画面から読める。
  const chip = page.locator('#top-save-target');
  await expect(chip).toHaveAttribute('data-mode', 'file');
  await expect(chip).toHaveClass(/configured/);
  expect(await chip.getAttribute('title')).toContain(DIR);
});
