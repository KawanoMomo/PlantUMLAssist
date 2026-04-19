// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, clickOverlayByLine } = require('./helpers');

test.describe('UC-9: 参加者リネーム参照追従', () => {
  test('Database -> Auth に rename + 参照追従で関連 messages も更新', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-cache-spec.puml');
    await page.waitForTimeout(1500);

    // Database participant をクリック (line 4)
    await clickOverlayByLine(page, 4);
    await page.waitForTimeout(500);

    // Alias を 'Database' → 'Auth' に
    await page.locator('#seq-edit-alias').fill('Auth');
    await page.locator('#seq-edit-alias').blur();
    await page.waitForTimeout(500);

    var t = await getEditorText(page);
    expect(t).toContain('database Auth');
    expect(t).toContain('System -> Auth : query1');
    expect(t).toContain('Auth --> System : result1');
    expect(t).not.toContain('Database');
  });
});
