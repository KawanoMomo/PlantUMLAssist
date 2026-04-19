// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, clickOverlayByLine } = require('./helpers');

test.describe('UC-2: 不具合対応 (alt block を mid-insert)', () => {
  test('既存10msgの resp1 (line 10) を選択してalt blockで囲む', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-10msg.puml');
    await page.waitForTimeout(1500);  // overlay build wait

    // dialog 自動回答
    page.on('dialog', async (dialog) => {
      var msg = dialog.message();
      if (msg.indexOf('種類') >= 0) await dialog.accept('alt');
      else if (msg.indexOf('Label') >= 0) await dialog.accept('on-retry');
      else await dialog.accept('');
    });

    await clickOverlayByLine(page, 10); // resp1
    await page.waitForTimeout(300);
    await page.locator('.seq-wrap-block').click();
    await page.waitForTimeout(500);

    var t = await getEditorText(page);
    expect(t).toContain('alt on-retry');
    expect(t.indexOf('alt on-retry')).toBeLessThan(t.indexOf('System --> User : resp1'));
  });
});
