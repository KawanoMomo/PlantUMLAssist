const { test } = require('@playwright/test');
const { gotoApp, saveDirFor, shotOut } = require('./helpers');

// BLK-reviewer-20260907-2203-wish の画面写真。保存フォルダ一覧の下端に
// 「前回の指摘をそのまま今回の指摘にする」が出ているところを撮る。
const DIR = saveDirFor(__filename);
const OUT = shotOut('shot-blk-reviewer-2203-wish.png');

const A1 = ['@startuml',
  "' @pin 1|open|reviewer|2026-09-07T19:03|Idle --> Busy : Timer_StartConv|対応する method が無い",
  '[*] --> Idle',
  'Idle --> Busy : Timer_StartConv',
  'Busy --> Idle : 完了',
  '@enduml'].join('\n');
const B1 = ['@startuml',
  "' @pin 2|read|primary|2026-09-07T19:03|A -> B: go|粒度がそろっていない",
  'participant A',
  'A -> B: go',
  '@enduml'].join('\n');

test('shot: 無変更確定ボタン', async ({ page }) => {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page);
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
  for (const [name, dsl] of [['R2203W_adc_state', A1], ['R2203W_spi_seq', B1]]) {
    await page.evaluate(async (a) => {
      await fetch('/autosave', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
      });
    }, { name, dsl, dir: DIR });
  }

  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open .folder-item');
  const mark = page.locator('#folder-panel .folder-mark-seen');
  if (await mark.count()) {
    await mark.click();
    await page.waitForSelector('#folder-panel .folder-item[data-review-status="unchanged"]');
  }
  await page.locator('#btn-tab-folder').click();
  await page.waitForTimeout(150);
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open .folder-item');
  await page.waitForTimeout(300);
  await page.locator('#folder-panel').screenshot({ path: OUT });
});
