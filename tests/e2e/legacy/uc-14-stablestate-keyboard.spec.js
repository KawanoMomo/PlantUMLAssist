const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, clickOverlayByLine } = require('../helpers');

test.describe('UC-14: StableState keyboard in rich editor', () => {
  // BLK-owner-20260924-2232-4: 本文欄の Tab は次の欄へ移る (空白を入れない)。以前は空白 2 つを入れていた。
  test('Tab in rich textarea moves focus to the next field without inserting spaces', async ({ page }) => {
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
    expect(val).toBe('hello');
    expect(await ta.evaluate((el) => document.activeElement === el)).toBe(false);
  });
});
