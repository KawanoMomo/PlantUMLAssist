// @ts-check
// BLK-junior-20260907-1903 の画面写真 (loop/shots)。無選択時の右ペイン。
const { test } = require('@playwright/test');
const { gotoApp, shotOut } = require('../helpers');

const OUT = shotOut('shot-blk-junior-1903.png');

test('shot: 末尾に追加の「まとめて入れる」呼び込み', async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-component');
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = '@startuml\ntitle CAN Driver\n@enduml';
    ed.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(1200);
  await page.locator('#props-pane').screenshot({ path: OUT });
});
