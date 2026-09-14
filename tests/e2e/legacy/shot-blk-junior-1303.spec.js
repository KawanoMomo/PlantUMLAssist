// @ts-check
// BLK-junior-20260908-1303 の画面写真。⇔ 並べて見る (🔀 対応表) で、骨格が同じで
// 語だけ違う 2 枚を突き合わせたときの語の対応表。
const { test } = require('@playwright/test');
const { gotoApp, saveDirFor, shotOut } = require('../helpers');

const SELF_DIR = saveDirFor(__filename) + '/self';
const REF_DIR = saveDirFor(__filename) + '/ref';
const NAME = 'CAN初期化';

const REF_DSL = ['@startuml', 'start', ':UARTクロック有効化;', ':ボーレート設定;',
  ':割り込み設定;', ':送受信有効化;', 'if (初期化失敗?) then (異常)', 'else (正常)',
  'endif', 'stop', '@enduml'].join('\n');
const SELF_DSL = ['@startuml', 'start', ':CANクロック有効化;', ':ビットレート設定;',
  ':割り込み設定;', ':送受信有効化;', 'if (初期化失敗?) then (異常)', 'else (正常)',
  'endif', 'stop', '@enduml'].join('\n');

test('shot: 骨格が同じで語だけ違う 2 枚の対応表', async ({ page }) => {
  await gotoApp(page);
  await page.evaluate(([dir, name]) => {
    window.MA.autoSave.setConfig({
      enabled: true, debounceMs: 500, restoreMode: 'none', backend: 'file', fileDir: dir,
    });
    window.MA.workspace.rename(window.MA.workspace.getActiveId(), name);
  }, [SELF_DIR, NAME]);
  await page.locator('#editor').fill(SELF_DSL);
  await page.waitForTimeout(900);
  await page.evaluate(([dir, name, text]) => {
    return fetch('/autosave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: name, dsl: text, dir: dir }),
    }).then((r) => r.ok);
  }, [REF_DIR, NAME, REF_DSL]);
  await page.locator('#btn-tab-compare').click();
  await page.waitForTimeout(400);
  await page.locator('#xf-dir').fill(REF_DIR);
  await page.locator('#btn-xf-load').click();
  await page.waitForTimeout(800);
  await page.screenshot({
    path: process.env.SHOT_BEFORE === '1'
      ? (process.env.SHOT_OUT_BEFORE || shotOut('shot-blk-junior-1303-before.png'))
      : shotOut('shot-blk-junior-1303.png'),
  });
});
