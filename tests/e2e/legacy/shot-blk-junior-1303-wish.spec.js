// @ts-check
// BLK-junior-20260908-1303-wish の画面写真。参照ペインの「🧩 雛形との差分」で、
// 題材語を伏せた突き合わせの結果 (この図だけ / 雛形どおり) が並ぶところ。
const { test } = require('@playwright/test');
const { gotoApp, shotOut } = require('../helpers');

const OUT = shotOut('shot-blk-junior-1303-wish.png');

const TEMPLATE = [
  '@startuml',
  'start',
  ':GPIOクロックを有効化;',
  ':GPIO_Configureを呼ぶ;',
  ':GPIO割込みを有効化;',
  'stop',
  '@enduml',
].join('\n');

const MINE = TEMPLATE.split('GPIO').join('UART')
  .replace(':UART割込みを有効化;', ':UART割込みを有効化;\n:UARTボーレートを設定;');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(1200);
}

test('shot: 雛形との差分', async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  await gotoApp(page);
  await typeDsl(page, TEMPLATE);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(600);
  await typeDsl(page, MINE);
  await page.locator('#btn-tab-compare').click();
  await page.locator('#btn-td-run').click();
  await page.waitForSelector('#td-list .td-row');
  await page.locator('#compare-pane').screenshot({ path: OUT });
});
