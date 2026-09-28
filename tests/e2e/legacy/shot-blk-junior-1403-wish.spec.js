// @ts-check
const { test } = require('@playwright/test');
const { gotoApp, openCompareTabs } = require('../helpers');
const UART = ['@startuml','start',':UARTクロックを有効化;',':UART_Configureを呼ぶ;',':UART割込みを有効化;','stop','@enduml'].join('\n');
const CAN = UART.split('UART').join('CAN') .replace(':CAN割込みを有効化;', ':CAN割込みを有効化;\n:CANビットレートを設定;');
test('shot', async ({ page }) => {
  await gotoApp(page);
  await page.evaluate((t) => { const ed = document.getElementById('editor'); ed.value = t; ed.dispatchEvent(new Event('input')); }, UART);
  await page.waitForTimeout(1200);
  await openCompareTabs(page);
  await page.locator('#tr-label').fill('GPIO系初期化');
  await page.locator('#btn-tr-add').click();
  await page.evaluate((t) => { const ed = document.getElementById('editor'); ed.value = t; ed.dispatchEvent(new Event('input')); }, CAN);
  await page.waitForTimeout(1200);
  await page.locator('#tr-pick').selectOption({ label: 'GPIO系初期化' });
  await page.locator('#btn-td-run').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'E:/01_Loop/loop/shots/BLK-junior-20260908-1403-wish.png', fullPage: false });
});
