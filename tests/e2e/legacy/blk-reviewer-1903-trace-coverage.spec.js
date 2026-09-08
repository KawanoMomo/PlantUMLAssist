// @ts-check
// BLK-reviewer-20260907-1903-wish: 状態遷移図の遷移が、同じ系統のシーケンス図の
// どれにも現れない「トレース漏れ」を機械的に指摘する画面。
// dma_state の `Error --> Idle : Spi_Reset` が dma_transfer_sequence の
// どのメッセージにも対応しないことを、目視の総当たりではなく 1 画面で出す。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const DMA_STATE = '@startuml\n[*] --> Idle\nIdle --> Transferring : StartTransfer\n'
  + 'Transferring --> Done : TransferComplete\nTransferring --> Error : TransferError\n'
  + 'Error --> Idle : Spi_Reset\n@enduml';
const DMA_SEQ = '@startuml\nparticipant Drv\nparticipant Dma\n'
  + 'Drv -> Dma : StartTransfer\nDma --> Drv : TransferComplete\n'
  + 'Dma --> Drv : TransferError\n@enduml';
const ADC_STATE = '@startuml\n[*] --> Idle\nIdle --> Configured : configure_channel\n@enduml';
const ADC_SEQ = '@startuml\nparticipant Drv\nparticipant Adc\n'
  + 'Drv -> Adc : 1. Configure Channel()\n@enduml';

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
  await page.waitForTimeout(150);
}

async function renameActive(page, name) {
  await page.evaluate((n) => {
    const ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), n);
  }, name);
}

async function setupDocs(page) {
  await gotoApp(page);
  await typeDsl(page, DMA_STATE);
  await renameActive(page, 'dma_state');
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, DMA_SEQ);
  await renameActive(page, 'dma_transfer_sequence');
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, ADC_STATE);
  await renameActive(page, 'adc_state');
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, ADC_SEQ);
  await renameActive(page, 'adc_init_sequence');
  await expect(page.locator('#tab-bar .tab')).toHaveCount(4);
}

async function openTrace(page) {
  await page.locator('#btn-tab-trace').click();
  await expect(page.locator('#tc-modal')).toBeVisible();
}

test.describe('BLK-reviewer-1903 トレースカバレッジ', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('1 クリックで開き、状態遷移図を持つ系統だけが選べる', async ({ page }) => {
    await setupDocs(page);
    await openTrace(page);
    const opts = page.locator('#tc-family option');
    await expect(opts).toHaveCount(2);
    await expect(opts.nth(0)).toHaveText(/^dma \(遷移 4, 漏れ 1 件\)$/);
    await expect(opts.nth(1)).toHaveText(/^adc \(遷移 1, 漏れ 0 件\)$/);
  });

  test('どのシーケンスにも現れない遷移だけが赤くなる', async ({ page }) => {
    await setupDocs(page);
    await openTrace(page);
    await page.locator('#tc-family').selectOption('dma');
    const summary = page.locator('#tc-summary');
    await expect(summary).toHaveAttribute('data-missing', '1');
    await expect(summary).toContainText('どのシーケンスにも現れない遷移 1 件 / 4 件');
    const bad = page.locator('#tc-table .tc-missing');
    await expect(bad).toHaveCount(1);
    await expect(bad).toContainText('Spi_Reset');
    await expect(bad).toContainText('Error → Idle');
    // 現れている 3 件は、どのシーケンスで見つかったかを名前で出す。
    await expect(page.locator('#tc-table .tc-row[data-label="StartTransfer"]'))
      .toContainText('dma_transfer_sequence');
  });

  test('綴りが違うだけの対応は漏れにしない', async ({ page }) => {
    await setupDocs(page);
    await openTrace(page);
    await page.locator('#tc-family').selectOption('adc');
    await expect(page.locator('#tc-summary')).toHaveAttribute('data-missing', '0');
    await expect(page.locator('#tc-summary')).toContainText('漏れ 0 件');
  });

  test('赤い行からその遷移の書かれた図の行へ飛べる', async ({ page }) => {
    await setupDocs(page);
    await openTrace(page);
    await page.locator('#tc-family').selectOption('dma');
    await page.locator('#tc-table .tc-missing').click();
    await expect(page.locator('#tc-modal')).toBeHidden();
    await expect(page.locator('#editor')).toHaveValue(/Spi_Reset/);
    const sel = await page.evaluate(() => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      return ed.value.slice(ed.selectionStart, ed.selectionEnd);
    });
    expect(sel).toBe('Error --> Idle : Spi_Reset');
  });

  test('シーケンス図が無い系統は「漏れ 0 件」と言わずに突き合わせ不能と出す', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DMA_STATE);
    await renameActive(page, 'dma_state');
    await openTrace(page);
    const summary = page.locator('#tc-summary');
    await expect(summary).toHaveAttribute('data-comparable', '0');
    await expect(summary).toContainText('シーケンス図が無いため突き合わせていません');
  });

  test('状態遷移図が 1 枚も開かれていなければ、その旨を出して空表にしない', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DMA_SEQ);
    await renameActive(page, 'dma_transfer_sequence');
    await openTrace(page);
    await expect(page.locator('#tc-empty')).toBeVisible();
    await expect(page.locator('#tc-empty')).toContainText('状態遷移図が開かれていません');
  });

  test('コマンドパレットからも開ける', async ({ page }) => {
    await setupDocs(page);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('トレース');
    await page.keyboard.press('Enter');
    await expect(page.locator('#tc-modal')).toBeVisible();
  });
});
