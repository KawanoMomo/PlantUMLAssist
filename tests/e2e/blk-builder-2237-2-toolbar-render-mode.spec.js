// @ts-check
// BLK-builder-20260907-2237-2 / design 1a: 上部バーに残すのはファイル名・検索・
// 状態表示・Export だけ。レンダリングモードの select は上部から外し、状態表示を
// 押すと設定の「レンダリング」タブが開く。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

test.describe('BLK-builder-2237-2 上部バーからレンダリングモードを外す', () => {
  test('上部バーに select は出ないが、値と change の窓口は残る', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#render-mode')).toBeHidden();
    await expect(page.locator('#toolbar #render-mode')).toHaveCount(0);
    await expect(page.locator('#toolbar-actions #render-mode')).toHaveCount(1);
    await expect(page.locator('#render-mode')).toHaveValue('local');
  });

  test('状態表示を押すと設定の「レンダリング」タブが開く', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#top-render-status').click();
    await expect(page.locator('#cfg-modal')).toBeVisible();
    await expect(page.locator('#cfg-pane-render')).toBeVisible();
    await expect(page.locator('#cfg-tab-render')).toHaveClass(/active/);
    await expect(page.locator('#cfg-render-modes .cfg-mode-card')).not.toHaveCount(0);
  });

  test('設定のレンダリングタブでモードを選ぶと select に流れる', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#top-render-status').click();
    await page.locator('#cfg-render-modes .cfg-mode-card[data-mode-id="online"] input').check();
    await page.locator('#cfg-ok').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#render-mode')).toHaveValue('online');
  });

  test('Ctrl+K からもモードを変えられる', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('レンダリング');
    await page.waitForTimeout(200);
    await page.locator('#cp-list .cp-item').first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('#render-mode')).toHaveValue(/local|online/);
  });
});
