// @ts-check
// BLK-primary-20260908-0923-design (design 7b) の画面写真。
// 変更後: タブ列は図のタブと ＋ / 📂 一覧 だけ。件数は下端の状態表示。
// 変更前 (SHOT_BEFORE=1): タブ列に「🧰 ツール ▾」が残っていた 7a の状態。
const { test } = require('@playwright/test');
const { gotoApp, shotOut, saveDirFor } = require('../helpers');

const DIR = saveDirFor(__filename);
const BEFORE = process.env.SHOT_BEFORE === '1';
const OUT = BEFORE
  ? (process.env.SHOT_OUT_BEFORE || shotOut('shot-blk-primary-0923-design-before.png'))
  : shotOut('shot-blk-primary-0923-design.png');

test('shot: タブ列は図だけ (7b)', async ({ page }) => {
  await page.addInitScript((args) => {
    try {
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: args.dir }));
      // 変更前の画面は 7a の既定 (ツール ▾ を出したまま機能ボタンは畳む)。
      if (args.before) window.localStorage.setItem('plantuml-tools-quiet', '0');
    } catch (e) {}
  }, { dir: DIR, before: BEFORE });
  // 既定を見るので helper の互換設定 (畳まない) は使わない。
  await gotoApp(page, { foldedTools: true });
  await page.screenshot({ path: OUT });
});
