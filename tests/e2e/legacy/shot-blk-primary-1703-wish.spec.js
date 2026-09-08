// @ts-check
// BLK-primary-20260908-1703-wish の「できるようになったこと」用スクリーンショット。
// 変更サマリボードを開いた所を撮る (SHOT_AFTER=1 で指摘を 1 件結んでから撮る)。
const { test } = require('@playwright/test');
const { gotoApp } = require('../helpers');

test('shot', async ({ page }) => {
  await gotoApp(page);
  await page.evaluate(() => {
    const ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), 'Adc_Driver');
  });
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(500);

  const dsls = await page.evaluate(() => {
    const base = ['@startuml', 'class Adc_Driver {', '  Adc_Init()', '}', '@enduml'].join('\n');
    const RP = window.MA.reviewPins;
    let withPins = RP.add(base, { line: 3, text: 'Done→Configured に対応するメソッドが無い', author: 'reviewer' });
    withPins = RP.add(withPins, { line: 3, text: 'リセットフローが片方向', author: 'reviewer' });
    return { before: withPins, after: withPins.replace('  Adc_Init()', '  Adc_Init()\n  Adc_Ack()') };
  });
  await page.evaluate((t) => {
    const ed = document.getElementById('editor');
    ed.value = t; ed.dispatchEvent(new Event('input'));
  }, dsls.before);
  await page.waitForTimeout(700);
  await page.evaluate(() => window.MA.saveDiff.markAll(window.MA.workspace.list()));
  await page.evaluate((t) => {
    const ed = document.getElementById('editor');
    ed.value = t; ed.dispatchEvent(new Event('input'));
  }, dsls.after);
  await page.waitForTimeout(900);

  await page.locator('#btn-tab-board').click();
  await page.waitForTimeout(500);
  if (process.env.SHOT_AFTER === '1') {
    await page.locator('#cb-body .cb-links button.cb-link-btn').first().click();
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: process.env.SHOT_PATH });
});
