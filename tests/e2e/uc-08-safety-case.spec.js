// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, clickOverlayByLine } = require('./helpers');

test.describe('UC-8: IEC 61508 Safety Case', () => {
  test('fault detection note + エラー応答 alt の合成', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-cache-spec.puml');
    await page.waitForTimeout(1500);

    page.on('dialog', async (dialog) => {
      var msg = dialog.message();
      if (msg.indexOf('種類') >= 0) await dialog.accept('alt');
      else if (msg.indexOf('Label') >= 0) await dialog.accept('fault-handler');
      else await dialog.accept('');
    });

    await clickOverlayByLine(page, 6);
    await page.waitForTimeout(300);
    await page.locator('.seq-insert-note-after').click();
    await page.waitForTimeout(500);
    await page.locator('#seq-mod-ntext-rle .rle-textarea').fill('Fault detection: timeout > 5s');
    await page.locator('#seq-mod-ntarget').selectOption({ index: 0 });
    await page.locator('#seq-mod-confirm').click();
    await page.waitForTimeout(500);

    await clickOverlayByLine(page, 6);
    await page.waitForTimeout(300);
    await page.locator('.seq-wrap-block').click();
    await page.waitForTimeout(500);

    var t = await getEditorText(page);
    expect(t).toContain('Fault detection');
    expect(t).toContain('alt fault-handler');
  });
});
