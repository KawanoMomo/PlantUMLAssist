// @ts-check
// BLK-primary-20260908-1303-wish の画面写真。⇄ 一括置換の「▤ 影響を見る」で開く
// 置換の影響ボード (ヒットした図ごとの 今 / 置換後)。
const { test } = require('@playwright/test');
const { gotoApp, shotOut } = require('./helpers');

const SPI_SEQ = '@startuml\nparticipant SpiDrv\nparticipant SpiHw\nSpiDrv -> SpiHw: transfer\n@enduml';
const CLS = '@startuml\nclass SpiDrv\nclass SpiDrvTest\nSpiDrv <|-- SpiDrvTest\n@enduml';

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(200);
}

test('shot: 置換の影響ボード', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'localStorage', fileDir: './autosave' }));
    } catch (e) {}
  });
  await gotoApp(page);
  await typeDsl(page, SPI_SEQ);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, CLS);
  await page.locator('#btn-tab-rename').click();
  await page.locator('#rename-from').fill('SpiDrv');
  await page.locator('#rename-to').fill('Spi_Driver');
  await page.waitForTimeout(200);
  // 変更前の画面 (影響ボードがまだ無い頃) は一括置換パネルまで。
  if (process.env.SHOT_BEFORE === '1') {
    await page.screenshot({ path: process.env.SHOT_OUT_BEFORE || shotOut('shot-blk-primary-1303-wish-before.png') });
    return;
  }
  await page.locator('#btn-rename-preview').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotOut('shot-blk-primary-1303-wish.png') });
});
