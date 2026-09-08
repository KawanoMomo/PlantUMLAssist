// @ts-check
// BLK-primary-20260907-2003-wish: 影響範囲プレビューから対象行へ飛べること、
// 「戻り値型を void から StatusType に変える」を全図へ 1 回で当てられること。
// これが無い間は、洗い出したあと各図をタブで開いて void の行を目で探していた。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const CLS = [
  '@startuml',
  'class Spi_Driver {',
  '  + Spi_Reset() : void',
  '  + Spi_Init(uint8 ch) : void',
  '}',
  '@enduml',
].join('\n');

const CLS2 = [
  '@startuml',
  'class Uart_Driver {',
  '  + Spi_Reset(uint8 ch) : void',
  '}',
  '@enduml',
].join('\n');

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
  await typeDsl(page, CLS);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, CLS2);
  await expect(page.locator('#tab-bar .tab')).toHaveCount(2);
}

async function openRename(page, from) {
  await page.locator('#btn-tab-rename').click();
  await expect(page.locator('#rename-panel')).toHaveClass(/open/);
  await page.locator('#rename-from').fill(from);
  await page.waitForTimeout(200);
}

test.describe('BLK-primary-2003 シグネチャ変更をまとめて当てる', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('影響範囲の各行に該当行が並び、押すとその図のその行へ飛ぶ', async ({ page }) => {
    await setupTwoDocs(page);
    await openRename(page, 'Spi_Reset');
    const lines = page.locator('#rename-impact .impact-line');
    await expect(lines).toHaveCount(2);
    await expect(lines.first()).toContainText('Spi_Reset');

    // 今開いているのは 2 枚目。1 枚目の行を押すと図が切り替わり、
    // エディタのキャレットがその行に乗る。
    const target = page.locator('#rename-impact .impact-line').filter({ hasText: '+ Spi_Reset() : void' }).first();
    await target.click();
    await page.waitForTimeout(300);
    const sel = await page.evaluate(() => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      return ed.value.slice(ed.selectionStart, ed.selectionEnd);
    });
    expect(sel.trim()).toBe('+ Spi_Reset() : void');
  });

  test('戻り値を入れると当たる行が出て、まとめて適用で 2 図が同時に変わる', async ({ page }) => {
    await setupTwoDocs(page);
    await openRename(page, 'Spi_Reset');
    await expect(page.locator('#rename-signature')).toHaveAttribute('data-hits', '2');
    await expect(page.locator('#rename-signature .sig-head')).toContainText('現在の戻り値: void');

    await page.locator('#sig-return').fill('StatusType');
    await page.waitForTimeout(200);
    await expect(page.locator('#rename-signature .sig-preview')).toHaveAttribute('data-changes', '2');

    await page.locator('#btn-sig-apply').click();
    await page.waitForTimeout(400);

    const dsls = await page.evaluate(() => window.MA.workspace.list().map((d) => d.dsl));
    expect(dsls.join('\n')).toContain('+ Spi_Reset() : StatusType');
    expect(dsls.join('\n')).toContain('+ Spi_Reset(uint8 ch) : StatusType');
    // 別メソッドは巻き込まない。
    expect(dsls.join('\n')).toContain('+ Spi_Init(uint8 ch) : void');
  });

  test('宣言が無い名前ならシグネチャ欄は出ない', async ({ page }) => {
    await setupTwoDocs(page);
    await openRename(page, 'Spi_Driver');
    await expect(page.locator('#rename-signature')).toHaveAttribute('data-hits', '0');
    await expect(page.locator('#btn-sig-apply')).toHaveCount(0);
  });
});
