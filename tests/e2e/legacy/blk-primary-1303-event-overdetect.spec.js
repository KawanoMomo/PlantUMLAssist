// @ts-check
// BLK-primary-20260907-1303: 「新人に引き継ぐ」場面で 🔍名前突合 を開くと、
// 表記揺れ 0 組・宣言なし 0 件は達成できるのに「メソッド突合」に指摘が大量に出て、
// その大半が state の応答ラベル (Tick / Fault / Reset / ConvComplete) の過検出だった。
// どれが本物か新人には判別できず、「0 件にしてから渡す」が達成できなかった。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const CLS = [
  '@startuml',
  'class Adc_Driver {',
  '  +Adc_Init() : void',
  '  +Adc_StartConv() : void',
  '}',
  '@enduml',
].join('\n');

// 応答ラベル (接頭辞なし) だけの state 図。本物の不整合は 1 つも無い。
const STATE_CLEAN = [
  '@startuml',
  '[*] --> Idle',
  'Idle --> Busy : Adc_StartConv',
  'Busy --> Idle : ConvComplete',
  'Busy --> Error : ConvError',
  'Error --> Idle : Reset',
  'Idle --> Idle : Tick',
  '@enduml',
].join('\n');

// 接頭辞つきで、クラスに宣言の無い遷移名を 1 つ混ぜたもの。
const STATE_BAD = STATE_CLEAN.replace('Idle --> Idle : Tick', 'Idle --> Idle : Adc_Recalibrate');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(250);
}

async function openAudit(page, stateDsl) {
  await gotoApp(page);
  await typeDsl(page, CLS);
  await page.locator('#btn-tab-new').click();
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(400);
  await typeDsl(page, stateDsl);
  await page.locator('#btn-tab-audit').click();
  await expect(page.locator('#na-method-summary')).toBeVisible();
}

test.describe('BLK-primary-1303 遷移イベントの過検出', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('応答ラベルだけの図なら「一致しています」で 0 件になる', async ({ page }) => {
    await openAudit(page, STATE_CLEAN);
    await expect(page.locator('#na-method-summary')).toHaveAttribute('data-issues', '0');
    await expect(page.locator('#na-no-methods')).toBeVisible();
  });

  test('Tick / Reset / ConvComplete は指摘の表に出ない', async ({ page }) => {
    await openAudit(page, STATE_CLEAN);
    expect(await page.locator('.na-method-row[data-method="Tick"]').count()).toBe(0);
    expect(await page.locator('.na-method-row[data-method="Reset"]').count()).toBe(0);
    expect(await page.locator('.na-method-row[data-method="ConvComplete"]').count()).toBe(0);
  });

  test('何を対象外にしたかが画面に出る (黙って捨てない)', async ({ page }) => {
    await openAudit(page, STATE_CLEAN);
    const ex = page.locator('#na-method-excluded');
    await expect(ex).toBeVisible();
    // ConvComplete / ConvError / Reset / Tick の 4 種。
    await expect(ex).toHaveAttribute('data-count', '4');
    await expect(ex).toContainText('対象外');
  });

  test('接頭辞つきの遷移名は今までどおり指摘に出る', async ({ page }) => {
    await openAudit(page, STATE_BAD);
    await expect(page.locator('#na-method-summary')).toHaveAttribute('data-issues', '1');
    const row = page.locator('.na-method-row[data-method="Adc_Recalibrate"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Adc_Driver');
  });

  test('接頭辞の無い呼び出しは、受け手の名前で何が足りないかを言う', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, '@startuml\nAdc_Driver -> ClockCtrl : EnableClock()\n@enduml');
    await page.locator('#btn-tab-audit').click();
    const row = page.locator('.na-method-row[data-method="EnableClock"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('ClockCtrl');
  });
});
