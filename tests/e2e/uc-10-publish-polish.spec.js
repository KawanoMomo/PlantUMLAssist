// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, clickOverlayByLine } = require('./helpers');

test.describe('UC-10: 公開前 polish', () => {
  test('title 設定 + autonumber on + label 編集', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-success-msgs.puml');
    await page.waitForTimeout(1500);

    // Title 設定 (deselect してからデフォルトビューを取得)
    await page.locator('#seq-title').fill('Auth Flow');
    await page.locator('#seq-set-title').click();
    await page.waitForTimeout(500);

    // autonumber on
    await page.locator('#seq-autonumber').check();
    await page.waitForTimeout(500);

    // Message label 編集 (line 4 = User -> Auth : login — title 挿入で +1 ずれる)
    // タイトル適用後の editor text を確認して対象 line を動的に決定する
    var txt = await getEditorText(page);
    var lines = txt.split('\n');
    var targetLine = -1;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('User -> Auth') >= 0) { targetLine = i + 1; break; }
    }
    expect(targetLine).toBeGreaterThan(0);

    await clickOverlayByLine(page, targetLine);
    await page.waitForTimeout(500);
    await page.locator('#seq-edit-msg-label-rle .rle-textarea').fill('Login (POST /auth)');
    await page.locator('#seq-edit-msg-label-rle .rle-textarea').blur();
    await page.waitForTimeout(500);

    var t = await getEditorText(page);
    expect(t).toContain('title Auth Flow');
    expect(t).toContain('autonumber');
    expect(t).toContain('Login (POST /auth)');
  });
});
