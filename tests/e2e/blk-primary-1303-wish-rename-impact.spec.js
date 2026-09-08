// @ts-check
// BLK-primary-20260908-1303-wish: 仕様変更で影響範囲を洗う場面。
// ⇄ 一括置換はヒット件数しか出さないので「想定外の行に当たっていないか」は
// 適用してからしか分からなかった。適用の前に、当たった図の該当行が置換で
// どう変わるかを ▤ 変更サマリボードと同じ見た目で並べて確かめられることを見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const SPI_SEQ = '@startuml\nparticipant SpiDrv\nparticipant SpiHw\nSpiDrv -> SpiHw: transfer\n@enduml';
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

async function setupTwoDocs(page) {
  await gotoApp(page);
  await typeDsl(page, SPI_SEQ);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, CLS);
  await expect(page.locator('#tab-bar .tab')).toHaveCount(2);
}

async function openRename(page, from, to) {
  await page.locator('#btn-tab-rename').click();
  await expect(page.locator('#rename-panel')).toHaveClass(/open/);
  await page.locator('#rename-from').fill(from);
  if (to != null) await page.locator('#rename-to').fill(to);
  await page.waitForTimeout(150);
}

test.describe('BLK-primary-1303-wish 置換の影響を適用前に見る', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('ヒットした図ごとに、置換前後の該当行が並ぶ', async ({ page }) => {
    await setupTwoDocs(page);
    await openRename(page, 'SpiDrv', 'Spi_Driver');
    await page.locator('#btn-rename-preview').click();

    await expect(page.locator('#ri-modal')).toBeVisible();
    await expect(page.locator('#ri-summary')).toContainText('4 件 / 2 枚');
    await expect(page.locator('#ri-summary')).toContainText('「SpiDrv」→「Spi_Driver」');

    const entries = page.locator('#ri-body .cb-entry');
    await expect(entries).toHaveCount(2);
    // 変更前の行 (今) と変更後の行が対で出る
    await expect(page.locator('#ri-body tr.cb-del')).toContainText(['participant SpiDrv', 'SpiDrv -> SpiHw: transfer']);
    await expect(page.locator('#ri-body tr.cb-add')).toContainText(['participant Spi_Driver', 'Spi_Driver -> SpiHw: transfer']);
    // 巻き込まない行は変更行として出ない
    await expect(page.locator('#ri-body')).toContainText('SpiDrvTest');
    await expect(page.locator('#ri-body tr.cb-add')).not.toContainText(['class Spi_DriverTest']);
  });

  test('見ただけでは置換されない', async ({ page }) => {
    await setupTwoDocs(page);
    await openRename(page, 'SpiDrv', 'Spi_Driver');
    await page.locator('#btn-rename-preview').click();
    await expect(page.locator('#ri-modal')).toBeVisible();
    await page.locator('#ri-close').click();
    await expect(page.locator('#ri-modal')).toBeHidden();
    expect(await getEditorText(page)).toContain('class SpiDrv');
  });

  test('納得したらボードから置換できる', async ({ page }) => {
    await setupTwoDocs(page);
    await openRename(page, 'SpiDrv', 'Spi_Driver');
    await page.locator('#btn-rename-preview').click();
    await page.locator('#ri-apply').click();
    await page.waitForTimeout(400);

    await expect(page.locator('#ri-modal')).toBeHidden();
    const active = await getEditorText(page);
    expect(active).toContain('class Spi_Driver');
    expect(active).toContain('class SpiDrvTest');
  });

  test('置換後がまだでも、どの行に当たっているかは見られる', async ({ page }) => {
    await setupTwoDocs(page);
    await openRename(page, 'SpiDrv', null);
    await expect(page.locator('#btn-rename-preview')).toBeEnabled();
    await page.locator('#btn-rename-preview').click();
    await expect(page.locator('#ri-summary')).toContainText('置換後の名前を入れると変更後が出ます');
    await expect(page.locator('#ri-apply')).toBeDisabled();
  });

  test('当たる図が無ければ影響を見るボタンは押せない', async ({ page }) => {
    await setupTwoDocs(page);
    await openRename(page, 'NotThere', 'X');
    await expect(page.locator('#btn-rename-preview')).toBeDisabled();
  });

  test('「全文」に切り替えると省略行が畳まれずに出る', async ({ page }) => {
    await setupTwoDocs(page);
    await openRename(page, 'SpiDrv', 'Spi_Driver');
    await page.locator('#btn-rename-preview').click();
    const gapsBefore = await page.locator('#ri-body tr.cb-gap').count();
    await page.locator('#ri-full').check();
    await expect(page.locator('#ri-body tr.cb-gap')).toHaveCount(0);
    expect(gapsBefore).toBeGreaterThanOrEqual(0);
    await expect(page.locator('#ri-body')).toContainText('@startuml');
  });
});
