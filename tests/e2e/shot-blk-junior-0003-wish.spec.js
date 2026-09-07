// @ts-check
// BLK-junior-20260908-0003-wish の画面写真。「◎ 観点一括」に指摘を貼り、
// 欠けている図だけが並んだところを撮る。
const { test } = require('@playwright/test');
const { gotoApp, shotOut } = require('./helpers');

const OUT = shotOut('shot-blk-junior-0003-wish.png');

const CLS = [
  ['@startuml', 'class GpioDrv {', '  +GpioDrv()', '  +Gpio_Write(ch, v)', '}', '@enduml'],
  ['@startuml', 'class UartDrv {', '  +Uart_Send(buf)', '}', '@enduml'],
  ['@startuml', 'class CanDrv {', '  +Can_Send(msg)', '}', '@enduml'],
].map((a) => a.join('\n'));

test('shot: 観点一括で欠けている図だけが並ぶ', async ({ page }) => {
  await gotoApp(page);
  for (let i = 0; i < CLS.length; i++) {
    if (i > 0) await page.locator('#btn-tab-new').click();
    await page.evaluate((text) => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      ed.value = text;
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    }, CLS[i]);
    await page.waitForTimeout(300);
  }
  await page.locator('#btn-tab-pattern').click();
  await page.locator('#pattern-note').fill('GpioDrv クラスにコンストラクタが無い');
  await page.waitForTimeout(500);
  await page.locator('#pattern-panel').screenshot({ path: OUT });
});
