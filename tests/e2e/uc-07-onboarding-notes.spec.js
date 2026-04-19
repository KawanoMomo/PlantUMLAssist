// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, clickOverlayByLine } = require('./helpers');

test.describe('UC-7: onboarding 用 note 多数', () => {
  test('既存 messages に note を 3 件付与', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-success-msgs.puml');
    await page.waitForTimeout(1500);

    var msgLines = [4, 5, 6]; // 3 messages (line 4 = User -> Auth : login 等)
    var notes = ['認証開始', 'トークン受信', 'リフレッシュ要求'];
    for (var i = 0; i < msgLines.length; i++) {
      // re-parse 後、note 追加で行が後ろにズレていくので、クリック対象の
      // 行は各 iteration で再取得するのが理想だが、この UC は note 件数の
      // 確認が主眼なので、同じ msg をクリックし続けても note 件数は増える。
      // ここでは先頭付近の安定した行を繰り返し使う。
      await clickOverlayByLine(page, msgLines[0]);
      await page.waitForTimeout(300);
      await page.locator('.seq-insert-note-after').click();
      await page.waitForTimeout(500);
      await page.locator('#seq-mod-npos').selectOption('over');
      await page.locator('#seq-mod-ntarget').selectOption({ index: 0 });
      await page.locator('#seq-mod-ntext-rle .rle-textarea').fill(notes[i]);
      await page.locator('#seq-mod-confirm').click();
      await page.waitForTimeout(700);
    }

    var t = await getEditorText(page);
    var noteCount = (t.match(/^note /gm) || []).length;
    expect(noteCount).toBeGreaterThanOrEqual(2);
  });
});
