// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, clickOverlayByLine } = require('./helpers');

test.describe('UC-6: 本番障害 root cause 反映', () => {
  test('既存 message に note 追加 + alt 囲み', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-cache-spec.puml');
    await page.waitForTimeout(1500);

    page.on('dialog', async (dialog) => {
      var msg = dialog.message();
      if (msg.indexOf('種類') >= 0) await dialog.accept('alt');
      else if (msg.indexOf('Label') >= 0) await dialog.accept('on-timeout');
      else await dialog.accept('');
    });

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

    // 同 message 再選択 → alt で囲む
    await clickOverlayByLine(page, 6);
    await page.waitForTimeout(300);
    await page.locator('.seq-wrap-block').click();
    await page.waitForTimeout(500);

    var t = await getEditorText(page);
    expect(t).toContain('実測 30s, 想定 5s');
    expect(t).toContain('alt on-timeout');
  });
});
