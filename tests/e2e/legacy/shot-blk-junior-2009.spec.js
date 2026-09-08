// @ts-check
// BLK-junior-20260907-2009 の画面写真 (loop/shots)。上部バーの保存先チップ。
const { test } = require('@playwright/test');
const { gotoApp, shotOut } = require('../helpers');

const OUT = shotOut('shot-blk-junior-2009.png');
const DIR = ['E:', '01_Loop', 'persona-data', 'junior'].join('\\');

test('shot: 上部バーの保存先', async ({ page }) => {
  await page.addInitScript((dir) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config', JSON.stringify({
        enabled: true, debounceMs: 500, restoreMode: 'auto',
        backend: 'file', fileDir: dir,
      }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page);
  await page.waitForTimeout(600);
  await page.locator('#toolbar').screenshot({ path: OUT });
});
