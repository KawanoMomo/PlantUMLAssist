// @ts-check
// BLK-reviewer-20260906-2043: 図をまたいだ部品名の突合を機械的に行う。
// レビューでは 7〜8 枚の DSL を全文読み、participant / class / 状態名を
// 頭の中で名寄せしていた。表記揺れ・宣言なし・図 × 名前の対照表が
// 1 クリックで出て、揺れをその場で統一できることを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

const SPI_SEQ = '@startuml\nparticipant SpiDrv\nparticipant IRQCtrl\nSpiDrv -> IRQCtrl: request\n@enduml';
const CAN_SEQ = '@startuml\nparticipant CanDrv\nparticipant IrqCtrl\nCanDrv -> IrqCtrl: notify\n@enduml';
const CLS = '@startuml\nclass SpiDrv\nclass CanDrv\nCanDrv --> DmaCtrl: uses\n@enduml';

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
  await page.waitForTimeout(200);
}

async function setupThreeDocs(page) {
  await gotoApp(page);
  await typeDsl(page, SPI_SEQ);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, CAN_SEQ);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, CLS);
  await expect(page.locator('#tab-bar .tab')).toHaveCount(3);
}

async function openAudit(page) {
  await page.locator('#btn-tab-audit').click();
  await expect(page.locator('#na-modal')).toBeVisible();
}

test.describe('BLK-reviewer-2043 名前突合', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('1 クリックで突合結果が開く', async ({ page }) => {
    await setupThreeDocs(page);
    await openAudit(page);
    const summary = page.locator('#na-summary');
    await expect(summary).toHaveAttribute('data-docs', '3');
    await expect(summary).toHaveAttribute('data-variants', '1');
    await expect(summary).toHaveAttribute('data-undeclared', '1');
  });

  test('IRQCtrl と IrqCtrl が表記揺れとして並ぶ', async ({ page }) => {
    await setupThreeDocs(page);
    await openAudit(page);
    const rows = page.locator('.na-variant-row[data-key="irqctrl"]');
    await expect(rows).toHaveCount(2);
    await expect(page.locator('#na-variants')).toContainText('IRQCtrl');
    await expect(page.locator('#na-variants')).toContainText('IrqCtrl');
  });

  test('どの図にも宣言が無い名前を挙げる', async ({ page }) => {
    await setupThreeDocs(page);
    await openAudit(page);
    await expect(page.locator('#na-undeclared')).toContainText('DmaCtrl');
  });

  test('図 × 部品名の対照表に全図が列として出る', async ({ page }) => {
    await setupThreeDocs(page);
    await openAudit(page);
    const row = page.locator('.na-matrix-row[data-name="SpiDrv"]');
    await expect(row).toHaveCount(1);
    await expect(row.locator('.na-cell')).toHaveCount(3);
    // SPI シーケンスとクラス図にあり、CAN シーケンスには無い
    await expect(row.locator('.na-cell').nth(0)).toHaveAttribute('data-present', '1');
    await expect(row.locator('.na-cell').nth(1)).toHaveAttribute('data-present', '0');
    await expect(row.locator('.na-cell').nth(2)).toHaveAttribute('data-present', '1');
  });

  test('「これに統一」で揺れが 1 クリックで解消する', async ({ page }) => {
    await setupThreeDocs(page);
    await openAudit(page);
    await page.locator('.na-variant-row[data-name="IRQCtrl"] .na-unify').click();
    await page.waitForTimeout(400);
    // 開き直された結果には揺れが残らない
    await expect(page.locator('#na-summary')).toHaveAttribute('data-variants', '0');
    await expect(page.locator('#na-no-variants')).toBeVisible();
  });

  test('統一は開いている別の図の DSL まで直す', async ({ page }) => {
    await setupThreeDocs(page);
    await openAudit(page);
    await page.locator('.na-variant-row[data-name="IRQCtrl"] .na-unify').click();
    await page.waitForTimeout(400);
    await page.locator('#na-close').click();
    // CAN シーケンス (2 枚目) の IrqCtrl が IRQCtrl になっている
    await page.locator('#tab-bar .tab').nth(1).click();
    await page.waitForTimeout(300);
    const text = await getEditorText(page);
    expect(text).toContain('IRQCtrl');
    expect(text).not.toContain('IrqCtrl');
  });

  test('● のセルからその図へ移動できる', async ({ page }) => {
    await setupThreeDocs(page);
    await openAudit(page);
    // SpiDrv は 1 枚目にある。3 枚目を開いた状態からそこへ飛ぶ
    await page.locator('.na-matrix-row[data-name="SpiDrv"] .na-cell').nth(0).click();
    await page.waitForTimeout(300);
    await expect(page.locator('#na-modal')).toBeHidden();
    const text = await getEditorText(page);
    expect(text).toContain('participant IRQCtrl');
  });

  test('揺れが無ければ「揺れはありません」と出る', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, SPI_SEQ);
    await openAudit(page);
    await expect(page.locator('#na-no-variants')).toBeVisible();
    await expect(page.locator('#na-summary')).toHaveAttribute('data-variants', '0');
  });
});
