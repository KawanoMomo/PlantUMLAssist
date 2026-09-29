const { test } = require('@playwright/test');
const { gotoApp, shotOut } = require('../helpers');

// BLK-primary-20260908-0003-wish の画面写真。▤ 影響を見る を名前を空のまま開き (BLK-owner-20260924-0852-prune で 🕸 参照関係を寄せた先)、DmaCtrl を選んで
// 出てくる 3 枚が一覧に並び、タブに印が付いているところを撮る。
const OUT = shotOut('shot-blk-primary-0003-wish.png');

const SPI = ['@startuml', 'participant Spi_Driver', 'participant DmaCtrl',
  'Spi_Driver -> DmaCtrl : Spi_TransmitDma', '@enduml'].join('\n');
const CAN = ['@startuml', 'participant Can_Driver', 'participant DmaCtrl',
  'Can_Driver -> DmaCtrl : Can_Write', '@enduml'].join('\n');
const CLS = ['@startuml', 'class Spi_Driver', 'class Can_Driver',
  'Spi_Driver --> DmaCtrl', '@enduml'].join('\n');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = document.getElementById('editor');
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(700);
}
async function rename(page, name) {
  await page.evaluate((n) => {
    const ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), n);
  }, name);
  await page.waitForTimeout(200);
}

test('shot: 参照関係グラフ', async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  await gotoApp(page);
  await rename(page, 'spi');
  await setDsl(page, SPI);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(300);
  await rename(page, 'can');
  await setDsl(page, CAN);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(300);
  await rename(page, 'driver_common_class');
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(500);
  await setDsl(page, CLS);

  await page.locator('#btn-tab-xref').click();
  await page.waitForSelector('#ri-modal', { state: 'visible' });
  await page.waitForTimeout(500);
  await page.locator('#ri-xref-names .ri-xref-name[data-name="DmaCtrl"]').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT, fullPage: false });
});
