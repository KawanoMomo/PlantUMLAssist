// @ts-check
// BLK-primary-20260907-0823-wish: 系統横断の粒度・命名の整合性チェック。
// ADC 系 3 枚の IRQ ハンドシェイクが揃っているかを 3 ファイル読み比べずに済み、
// DMA 系の sequence 4 メッセージ対 state 1 本道の粒度不一致を、reviewer に
// 指摘される前に画面が挙げることを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const ADC_SEQ = '@startuml\nparticipant Drv\nparticipant Adc\n'
  + 'Drv -> Adc : ConfigureChannel\nDrv -> Adc : EnableIrq\nAdc --> Drv : IrqAck\n@enduml';
const ADC_STATE = '@startuml\n[*] --> Idle\nIdle --> Configured : configure_channel\n'
  + 'Configured --> Armed : enable_irq\nArmed --> Idle : irq_ack\n@enduml';
const DMA_SEQ = '@startuml\nparticipant Drv\nparticipant Dma\n'
  + 'Drv -> Dma : ConfigureChannel\nDrv -> Dma : SetSrcDst\n'
  + 'Drv -> Dma : EnableDmaReq\nDrv -> Dma : ArmChannel\n@enduml';
const DMA_STATE = '@startuml\nConfigured --> Transferring_Active : arm channel\n@enduml';

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

// タブ名は系統キーの元なので、doc を作るたびに名前を付ける。
async function renameActive(page, name) {
  await page.evaluate((n) => {
    const ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), n);
  }, name);
}

async function setupFourDocs(page) {
  await gotoApp(page);
  await typeDsl(page, ADC_SEQ);
  await renameActive(page, 'Adc_Seq');
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, ADC_STATE);
  await renameActive(page, 'Adc_State');
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, DMA_SEQ);
  await renameActive(page, 'Dma_Seq');
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, DMA_STATE);
  await renameActive(page, 'Dma_State');
  await expect(page.locator('#tab-bar .tab')).toHaveCount(4);
}

async function openFamilyAudit(page) {
  await page.locator('#btn-tab-family').click();
  await expect(page.locator('#fa-modal')).toBeVisible();
}

test.describe('BLK-primary-0823 系統チェック', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('1 クリックで系統ごとの突合が開き、系統を選べる', async ({ page }) => {
    await setupFourDocs(page);
    await openFamilyAudit(page);
    const opts = page.locator('#fa-family option');
    await expect(opts).toHaveCount(2);
    await expect(opts.nth(0)).toHaveText(/^adc \(2 枚/);
    await expect(opts.nth(1)).toHaveText(/^dma \(2 枚/);
  });

  test('ADC 系は綴りが違っても揃っていれば食い違い 0 件で終わる', async ({ page }) => {
    await setupFourDocs(page);
    await openFamilyAudit(page);
    const summary = page.locator('#fa-summary');
    await expect(summary).toHaveAttribute('data-mismatches', '0');
    await expect(summary).toContainText('揃っています');
    await expect(page.locator('#fa-matrix .fa-mismatch')).toHaveCount(0);
    // ConfigureChannel と configure_channel は同じ 1 行に畳まれる。
    await expect(page.locator('#fa-matrix .fa-row')).toHaveCount(3);
  });

  test('DMA 系は片方にしか無いメッセージ名を挙げる (粒度不一致)', async ({ page }) => {
    await setupFourDocs(page);
    await openFamilyAudit(page);
    await page.locator('#fa-family').selectOption('dma');
    const summary = page.locator('#fa-summary');
    await expect(summary).toHaveAttribute('data-mismatches', '3');
    const bad = page.locator('#fa-matrix .fa-mismatch');
    await expect(bad).toHaveCount(3);
    await expect(bad.nth(0)).toContainText('ConfigureChannel');
    await expect(bad.nth(1)).toContainText('SetSrcDst');
    await expect(bad.nth(2)).toContainText('EnableDmaReq');
    // 両方にある ArmChannel は食い違いに数えない。
    await expect(page.locator('#fa-matrix .fa-row[data-key="armchannel"]')).not.toHaveClass(/fa-mismatch/);
    await expect(bad.nth(0)).toHaveAttribute('data-only-in', 'Dma_Seq');
  });

  test('● のセルからその図へ飛べる', async ({ page }) => {
    await setupFourDocs(page);
    await openFamilyAudit(page);
    await page.locator('#fa-family').selectOption('dma');
    await page.locator('#fa-matrix .fa-row[data-key="armchannel"] .fa-cell[data-present="1"]').first().click();
    await expect(page.locator('#fa-modal')).toBeHidden();
    await expect(page.locator('#editor')).toHaveValue(/ArmChannel/);
  });

  test('系統が組めない状態では、その旨を出して黙って空表にしない', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, ADC_SEQ);
    await renameActive(page, 'Adc_Seq');
    await openFamilyAudit(page);
    await expect(page.locator('#fa-empty')).toBeVisible();
    await expect(page.locator('#fa-empty')).toContainText('2 枚以上');
  });

  test('コマンドパレットからも開ける', async ({ page }) => {
    await setupFourDocs(page);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('系統');
    await page.keyboard.press('Enter');
    await expect(page.locator('#fa-modal')).toBeVisible();
  });
});
