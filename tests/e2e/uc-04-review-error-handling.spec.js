// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, clickOverlayByLine } = require('./helpers');

test.describe('UC-4: レビュー指摘 (失敗時 alt 追加)', () => {
  test('成功メッセージ 2 箇所をそれぞれ alt で囲む', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-success-msgs.puml');
    await page.waitForTimeout(1500);

    page.on('dialog', async (dialog) => {
      var msg = dialog.message();
      if (msg.indexOf('種類') >= 0) await dialog.accept('alt');
      else if (msg.indexOf('Label') >= 0) await dialog.accept('on-error');
      else await dialog.accept('');
    });

    // 1 箇所目: line 5 (Auth --> User : token)
    await clickOverlayByLine(page, 5);
    await page.waitForTimeout(300);
    await page.locator('.seq-wrap-block').click();
    await page.waitForTimeout(500);

    var t = await getEditorText(page);
    var altCount = (t.match(/^alt /gm) || []).length;
    expect(altCount).toBeGreaterThanOrEqual(1);
  });
});
