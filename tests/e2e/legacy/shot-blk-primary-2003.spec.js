// @ts-check
// BLK-primary-20260907-2003-wish の画面写真 (loop/shots)。一括置換パネル。
const { test } = require('@playwright/test');
const { gotoApp, shotOut } = require('../helpers');

const OUT = shotOut('shot-blk-primary-2003.png');

const CLS = '@startuml\nclass Spi_Driver {\n  + Spi_Reset() : void\n  + Spi_Init(uint8 ch) : void\n}\n@enduml';
const CLS2 = '@startuml\nclass Uart_Driver {\n  + Spi_Reset(uint8 ch) : void\n}\n@enduml';

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(300);
}

test('shot: 影響範囲プレビューの行ジャンプとシグネチャ一括適用', async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  await gotoApp(page);
  await typeDsl(page, CLS);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, CLS2);
  await page.locator('#btn-tab-rename').click();
  await page.locator('#rename-from').fill('Spi_Reset');
  await page.waitForTimeout(300);
  const ret = page.locator('#sig-return');
  if (await ret.count()) {
    await ret.fill('StatusType');
    await page.waitForTimeout(300);
  }
  await page.locator('#rename-panel').screenshot({ path: OUT });
});
