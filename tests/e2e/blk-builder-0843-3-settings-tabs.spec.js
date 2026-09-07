// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

// BLK-builder-20260907-0843-3 — design 1a の設定モーダル 5 タブ。
// 自動保存 / レンダリング / エディタ / ショートカット / データ を切り替えられ、
// レンダリングモードとエディタの見た目が「保存」で確定する。
test.describe('設定モーダルの 5 タブ (design 1a)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => {
      localStorage.removeItem('plantuml-settings-tab');
      localStorage.removeItem('plantuml-editor-prefs');
    });
    await page.locator('#rail-config').click();  // design 1a で設定は左レールの ⚙ に移った
    await expect(page.locator('#cfg-modal')).toBeVisible();
  });

  test('5 タブが並び、既定は自動保存のペインだけが出る', async ({ page }) => {
    await expect(page.locator('#cfg-tabs .cfg-tab')).toHaveCount(5);
    await expect(page.locator('#cfg-tab-autosave')).toHaveClass(/active/);
    await expect(page.locator('#cfg-pane-autosave')).toBeVisible();
    await expect(page.locator('#cfg-pane-render')).toBeHidden();
    await expect(page.locator('#cfg-pane-shortcuts')).toBeHidden();
  });

  test('タブを押すとそのペインだけに切り替わる', async ({ page }) => {
    await page.locator('#cfg-tab-shortcuts').click();
    await expect(page.locator('#cfg-pane-shortcuts')).toBeVisible();
    await expect(page.locator('#cfg-pane-autosave')).toBeHidden();
    await expect(page.locator('#cfg-pane-shortcuts')).toContainText('Ctrl+K');
    await expect(page.locator('#cfg-pane-shortcuts')).toContainText('コマンドパレットを開く');

    await page.locator('#cfg-tab-data').click();
    await expect(page.locator('#cfg-pane-data')).toBeVisible();
    await expect(page.locator('#cfg-pane-shortcuts')).toBeHidden();
    await expect(page.locator('#cfg-clear-all')).toBeVisible();
  });

  test('レンダリングタブは現在のモードを写し、online を選ぶと外部送信を明示する', async ({ page }) => {
    await page.locator('#cfg-tab-render').click();
    await expect(page.locator('#cfg-pane-render input[value="local"]')).toBeChecked();
    await expect(page.locator('#cfg-render-note')).toContainText('外部送信はありません');

    await page.locator('#cfg-pane-render input[value="online"]').check();
    await expect(page.locator('#cfg-render-note')).toContainText('plantuml.com に送信');

    // 保存を押すまではツールバー側のモードを変えない (= 図は送信されない)。
    await expect(page.locator('#render-mode')).toHaveValue('local');
    await page.locator('#cfg-cancel').click();
    await expect(page.locator('#render-mode')).toHaveValue('local');
  });

  test('エディタタブの文字サイズと折り返しが保存で DSL エディタに効く', async ({ page }) => {
    await page.locator('#cfg-tab-editor').click();
    await page.locator('#cfg-editor-font').selectOption('17');
    await page.locator('#cfg-editor-wrap').check();
    await page.locator('#cfg-ok').click();
    await expect(page.locator('#cfg-modal')).toBeHidden();

    const style = await page.locator('#editor').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { fontSize: cs.fontSize, whiteSpace: cs.whiteSpace };
    });
    expect(style.fontSize).toBe('17px');
    expect(style.whiteSpace).toBe('pre-wrap');
  });

  test('選んだタブと見た目はモーダルを開き直しても残る', async ({ page }) => {
    await page.locator('#cfg-tab-editor').click();
    await page.locator('#cfg-editor-font').selectOption('20');
    await page.locator('#cfg-ok').click();
    await page.locator('#rail-config').click();  // design 1a で設定は左レールの ⚙ に移った
    await expect(page.locator('#cfg-tab-editor')).toHaveClass(/active/);
    await expect(page.locator('#cfg-editor-font')).toHaveValue('20');
  });

  test('✕ でモーダルを閉じられる', async ({ page }) => {
    await page.locator('#cfg-close').click();
    await expect(page.locator('#cfg-modal')).toBeHidden();
  });
});
