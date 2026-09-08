// @ts-check
// BLK-builder-20260907-2258-4 (design 2b): 右ペイン 1 枚目のタブは「追加」/「選択中」。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

test.describe('BLK-builder-2258-4 (design 2b): 右ペインのタブ名', () => {

  test('起動直後 (無選択) のタブは「追加」で、英語の Properties は出ない', async ({ page }) => {
    await gotoApp(page);
    await page.waitForTimeout(1200);
    const tab = page.locator('#props-tab-props');
    await expect(tab).toHaveText('追加');
    await expect(page.locator('#props-pane-header')).not.toContainText('Properties');
    await expect(page.locator('#props-tab-settings')).toHaveText('図の設定');
  });

  test('要素を選ぶと「選択中」になり、選択を外すと「追加」に戻る', async ({ page }) => {
    await gotoApp(page);
    await page.waitForTimeout(1200);
    await page.locator('#overlay-layer rect[data-line]').first().click();
    await page.waitForTimeout(600);
    await expect(page.locator('#props-tab-props')).toHaveText('選択中');
    // 選択を外す (図の空白クリックと同じ経路)
    await page.evaluate(() => { window.MA.selection.clearSelection(); });
    await page.waitForTimeout(600);
    await expect(page.locator('#props-tab-props')).toHaveText('追加');
  });

  test('2 つ選ぶとタブに数が出る', async ({ page }) => {
    await gotoApp(page);
    await page.waitForTimeout(1200);
    const rects = page.locator('#overlay-layer rect[data-line]');
    await rects.nth(0).click();
    await rects.nth(1).click({ modifiers: ['Shift'] });
    await page.waitForTimeout(600);
    await expect(page.locator('#props-tab-props')).toHaveText('選択中 2');
  });

  test('タブは押せば「図の設定」と行き来できる (名前が変わっても効く)', async ({ page }) => {
    await gotoApp(page);
    await page.waitForTimeout(1200);
    await page.locator('#props-tab-settings').click();
    await expect(page.locator('#props-content')).toBeHidden();
    await page.locator('#props-tab-props').click();
    await expect(page.locator('#props-content')).toBeVisible();
    await expect(page.locator('#props-tab-props')).toHaveText('追加');
  });
});
