// @ts-check
// BLK-primary-20260908-1403 の「できるようになったこと」用スクリーンショット。
const { test } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const DMA = [
  '@startuml', 'title DMA',
  'state Idle', 'state Configured', 'state SrcDstSet', 'state DmaReqEnabled', 'state Transferring_Active',
  'Idle --> Configured : Dma_Init',
  'Configured --> SrcDstSet : Dma_SetSrcDst',
  'SrcDstSet --> DmaReqEnabled : Dma_EnableReq',
  'DmaReqEnabled --> Transferring_Active : Dma_Start',
  'Transferring_Active --> Idle : Dma_Stop',
  '@enduml',
].join('\n');

test('shot', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(700);
  await page.evaluate((t) => {
    const ed = document.getElementById('editor');
    ed.value = t; ed.dispatchEvent(new Event('input'));
  }, DMA);
  await page.waitForTimeout(1500);
  const shot = process.env.SHOT_PATH;
  if (process.env.SHOT_AFTER === '1') {
    await page.locator('#st-cl-from').selectOption('Idle');
    await page.locator('#st-cl-to').selectOption('Transferring_Active');
    await page.locator('#st-cl-label').click();
    await page.keyboard.type('Dma_Configure');
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: shot });
});
