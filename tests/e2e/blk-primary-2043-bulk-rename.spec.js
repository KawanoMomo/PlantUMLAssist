// @ts-check
// BLK-primary-20260906-2043: 複数の図をまたいで部品名を一括置換する。
// 業務では 6 枚の図に同じ部品名が現れ、1 語直すのに図ごとに全文を打ち直していた。
// 置換前・置換後を 1 度入力するだけで全図が直ることを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const SPI_SEQ = '@startuml\nparticipant SpiDrv\nparticipant SpiHw\nSpiDrv -> SpiHw: transfer\n@enduml';
const CAN_SEQ = '@startuml\nparticipant CanDrv\nparticipant SpiDrv\nCanDrv -> SpiDrv: notify\n@enduml';
const CLS = '@startuml\nclass SpiDrv\nclass SpiDrvTest\nSpiDrv <|-- SpiDrvTest\n@enduml';

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

// 3 枚のタブを SPI_SEQ / CAN_SEQ / CLS で用意する。
async function setupThreeDocs(page) {
  await gotoApp(page);
  await typeDsl(page, SPI_SEQ);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, CAN_SEQ);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, CLS);
  await expect(page.locator('#tab-bar .tab')).toHaveCount(3);
}

async function fillRename(page, from, to) {
  await page.locator('#btn-tab-rename').click();
  await expect(page.locator('#rename-panel')).toHaveClass(/open/);
  await page.locator('#rename-from').fill(from);
  await page.locator('#rename-to').fill(to);
  await page.waitForTimeout(100);
}

test.describe('BLK-primary-2043 部品名の一括置換', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('置換前を入れると図ごとのヒット数が出る', async ({ page }) => {
    await setupThreeDocs(page);
    await fillRename(page, 'SpiDrv', 'Spi_Driver');
    const hits = page.locator('#rename-hits .hit');
    await expect(hits).toHaveCount(3);
    // SPI_SEQ 2件 / CAN_SEQ 2件 / CLS 2件 (SpiDrvTest は巻き込まない)
    await expect(page.locator('#rename-summary')).toHaveAttribute('data-total', '6');
  });

  test('1回の入力で開いている図すべてが置換される', async ({ page }) => {
    await setupThreeDocs(page);
    await fillRename(page, 'SpiDrv', 'Spi_Driver');
    await page.locator('#btn-rename-apply').click();
    await page.waitForTimeout(300);

    // アクティブなクラス図はその場で書き換わり、SpiDrvTest は残る
    const active = await getEditorText(page);
    expect(active).toContain('class Spi_Driver');
    expect(active).toContain('class SpiDrvTest');

    // 他のタブも置換済み
    const stored = await page.evaluate(() =>
      window.MA.workspace.list().map((d) => d.dsl));
    expect(stored.join('\n')).not.toMatch(/\bSpiDrv\b/);
    expect(stored[0]).toContain('participant Spi_Driver');
    expect(stored[1]).toContain('CanDrv -> Spi_Driver');
  });

  test('「このタブのみ」ならアクティブな図だけ変わる', async ({ page }) => {
    await setupThreeDocs(page);
    await fillRename(page, 'SpiDrv', 'Spi_Driver');
    await page.locator('#rename-all-docs').uncheck();
    await page.waitForTimeout(100);
    await expect(page.locator('#rename-hits .hit')).toHaveCount(1);
    await page.locator('#btn-rename-apply').click();
    await page.waitForTimeout(300);

    const stored = await page.evaluate(() =>
      window.MA.workspace.list().map((d) => d.dsl));
    expect(stored[0]).toContain('participant SpiDrv');
    expect(stored[2]).toContain('class Spi_Driver');
  });

  test('見つからない名前・不正な名前では置換ボタンが押せない', async ({ page }) => {
    await setupThreeDocs(page);
    await fillRename(page, 'NoSuchPart', 'X');
    await expect(page.locator('#btn-rename-apply')).toBeDisabled();
    await page.locator('#rename-from').fill('SpiDrv');
    await page.locator('#rename-to').fill('Spi Driver');
    await page.waitForTimeout(100);
    await expect(page.locator('#btn-rename-apply')).toBeDisabled();
    await page.locator('#rename-to').fill('Spi_Driver');
    await page.waitForTimeout(100);
    await expect(page.locator('#btn-rename-apply')).toBeEnabled();
  });

  test('置換はキー入力が置換前後の2語だけで済む', async ({ page }) => {
    await setupThreeDocs(page);
    await page.locator('#btn-tab-rename').click();
    // 実キー入力で行う (fill ではなく type) — 手数が語長ぶんで収まることの確認
    await page.locator('#rename-from').type('SpiDrv');
    await page.locator('#rename-to').type('Spi_Driver');
    await page.waitForTimeout(150);
    await page.locator('#rename-to').press('Enter');
    await page.waitForTimeout(300);
    const stored = await page.evaluate(() =>
      window.MA.workspace.list().map((d) => d.dsl).join('\n'));
    expect(stored).not.toMatch(/\bSpiDrv\b/);
    expect(stored).toContain('Spi_Driver');
  });

  test('置換後に Ctrl+Z でアクティブな図が元に戻る', async ({ page }) => {
    await setupThreeDocs(page);
    await fillRename(page, 'SpiDrv', 'Spi_Driver');
    await page.locator('#btn-rename-apply').click();
    await page.waitForTimeout(300);
    await page.locator('#editor').press('Control+z');
    await page.waitForTimeout(300);
    expect(await getEditorText(page)).toContain('class SpiDrv');
  });
});
