// @ts-check
// BLK-reviewer-20260907-2003: ◎トレースが、初期化専用シーケンスしか持たない系統の
// 初期化後の遷移を全部「どのシーケンスにも現れない」と出していた (9 系統中 8 系統・
// 計 40 件)。本物の記述漏れは dma 系統の 1 件だけで、残りは意図した粒度差。
// 宣言が無い系統では担当割合で粒度差を外し、外したことは画面で言う。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const ADC_STATE = '@startuml\n[*] --> Idle\nIdle --> Configured : Adc_Init\n'
  + 'Configured --> Sampling : StartConv\nSampling --> Configured : Complete\n'
  + 'Sampling --> Error : ConvError\nError --> Idle : Adc_Reset\n@enduml';
const ADC_INIT_SEQ = '@startuml\nparticipant App\nparticipant Adc\n'
  + 'App -> Adc : Adc_Init\nAdc --> App : InitDone\n@enduml';
const DMA_STATE = '@startuml\n[*] --> Idle\nIdle --> Transferring : StartTransfer\n'
  + 'Transferring --> Done : TransferComplete\nTransferring --> Error : TransferError\n'
  + 'Error --> Idle : Spi_Reset\n@enduml';
const DMA_SEQ = '@startuml\nparticipant Drv\nparticipant Dma\n'
  + 'Drv -> Dma : StartTransfer\nDma --> Drv : TransferComplete\n'
  + 'Dma --> Drv : TransferError\n@enduml';

async function freshWorkspace(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'localStorage', fileDir: './autosave' }));
    } catch (e) {}
  });
}

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(120);
}

async function renameActive(page, name) {
  await page.evaluate((n) => {
    const ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), n);
  }, name);
}

async function addDoc(page, dsl, name, first) {
  if (!first) await page.locator('#btn-tab-new').click();
  await typeDsl(page, dsl);
  await renameActive(page, name);
}

// 台本の 4.7: 9 系統ぶんの図を開いて ◎トレースを見る。
async function setupNineFamilies(page) {
  await gotoApp(page);
  const keys = ['adc', 'can', 'gpio', 'irq', 'spi', 'timer', 'uart', 'plantuml'];
  let first = true;
  for (const k of keys) {
    await addDoc(page, ADC_STATE.replace(/Adc_/g, k + '_'), k + '_state', first);
    first = false;
    await addDoc(page, ADC_INIT_SEQ.replace(/Adc_/g, k + '_'), k + '_init_sequence', false);
  }
  await addDoc(page, DMA_STATE, 'dma_state', false);
  await addDoc(page, DMA_SEQ, 'dma_transfer_sequence', false);
}

async function openTrace(page) {
  await page.locator('#btn-tab-trace').click();
  await expect(page.locator('#tc-modal')).toBeVisible();
}

test.describe('BLK-reviewer-2003: 初期化専用シーケンスの系統を全滅判定しない', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('初期化専用しか無い系統は「粒度が違う」と出て、漏れ 0 件になる', async ({ page }) => {
    await setupNineFamilies(page);
    await openTrace(page);
    await page.locator('#tc-family').selectOption('adc');
    const summary = page.locator('#tc-summary');
    await expect(summary).toHaveAttribute('data-missing', '0');
    await expect(summary).toContainText('粒度が違うため突き合わせていません');
    // 黙って 0 件にせず、見ていない件数と直し方を言う
    await expect(summary).toContainText('5 件');
    await expect(summary).toContainText('担当範囲を宣言');
    await expect(page.locator('#tc-table .tc-missing')).toHaveCount(0);
  });

  test('外した遷移は宣言欄に並び、その場で宣言に切り替えられる', async ({ page }) => {
    await setupNineFamilies(page);
    await openTrace(page);
    await page.locator('#tc-family').selectOption('adc');
    await expect(page.locator('#tc-scope-note')).toContainText('粒度が違うとして 5 件を外しています');
    await expect(page.locator('#tc-scope-out')).toContainText('粒度違いで見ていない遷移');
    await expect(page.locator('#tc-scope-out')).toContainText('Idle → Configured');
    // 宣言に切り替えれば、宣言した遷移だけが対象になる
    await expect(page.locator('.tc-scope-cb')).toHaveCount(5);
  });

  test('本物の記述漏れ (dma の Spi_Reset) は今までどおり赤く出る', async ({ page }) => {
    await setupNineFamilies(page);
    await openTrace(page);
    await page.locator('#tc-family').selectOption('dma');
    const summary = page.locator('#tc-summary');
    await expect(summary).toHaveAttribute('data-missing', '1');
    await expect(summary).toContainText('どのシーケンスにも現れない遷移 1 件 / 4 件');
    const bad = page.locator('#tc-table .tc-missing');
    await expect(bad).toHaveCount(1);
    await expect(bad).toContainText('Spi_Reset');
  });

  test('9 系統ぶんの判定が、系統を選ぶまでもなく一覧の見出しで読める', async ({ page }) => {
    await setupNineFamilies(page);
    await openTrace(page);
    const opts = page.locator('#tc-family option');
    await expect(opts).toHaveCount(9);
    // 粒度差で外した系統は「対象外 5 件」と付き、遷移を書いていない系統と区別が付く
    await expect(opts.nth(0)).toHaveText('adc (遷移 0, 漏れ 0 件, 対象外 5 件)');
    await expect(opts.nth(8)).toHaveText('dma (遷移 4, 漏れ 1 件)');
    // 目視で判定していた 40 件が 0 件になり、残るのは本物の 1 件だけ
    const totals = await page.locator('#tc-family option').evaluateAll(
      (els) => els.map((e) => Number((e.textContent || '').match(/漏れ (\d+) 件/)[1])));
    expect(totals.reduce((a, b) => a + b, 0)).toBe(1);
  });

  test('台本 4.7 の手数: ◎トレースを開いて 9 系統を読み切るまで', async ({ page }) => {
    await setupNineFamilies(page);
    let clicks = 0;
    let keys = 0;
    await page.locator('#btn-tab-trace').click(); clicks++;
    await expect(page.locator('#tc-modal')).toBeVisible();
    // 漏れの出ている系統だけを開く。見出しに件数が出るので、40 件を 1 件ずつ
    // 「これは粒度差」と判定する作業そのものが無くなった。
    await page.locator('#tc-family').selectOption('dma'); clicks++;
    await expect(page.locator('#tc-summary')).toHaveAttribute('data-missing', '1');
    await page.locator('#tc-table .tc-missing').click(); clicks++;
    await expect(page.locator('#editor')).toHaveValue(/Spi_Reset/);
    expect(clicks).toBeLessThanOrEqual(10);
    expect(keys).toBeLessThanOrEqual(50);
  });
});
