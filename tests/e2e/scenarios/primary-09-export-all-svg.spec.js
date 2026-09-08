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
