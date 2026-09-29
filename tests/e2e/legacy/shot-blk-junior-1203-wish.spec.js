// @ts-check
// BLK-junior-20260908-1203-wish の画面写真。クラス図でも「🔀 対応表」が出て、
// 先輩だけにあるクラス・関係が橙で並び、関係の行が「継承: 親 A ← 子 B」と
// 向きの分かる形になっているところを撮る。
const { test } = require('@playwright/test');
const { gotoApp, shotOut, openCompareTabs } = require('../helpers');

const OUT = shotOut('shot-blk-junior-1203-wish.png');

const SENIOR = [
  '@startuml',
  'abstract class DriverBase',
  'class GpioDrv',
  'class AdcDrv',
  'DriverBase <|-- GpioDrv',
  'DriverBase <|-- AdcDrv',
  '@enduml',
].join('\n');

const MINE = [
  '@startuml',
  'class GpioDrv',
  'class AdcDrv',
  '@enduml',
].join('\n');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(1200);
}

test('shot: クラス図の対応表から先輩の継承を取り込む', async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  await gotoApp(page);
  await typeDsl(page, SENIOR);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(600);
  await typeDsl(page, MINE);
  await openCompareTabs(page);
  await page.locator('#btn-map-run').click();
  await page.waitForSelector('#map-list .map-row');
  await page.locator('#compare-pane').screenshot({ path: OUT });
});
