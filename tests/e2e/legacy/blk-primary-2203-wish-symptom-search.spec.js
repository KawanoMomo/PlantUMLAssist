// @ts-check
// BLK-primary-20260907-2203-wish: 症状文をそのまま貼るだけで関連図が並ぶこと。
// これが無い間は、症状から部品名を 5 つ自分で思い付き、一括置換の影響範囲
// プレビューに 1 つずつ打ち込んで出現図を確かめていた。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

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

// BLK-primary-20260909-0203-wish: 症状が複数系統 (SPI 起点 → DMA 停止) にまたがる
// とき、関連度順の 1 本の列では SPI の図が上位を占め、DMA の図は下に沈む。
// 系統ごとの段があれば、DMA の入口が 2 つあることがその場で見える。
const SEQ_SPI = [
  '@startuml',
  'title Spi_Init_Sequence',
  'participant Spi_Driver',
  'participant Hw_Spi',
  'Spi_Driver -> Hw_Spi : Spi_Init',
  'Hw_Spi -> Spi_Driver : Ready',
  '@enduml',
].join('\n');

const STATE_DMA = [
  '@startuml',
  'title DMA_State',
  'state Idle',
  'state Transferring_Active',
  'Idle --> Transferring_Active : Spi_TransmitDma',
  'Transferring_Active --> Idle : TransferComplete',
  '@enduml',
].join('\n');

const MULTI_SYMPTOM = 'SPI初期化直後にDMA転送が完了しないままタイムアウトする。割り込みは一度も発火していない模様';

async function setupThreeDocs(page) {
  await gotoApp(page);
  await typeDsl(page, SEQ_SPI);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, SEQ_DMA);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, STATE_DMA);
  await expect(page.locator('#tab-bar .tab')).toHaveCount(3);
}

test.describe('BLK-primary-0203 系統ごとに図を並べる', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('複数系統の症状で、系統ごとの段に分かれて出る', async ({ page }) => {
    await setupThreeDocs(page);
    await openSymptom(page);
    await page.locator('#symptom-text').fill(MULTI_SYMPTOM);
    await page.waitForTimeout(250);

    const systems = page.locator('#symptom-systems .sym-sys');
    expect(await systems.count()).toBeGreaterThan(1);
    await expect(page.locator('#symptom-head')).toContainText('系統');
  });

  test('DMA 系統の図が 2 枚とも同じ段に並ぶ (1 枚で終わらない)', async ({ page }) => {
    await setupThreeDocs(page);
    await openSymptom(page);
    await page.locator('#symptom-text').fill(MULTI_SYMPTOM);
    await page.waitForTimeout(250);

    const dma = page.locator('#symptom-systems .sym-sys[data-term="DMA"]');
    await expect(dma).toHaveCount(1);
    await expect(dma).toHaveAttribute('data-docs', '2');
    await expect(dma.locator('.sym-sys-doc')).toHaveCount(2);
  });

  test('当たらなかった系統の語が見出しに出る (未探索の系統に気付く)', async ({ page }) => {
    await setupThreeDocs(page);
    await openSymptom(page);
    await page.locator('#symptom-text').fill(MULTI_SYMPTOM);
    await page.waitForTimeout(250);
    await expect(page.locator('#symptom-head')).toContainText('当たらなかった語');
    await expect(page.locator('#symptom-head')).toContainText('割り込み');
  });

  test('系統の行を 1 クリックでその図のその行へ移れる', async ({ page }) => {
    await setupThreeDocs(page);
    await openSymptom(page);
    await page.locator('#symptom-text').fill(MULTI_SYMPTOM);
    await page.waitForTimeout(250);

    // SPI の図を見て手詰まり、という場面から DMA 側へ移る
    const row = page.locator('#symptom-systems .sym-sys[data-term="DMA"] .sym-sys-doc')
      .filter({ hasText: 'DMA_State' }).first();
    const target = (await row.count()) ? row
      : page.locator('#symptom-systems .sym-sys[data-term="DMA"] .sym-sys-doc').first();
    await target.click();
    await page.waitForTimeout(400);
    const dsl = await page.evaluate(() => /** @type {HTMLTextAreaElement} */ (document.getElementById('editor')).value);
    expect(dsl).toContain('Spi_TransmitDma');
  });
});

// BLK-primary-20260909-0703-wish: 当たった図を 1 枚ずつ開いて「シーケンスの
// メッセージに対応する状態が状態遷移図にあるか」を目で突き合わせていた。
// 突合の段があれば、矛盾のある図だけを開けば済む。
const SEQ_DMA_GAP = [
  '@startuml',
  'title dma_transfer_sequence',
  'participant Spi_Driver',
  'participant Dma_Ctrl',
  'Spi_Driver -> Dma_Ctrl : Spi_TransmitDma',
  'Dma_Ctrl -> Spi_Driver : Dma_FaultNotify',
  '@enduml',
].join('\n');

const STATE_DMA_PARTIAL = [
  '@startuml',
  'title dma_state',
  'state Idle',
  'state Transmitting_Dma',
  'Idle --> Transmitting_Dma : Spi_TransmitDma',
  'Transmitting_Dma --> Idle : TransferComplete',
  '@enduml',
].join('\n');

const FLOW_SYMPTOM = 'DMA転送がSpi_TransmitDmaのメッセージ付近で止まる';

async function setupFlowDocs(page) {
  await gotoApp(page);
  await typeDsl(page, SEQ_DMA_GAP);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, STATE_DMA_PARTIAL);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, CLS_ADC);
  await expect(page.locator('#tab-bar .tab')).toHaveCount(3);
}

test.describe('BLK-primary-0703 当たった図どうしの流れ突合', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('対応の無い流れを持つ図だけが浮き、対応済みの図は「開かなくてよい」と出る', async ({ page }) => {
    await setupFlowDocs(page);
    await openSymptom(page);
    await page.locator('#symptom-text').fill(FLOW_SYMPTOM);
    await page.waitForTimeout(300);

    await expect(page.locator('#symptom-flow')).toHaveAttribute('data-gap-docs', '1');
    await expect(page.locator('#symptom-flow-head')).toContainText('対応の無い流れ');
    await expect(page.locator('#symptom-flow-head')).toContainText('開かなくてよい');

    // 浮くのはシーケンス図。先頭に来る (開くべき図が一番上)
    const first = page.locator('#symptom-flow .sym-fl').first();
    await expect(first).toHaveAttribute('data-status', 'gap');
    // 図の名前はタブ名 (diagram1 = シーケンス図 / diagram2 = 状態遷移図)
    await expect(first).toHaveAttribute('data-doc-name', 'diagram1');
    await expect(first.locator('.sym-fl-gap')).toHaveCount(1);
    await expect(first.locator('.sym-fl-gap')).toContainText('Dma_FaultNotify');

    // 対応が全部付いた図は開かなくてよい側に落ちる
    const okRow = page.locator('#symptom-flow .sym-fl[data-doc-name="diagram2"]');
    await expect(okRow).toHaveAttribute('data-status', 'ok');
  });

  test('欠落した流れを 1 クリックでその図のその行へ開ける', async ({ page }) => {
    await setupFlowDocs(page);
    await openSymptom(page);
    await page.locator('#symptom-text').fill(FLOW_SYMPTOM);
    await page.waitForTimeout(300);

    const gap = page.locator('#symptom-flow .sym-fl-gap').first();
    await expect(gap).toBeVisible();
    await gap.click();
    await page.waitForTimeout(400);
    const dsl = await page.evaluate(() => /** @type {HTMLTextAreaElement} */ (document.getElementById('editor')).value);
    expect(dsl).toContain('Dma_FaultNotify');
  });

  test('突合を切れば段が消える (従来どおりの関連度順だけに戻せる)', async ({ page }) => {
    await setupFlowDocs(page);
    await openSymptom(page);
    await page.locator('#symptom-text').fill(FLOW_SYMPTOM);
    await page.waitForTimeout(300);
    await expect(page.locator('#symptom-flow .sym-fl').first()).toBeVisible();

    await page.locator('#symptom-cross').uncheck();
    await page.waitForTimeout(250);
    await expect(page.locator('#symptom-flow .sym-fl')).toHaveCount(0);
    await expect(page.locator('#symptom-flow-head')).toHaveText('');
    // 関連度順の列はそのまま残る
    expect(await page.locator('#symptom-results .sym-doc').count()).toBeGreaterThan(0);
  });
});
