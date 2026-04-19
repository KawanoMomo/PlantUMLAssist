// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, clickOverlayByLine } = require('./helpers');

test.describe('UC-5: リファクタリング (範囲削除)', () => {
  test('Cache 関連 2 メッセージを範囲選択して一括削除', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-cache-flow.puml');
    await page.waitForTimeout(1500);

    page.on('dialog', async (dialog) => {
      // confirm dialog
      await dialog.accept();
    });

    // shift-click で2メッセージ選択 (line 7 = check, line 8 = miss)
    await clickOverlayByLine(page, 7);
    await page.waitForTimeout(200);
    await page.locator('#overlay-layer rect[data-line="8"]').first().click({ modifiers: ['Shift'] });
    await page.waitForTimeout(300);

    // range-selection panel が出ているはず
    await page.locator('.seq-bulk-delete').click();
    await page.waitForTimeout(500);

    var t = await getEditorText(page);
    expect(t).not.toContain('App -> Cache : check');
    expect(t).not.toContain('Cache --> App : miss');
    // 他のメッセージは残る
    expect(t).toContain('User -> App : req');
  });
});
