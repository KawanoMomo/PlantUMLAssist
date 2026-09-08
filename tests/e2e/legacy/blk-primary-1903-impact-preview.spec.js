// @ts-check
// BLK-primary-20260907-1903-wish: 影響範囲プレビュー。
// 一括置換パネルは「図ごとのヒット数」しか出さないので、置換してよいかは
// 置換後に各タブを開いて見比べるしかなかった。置換前の名前を打った時点で
// 「どの図の、どの種類の線 (継承/呼び出し/遷移) が影響するか」が出ることを見る。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const SEQ = '@startuml\nparticipant Spi_Driver\nparticipant SpiHw\nSpi_Driver -> SpiHw: transfer\n@enduml';
const CLS = '@startuml\nclass Spi_Driver\nclass Spi_DriverBase\nclass Logger\nSpi_DriverBase <|-- Spi_Driver\nSpi_Driver --> Logger\n@enduml';
const STATE = '@startuml\n[*] --> Idle\nstate Spi_Driver\nIdle --> Spi_Driver : Start\nSpi_Driver --> Idle : Done\n@enduml';

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
  await typeDsl(page, SEQ);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, CLS);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, STATE);
  await expect(page.locator('#tab-bar .tab')).toHaveCount(3);
}

async function openRename(page, from) {
  await page.locator('#btn-tab-rename').click();
  await expect(page.locator('#rename-panel')).toHaveClass(/open/);
  await page.locator('#rename-from').fill(from);
  await page.waitForTimeout(150);
}

test.describe('BLK-primary-1903 影響範囲プレビュー', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('置換前を打っただけで、何図に出るかと全体の内訳が出る', async ({ page }) => {
    await setupThreeDocs(page);
    await openRename(page, 'Spi_Driver');
    const head = page.locator('#rename-impact-head');
    await expect(head).toHaveAttribute('data-docs', '3');
    // 3 図合計 8 件 (sequence 2 / class 3 / state 3)
    await expect(head).toHaveAttribute('data-total', '8');
    await expect(head).toContainText('Spi_Driver は 3 図に出現');
    await expect(head).toContainText('継承 1 本');
  });

  test('図ごとに図種と関係の内訳が並ぶ', async ({ page }) => {
    await setupThreeDocs(page);
    await openRename(page, 'Spi_Driver');
    const rows = page.locator('#rename-impact .impact-doc');
    await expect(rows).toHaveCount(3);
    // クラス図は継承と関連、シーケンス図は participant と呼び出し、状態遷移図は遷移。
    const kinds = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
    expect(kinds.sort()).toEqual(['class', 'sequence', 'state']);
    const summaries = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-summary')));
    expect(summaries.join('\n')).toContain('継承 1 本・関連 1 本');
    expect(summaries.join('\n')).toContain('participant 1 個・呼び出し 1 本');
    expect(summaries.join('\n')).toContain('遷移 2 本');
  });

  test('内訳の合計は一括置換のヒット数と一致し、置換はそのまま実行できる', async ({ page }) => {
    await setupThreeDocs(page);
    await openRename(page, 'Spi_Driver');
    const impactTotal = await page.locator('#rename-impact-head').getAttribute('data-total');
    await expect(page.locator('#rename-summary')).toHaveAttribute('data-total', impactTotal || '');
    await page.locator('#rename-to').fill('Spi_Ctrl');
    await page.waitForTimeout(150);
    await page.locator('#btn-rename-apply').click();
    await expect(page.locator('#rename-summary')).toHaveAttribute('data-applied', '8');
  });

  test('出現しない名前ならその旨が出て、行は並ばない', async ({ page }) => {
    await setupThreeDocs(page);
    await openRename(page, 'NoSuchName');
    await expect(page.locator('#rename-impact-head')).toHaveAttribute('data-docs', '0');
    await expect(page.locator('#rename-impact .impact-doc')).toHaveCount(0);
  });
});
