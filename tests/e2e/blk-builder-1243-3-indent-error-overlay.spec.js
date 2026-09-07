// @ts-check
// BLK-builder-20260907-1243-3: design「1a 設定と網羅」5a の残り 2 項目 —
// エディタの「インデント幅」が Tab キーに効くこと、
// 「描画エラーを図の上に重ねて表示」で直前の図が消えないこと。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

async function openTab(page, tab) {
  await page.locator('#rail-config').click();
  await expect(page.locator('#cfg-modal')).toBeVisible();
  await page.locator('#cfg-tab-' + tab).click();
  await expect(page.locator('#cfg-pane-' + tab)).toBeVisible();
}

// エディタ末尾にカーソルを置いて Tab を押す。
async function tabAtEnd(page, shift) {
  await page.locator('#editor').click();
  await page.evaluate(() => {
    var ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = ed.value + '\n';
    ed.selectionStart = ed.selectionEnd = ed.value.length;
  });
  await page.locator('#editor').press(shift ? 'Shift+Tab' : 'Tab');
}

test.describe('BLK-builder-1243-3 インデント幅と描画エラーの重ね表示', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('エディタタブにインデント幅の 3 択が出る', async ({ page }) => {
    await gotoApp(page);
    await openTab(page, 'editor');
    const segs = page.locator('#cfg-editor-indent .cfg-seg');
    await expect(segs).toHaveCount(3);
    await expect(segs.nth(0)).toHaveText('2');
    await expect(segs.nth(1)).toHaveText('4');
    await expect(segs.nth(2)).toHaveText('Tab');
    // 既定は 2 スペース
    await expect(segs.nth(0)).toHaveAttribute('aria-checked', 'true');
  });

  test('既定 (2) の Tab は 2 スペース入る', async ({ page }) => {
    await gotoApp(page);
    await tabAtEnd(page, false);
    const text = await page.locator('#editor').inputValue();
    expect(text.split('\n').pop()).toBe('  ');
  });

  test('4 を選んで保存すると Tab が 4 スペースになる', async ({ page }) => {
    await gotoApp(page);
    await openTab(page, 'editor');
    await page.locator('#cfg-editor-indent .cfg-seg[data-indent="4"]').click();
    await page.locator('#cfg-ok').click();
    await expect(page.locator('#cfg-modal')).toBeHidden();
    await tabAtEnd(page, false);
    expect((await page.locator('#editor').inputValue()).split('\n').pop()).toBe('    ');
    // Shift+Tab で同じ 1 単位ぶん戻る
    await page.locator('#editor').press('Shift+Tab');
    expect((await page.locator('#editor').inputValue()).split('\n').pop()).toBe('');
  });

  test('Tab を選んで保存するとタブ文字が入り、指定は開き直しても残る', async ({ page }) => {
    await gotoApp(page);
    await openTab(page, 'editor');
    await page.locator('#cfg-editor-indent .cfg-seg[data-indent="tab"]').click();
    await page.locator('#cfg-ok').click();
    await tabAtEnd(page, false);
    expect((await page.locator('#editor').inputValue()).split('\n').pop()).toBe('\t');
    await openTab(page, 'editor');
    await expect(page.locator('#cfg-editor-indent .cfg-seg[data-indent="tab"]'))
      .toHaveAttribute('aria-checked', 'true');
  });

  test('レンダリングタブに「描画エラーを図の上に重ねて表示」があり既定で入っている', async ({ page }) => {
    await gotoApp(page);
    await openTab(page, 'render');
    await expect(page.locator('#cfg-render-error-overlay')).toBeChecked();
  });

  // PlantUML は文法エラーでもエラー図を 200 で返すので、描画の失敗そのものは
  // /render を落として作る (server ダウン・Java 無しに相当)。
  async function breakRender(page) {
    await page.route('**/render', (route) => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'render failed (test)' }),
    }));
    await page.locator('#editor').press('End');
    await page.locator('#editor').type(' ');
  }

  test('描画に失敗しても直前の図が残り、エラーが上に重なる', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#preview-svg svg')).toBeVisible();
    await breakRender(page);
    await expect(page.locator('#render-error-overlay')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#render-error-overlay')).toContainText('render failed (test)');
    // 直前まで出ていた図は消えない
    await expect(page.locator('#preview-svg svg')).toBeVisible();
  });

  test('チェックを外すと従来どおり図がエラー 1 行に差し替わる', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#preview-svg svg')).toBeVisible();
    await openTab(page, 'render');
    await page.locator('#cfg-render-error-overlay').uncheck();
    await page.locator('#cfg-ok').click();
    await expect(page.locator('#cfg-modal')).toBeHidden();
    await breakRender(page);
    await expect(page.locator('#preview-svg')).toContainText('Render error', { timeout: 15000 });
    await expect(page.locator('#preview-svg svg')).toHaveCount(0);
    await expect(page.locator('#render-error-overlay')).toBeHidden();
  });
});
