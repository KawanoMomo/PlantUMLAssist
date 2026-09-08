// @ts-check
// BLK-builder-20260908-1123-4 の画面写真。何も設定していない人が開いたときの
// タブ列 (図のタブと ＋ / 📂 一覧 / 🧰 ツール ▾ だけ) と、開いたツールメニューを撮る。
const { test } = require('@playwright/test');
const { gotoApp, shotOut, saveDirFor } = require('./helpers');

const OUT = shotOut('shot-blk-builder-1123-4.png');
const DIR = saveDirFor(__filename);

test('shot: 畳んだタブ列とツールメニュー', async ({ page }) => {
  await page.addInitScript((d) => {
    try {
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  // 既定 (畳んだ状態) を見るので helper には触らせない。
  await gotoApp(page, { foldedTools: true });
  const folded = await page.locator('#tab-bar').getAttribute('class');
  if (folded && folded.indexOf('tools-folded') >= 0) {
    // BLK-primary-20260908-0923-design (7b): 既定ではタブ列に「ツール ▾」も無いので、
    // メニューは Ctrl+K から開く。
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('ツールを分類から選ぶ');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: OUT });
});

// 変更前の画面 (機能ボタンが並んだタブ列)。今の実装でも「タブ列に戻す」を選んだ
// 状態がそれなので、helper の既定 (畳まない) で開いて撮る。
test('shot: 変更前 — 機能ボタンが並んだタブ列', async ({ page }) => {
  await page.addInitScript((d) => {
    try {
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page);
  await page.screenshot({ path: process.env.SHOT_OUT_BEFORE || shotOut('shot-blk-builder-1123-4-before.png') });
});
