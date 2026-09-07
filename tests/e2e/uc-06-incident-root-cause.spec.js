// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, clickOverlayByLine } = require('./helpers');

test.describe('UC-6: 本番障害 root cause 反映', () => {
  test('既存 message に note 追加 + alt 囲み', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-cache-spec.puml');
    await page.waitForTimeout(1500);

    // line 6 = System -> Database : query1
    await clickOverlayByLine(page, 6);
    await page.waitForTimeout(300);

    // 「↓ この後に注釈追加」 → modal が出る
    await page.locator('.seq-insert-note-after').click();
    await page.waitForTimeout(500);

    await page.locator('#seq-mod-npos').selectOption('over');
    await page.locator('#seq-mod-ntarget').selectOption('Database');
    await page.locator('#seq-mod-ntext-rle .rle-textarea').fill('実測 30s, 想定 5s');
    await page.locator('#seq-mod-confirm').click();
    await page.waitForTimeout(500);

    // 注釈を入れても line 6 の message は選択されたまま。ここで overlay を
    // もう一度クリックすると選択が解除されるので、選択されていないときだけ選び直す。
    var selected = await page.evaluate(() => window.MA.selection.getSelected().length > 0);
    if (!selected) {
      await clickOverlayByLine(page, 6);
      await page.waitForTimeout(300);
    }
    // FEAT-114: 2 連 prompt() ではなく seq-modal の 1 枚フォーム。
    await page.locator('.seq-wrap-block').first().click();
    await page.waitForSelector('#seq-wrap-kind');
    await page.selectOption('#seq-wrap-kind', 'alt');
    await page.fill('#seq-wrap-label', 'on-timeout');
    await page.locator('#seq-wrap-confirm').click();
    await page.waitForTimeout(600);

    var t = await getEditorText(page);
    expect(t).toContain('実測 30s, 想定 5s');
    expect(t).toContain('alt on-timeout');
  });
});
