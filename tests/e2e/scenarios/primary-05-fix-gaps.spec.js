// @ts-check
// primary 台本 手順5: 並べた変更のうち、既存の reviewer 指摘と符合する欠落があれば直す。
// 直し漏れがあれば直す(漏れが無ければ「反映済み」を run ログに残す)。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順5 直し漏れ(旧名の残存)が横断で見つかり、その場で直せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // spi_init_sequence だけ直っていて、spi_state と共通クラス図に旧名が残っている = 直し漏れ。
  await S.putDoc(page, DIR, 'spi_init_sequence', S.docFor('spi_init_sequence'));
  for (const n of ['spi_state', 'driver_common_class']) {
    await S.putDoc(page, DIR, n, S.docFor(n, 'SpiDrv'));
  }
  await page.reload();
  await page.waitForSelector('#preview-svg');

  await S.runCommand(page, '一括置換');
  const allDocs = page.locator('#rename-all-docs');
  if (!(await allDocs.isChecked())) await allDocs.check();
  await page.locator('#rename-from').fill('SpiDrv');
  await page.locator('#rename-to').fill('Spi_Driver');
  await page.waitForTimeout(1200);

  // 到達条件その1: 旧名の宣言が残っている図が、件数つきで名指しで出る。
  const folder = page.locator('#rename-folder');
  await expect(folder).toContainText('driver_common_class');
  const listed = (await folder.textContent()) || '';
  expect(listed).toMatch(/driver_common_class\s*1\s*件/);

  // 到達条件その2: すでに直っている図は 0 件と出て、直す対象から外れる。
  expect(listed).toMatch(/spi_init_sequence(開いている)?\s*0\s*件/);

  // 到達条件その3: 漏れが残っているあいだは適用に進める。
  // (適用そのものが保存先へ書き戻ることは 手順2 の spec が受け持つ)
  await expect(page.locator('#btn-rename-apply')).toBeEnabled();
});
