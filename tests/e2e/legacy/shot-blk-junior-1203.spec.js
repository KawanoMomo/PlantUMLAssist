// @ts-check
// BLK-junior-20260908-1203 の画面写真。Relation 追加フォームの見出しが
// 「親 (From) / 子 (To)」になり、「こう入る」の 1 行と ⇄ 入替が出ているところ。
const { test } = require('@playwright/test');
const { gotoApp, shotOut } = require('../helpers');

const OUT = shotOut('shot-blk-junior-1203.png');

test('shot: Relation 追加フォームの親子の呼び名と下書き', async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  await gotoApp(page);
  await page.evaluate(() => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = '@startuml\nclass GpioDrv\nabstract class DriverBase\n@enduml';
    ed.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(1500);
  await page.locator('#cl-tail-kind').selectOption('relation');
  await page.locator('#cl-tail-rkind').selectOption('inheritance');
  await page.locator('#cl-tail-from').selectOption('DriverBase');
  await page.locator('#cl-tail-to').selectOption('GpioDrv');
  await page.waitForTimeout(300);
  await page.locator('#props-content').screenshot({ path: OUT });
});
