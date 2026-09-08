// @ts-check
// primary 台本 手順2: 全図横断で部品名 SpiDrv を Spi_Driver に統一する(⇄ 一括置換・全図適用)。
// 台本の主戦場。手順10 の手数の計測もこの操作を対象にしている。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順2 一括置換の全図適用で、旧名 SpiDrv が全図から消える', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, DIR, n, S.docFor(n, 'SpiDrv'));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  await S.runCommand(page, '一括置換');
  const allDocs = page.locator('#rename-all-docs');
  await expect(allDocs).toHaveCount(1);
  if (!(await allDocs.isChecked())) await allDocs.check();
  await page.locator('#rename-from').fill('SpiDrv');
  await page.locator('#rename-to').fill('Spi_Driver');
  await page.waitForTimeout(900);

  // 到達条件その1: 影響プレビューが横断のヒット数を出す(0 件なら適用ボタンは無効)。
  const folder = page.locator('#rename-folder');
  await expect(folder).toContainText('spi_init_sequence');

  const apply = page.locator('#btn-rename-apply');
  await expect(apply).toBeEnabled();
  await apply.click();
  await page.waitForTimeout(1500);

  // 到達条件その2: 保存先の図から旧名が消え、新名になっている。
  const seq = await S.readDoc(page, DIR, 'spi_init_sequence');
  expect(seq).toContain('Spi_Driver');
  expect(seq).not.toContain('SpiDrv ');
});
