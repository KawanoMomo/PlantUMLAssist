const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, clickOverlayByLine } = require('./helpers');

test.describe('UC-11: selection highlight', () => {
  test('clicked message overlay gets selected class', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);

    await clickOverlayByLine(page, 7);
    await page.waitForTimeout(400);

    expect(await page.locator('#overlay-layer rect.selected').count()).toBe(1);
    var selLine = await page.locator('#overlay-layer rect.selected').first().getAttribute('data-line');
    expect(selLine).toBe('7');

    // 別 rect をクリック → 切り替わる
    await clickOverlayByLine(page, 8);
    await page.waitForTimeout(400);
    expect(await page.locator('#overlay-layer rect.selected').count()).toBe(1);
    selLine = await page.locator('#overlay-layer rect.selected').first().getAttribute('data-line');
    expect(selLine).toBe('8');
  });
});
