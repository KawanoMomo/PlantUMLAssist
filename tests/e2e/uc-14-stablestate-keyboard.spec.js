const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, clickOverlayByLine } = require('./helpers');

test.describe('UC-14: StableState keyboard in rich editor', () => {
  test('Tab in rich textarea inserts 2 spaces', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);

    await clickOverlayByLine(page, 7);
    await page.waitForTimeout(400);

    var ta = page.locator('#seq-edit-msg-label-rle .rle-textarea');
    await ta.fill('hello');
    await ta.evaluate((el) => el.setSelectionRange(0, 0));
    await ta.focus();
    await page.keyboard.press('Tab');
    var val = await ta.inputValue();
    expect(val.substring(0, 2)).toBe('  ');
  });
});
