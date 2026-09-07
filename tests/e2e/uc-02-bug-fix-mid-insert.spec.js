// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, clickOverlayByLine } = require('./helpers');

test.describe('UC-2: 不具合対応 (alt block を mid-insert)', () => {
  test('既存10msgの resp1 (line 10) を選択してalt blockで囲む', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-10msg.puml');
    await page.waitForTimeout(1500);  // overlay build wait

    await clickOverlayByLine(page, 10); // resp1
    await page.waitForTimeout(300);

    // FEAT-114: 2 連 prompt() ではなく seq-modal の 1 枚フォームで種類とラベルを入れる。
    await page.locator('.seq-wrap-block').first().click();
    await page.waitForSelector('#seq-wrap-kind');
    await page.selectOption('#seq-wrap-kind', 'alt');
    await page.fill('#seq-wrap-label', 'on-retry');
    await page.locator('#seq-wrap-confirm').click();
    await page.waitForTimeout(500);

    var t = await getEditorText(page);
    expect(t).toContain('alt on-retry');
    expect(t.indexOf('alt on-retry')).toBeLessThan(t.indexOf('System --> User : resp1'));
  });
});
