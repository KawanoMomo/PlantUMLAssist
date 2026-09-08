// @ts-check
// BLK-primary-20260908-1803 の画面写真。
// 変更後: 静かなタブ列に「他 N 件」の札が出て、押すと畳んだツールの一覧が開く。
// 変更前 (SHOT_BEFORE=1): タブ列に入口が無く、Ctrl+K でコマンド名を打つしかなかった。
const { test } = require('@playwright/test');
const { gotoApp, shotOut, saveDirFor } = require('./helpers');

const DIR = saveDirFor(__filename);
const BEFORE = process.env.SHOT_BEFORE === '1';
const OUT = BEFORE
  ? (process.env.SHOT_OUT_BEFORE || shotOut('shot-blk-primary-1803-tools-mini-before.png'))
  : shotOut('shot-blk-primary-1803-tools-mini.png');

test('shot: 畳んだツールの小さな入口', async ({ page }) => {
  await page.addInitScript((args) => {
    try {
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: args.dir }));
    } catch (e) {}
  }, { dir: DIR });
  await gotoApp(page, { foldedTools: true });
  if (!BEFORE) {
    await page.locator('#btn-tab-tools-mini').click();
    await page.waitForSelector('#tool-menu:not([hidden])');
  }
  await page.screenshot({ path: OUT });
});
