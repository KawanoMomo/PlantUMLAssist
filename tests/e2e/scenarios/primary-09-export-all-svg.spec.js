// @ts-check
// primary 台本 手順9: 全図を、設計書に貼るために SVG で一括出力する(全図をSVGで保存 zip)。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順9 開いている全図を SVG の zip で 1 度に書き出せる', async ({ page }) => {
  test.setTimeout(90 * 1000);
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of ['spi_init_sequence', 'spi_state', 'can_state']) {
    await S.putDoc(page, DIR, n, S.docFor(n));
    await S.openFolderItem(page, n);
  }

  const download = await (await S.exportVia(page, 'exp-svg-all', 60000));
  // 到達条件: zip が 1 本書き出される。
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
});

// BLK-primary-20260909-0003-wish: 2 度目以降の書き出しで「前回書き出しから
// 変わった図だけ」に絞れる。控えは保存フォルダに置くので、開き直しても残る。
test('手順9 2 度目は前回書き出しからの差分が出て、変わった図だけに絞れる', async ({ page }) => {
  test.setTimeout(120 * 1000);
  const NAMES = ['spi_init_sequence', 'spi_state', 'can_state'];
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of NAMES) {
    await S.putDoc(page, DIR, n, S.docFor(n));
    await S.openFolderItem(page, n);
  }

  // 1 度目。ここが次回の基準になる。
  expect(await S.exportVia(page, 'exp-svg-all', 60000)).not.toBeNull();
  await page.waitForFunction(async (d) => {
    const r = await fetch('/autosave?dir=' + encodeURIComponent(d));
    const j = r.ok ? await r.json() : null;
    return !!(j && j.exportLog);
  }, DIR, { timeout: 20000 });

  // 3 枚のうち 1 枚だけをフォルダ側で書き換え、開き直す。
  // 控えは localStorage ではなく保存フォルダにあるので開き直しても残る。
  await S.putDoc(page, DIR, 'spi_state', S.docFor('spi_state') + "\n' 追記\n");
  await S.bootWithSaveDir(page, DIR);
  for (const n of NAMES) await S.openFolderItem(page, n);

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-svg-pick').click();
  await expect(page.locator('#expick-modal')).toBeVisible();
  // 「初回」ではなく前回書き出しの時点が基準として出る。
  await expect(page.locator('#expick-since')).toContainText('前回SVG 一括出力');
  await expect(page.locator('#expick-since')).not.toContainText('初回');
  await page.locator('#expick-mode-since').click();
  await expect(page.locator('#expick-count')).toContainText('前回書き出しから変わった図のみ');
  // 3 枚のうち直した 1 枚だけが残る (最初から開いている白紙の図は前回書き出しに
  // 含まれているので、ここでは数に入らない)。
  await expect(page.locator('#expick-count')).toContainText(/：1 \/ \d+ 枚/);
});
