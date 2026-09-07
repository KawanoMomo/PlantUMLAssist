// @ts-check
// BLK-junior-20260907-2203 の画面写真。応答行を選んでから Ctrl+Enter で
// 「末尾に追加」を開いたときの From / To を撮る。
const { test } = require('@playwright/test');
const { gotoApp, shotOut } = require('./helpers');

const OUT = shotOut('shot-blk-junior-2203.png');
const DSL = ['@startuml',
  'participant App',
  'participant Gpio_Driver',
  'App -> Gpio_Driver : Gpio_Init()',
  'Gpio_Driver --> App : InitDone',
  '@enduml'].join('\n');

test('shot: 末尾追加の From/To が選んだ行の当事者になる', async ({ page }) => {
  await gotoApp(page);
  await page.evaluate((text) => {
    const ed = document.getElementById('editor');
    ed.value = text;
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  }, DSL);
  await page.waitForTimeout(900);

  await page.locator('#overlay-layer rect[data-line="5"]').first().click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Control+Enter');
  await page.waitForSelector('#seq-tail-from', { timeout: 5000 });
  await page.waitForTimeout(400);
  await page.locator('#props-pane').screenshot({ path: OUT });
});
