// @ts-check
const { test } = require('@playwright/test');
const { gotoApp } = require('./helpers');

test('shot', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('plantuml-handover-notes', JSON.stringify({ notes: {
        Adc_Driver: { text: 'adc_state の Done→Configured に対応するメソッドが無かった', at: '2026-09-08T17:40:00Z', added: 1, removed: 0, status: 'changed' },
        Dma_Driver: { text: '状態名を dma_state の綴りに揃えた', at: '2026-09-08T17:50:00Z', added: 2, removed: 1, status: 'changed' },
      } }));
      window.localStorage.setItem('plantuml-handover-checklist', JSON.stringify({
        checklist: { createdAt: '2026-09-08T18:03:00Z', items: [
          { id: 'Adc_Driver', name: 'Adc_Driver', text: 'adc_state の Done→Configured に対応するメソッドが無かった', at: '2026-09-08T17:40:00Z' },
          { id: 'Dma_Driver', name: 'Dma_Driver', text: '状態名を dma_state の綴りに揃えた', at: '2026-09-08T17:50:00Z' } ] },
        reply: { createdAt: '2026-09-08T18:03:00Z', at: '2026-09-08T19:10:00Z', replies: { Adc_Driver: 'done', Dma_Driver: 'unclear' } },
      }));
    } catch (e) {}
  });
  await gotoApp(page);
  await page.waitForTimeout(600);
  await page.locator('#btn-tab-board').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'E:/01_Loop/loop/shots/BLK-primary-20260908-1803-wish.png', fullPage: false });
});
