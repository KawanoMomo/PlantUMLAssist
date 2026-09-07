// @ts-check
// BLK-primary-20260907-2203-wish: 症状文をそのまま貼るだけで関連図が並ぶこと。
// これが無い間は、症状から部品名を 5 つ自分で思い付き、一括置換の影響範囲
// プレビューに 1 つずつ打ち込んで出現図を確かめていた。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const SEQ_DMA = [
  '@startuml',
  'title SPI DMA 転送',
  'participant Spi_Driver',
  'participant Dma_Ctrl',
  'Spi_Driver -> Dma_Ctrl : Spi_TransmitDma',
  'Dma_Ctrl -> Spi_Driver : Fault',
  '@enduml',
].join('\n');

const CLS_ADC = [
  '@startuml',
  'class Adc_Driver',
  'class Adc_Buffer',
  'Adc_Driver --> Adc_Buffer',
  '@enduml',
].join('\n');

async function freshWorkspace(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'localStorage', fileDir: './test-results/autosave/blk-primary-2203-wish-symptom-search/e2e-blk-p2203' }));
    } catch (e) {}
  });
}

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(200);
}

async function setupTwoDocs(page) {
  await gotoApp(page);
  await typeDsl(page, SEQ_DMA);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, CLS_ADC);
  await expect(page.locator('#tab-bar .tab')).toHaveCount(2);
}

async function openSymptom(page) {
  await page.locator('#btn-tab-symptom').click();
  await expect(page.locator('#symptom-panel')).toHaveClass(/open/);
}

test.describe('BLK-primary-2203 症状文からの関連図サジェスト', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('症状文を 1 回貼るだけで関連図が関連度順に並ぶ', async ({ page }) => {
    await setupTwoDocs(page);
    await openSymptom(page);
    await page.locator('#symptom-text').fill('DMA転送のFault通知でリトライが動かない');
    await page.waitForTimeout(200);

    const docs = page.locator('#symptom-results .sym-doc');
    await expect(docs).toHaveCount(1);
    await expect(docs.first().locator('.sym-kind')).toContainText('シーケンス図');
    // 部品名を自分で思い付かなくても、当たった語が画面に出る
    await expect(docs.first().locator('.sym-matched')).toContainText('DMA');
    await expect(docs.first().locator('.sym-matched')).toContainText('Fault');
  });

  test('打ち込む前は候補を出さない', async ({ page }) => {
    await setupTwoDocs(page);
    await openSymptom(page);
    await expect(page.locator('#symptom-results .sym-doc')).toHaveCount(0);
    await expect(page.locator('#symptom-head')).toHaveAttribute('data-terms', '0');
  });

  test('当たらなかった語が分かる (語を足す手掛かり)', async ({ page }) => {
    await setupTwoDocs(page);
    await openSymptom(page);
    await page.locator('#symptom-text').fill('DMA転送のWatchdogリセット');
    await page.waitForTimeout(200);
    await expect(page.locator('#symptom-head')).toContainText('当たらなかった語');
    await expect(page.locator('#symptom-terms .sym-term.missed', { hasText: 'Watchdog' })).toHaveCount(1);
  });

  test('当たった行を押すとその図のその行へ運ぶ', async ({ page }) => {
    await setupTwoDocs(page);
    await openSymptom(page);
    await page.locator('#symptom-text').fill('DMA転送のFault通知');
    await page.waitForTimeout(200);
    const hit = page.locator('#symptom-results .sym-hit').first();
    await expect(hit).toBeVisible();
    const line = await hit.getAttribute('data-line');
    await hit.click();
    await page.waitForTimeout(400);
    // 図 1 (シーケンス図) に切り替わり、DSL がその図のものになっている
    const dsl = await page.evaluate(() => /** @type {HTMLTextAreaElement} */ (document.getElementById('editor')).value);
    expect(dsl).toContain('Spi_TransmitDma');
    expect(Number(line)).toBeGreaterThan(0);
  });

  test('該当なしのときは理由を出す', async ({ page }) => {
    await setupTwoDocs(page);
    await openSymptom(page);
    await page.locator('#symptom-text').fill('Watchdog のリセットが効かない');
    await page.waitForTimeout(200);
    await expect(page.locator('#symptom-head')).toContainText('該当なし');
    await expect(page.locator('#symptom-results .sym-doc')).toHaveCount(0);
  });
});
