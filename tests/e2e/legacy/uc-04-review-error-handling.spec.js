// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, clickOverlayByLine } = require('../helpers');

// FEAT-114: 「囲む」は 2 連 prompt() ではなく seq-modal の 1 枚フォーム。
async function wrapLine(page, line, kind, label) {
  await clickOverlayByLine(page, line);
  await page.waitForTimeout(300);
  await page.locator('.seq-wrap-block').first().click();
  // BLK-human-20260916-0901: ⌗ は終点を図で押す段に入る。1 本だけ囲むときは帯のボタンで決める。
  await page.locator('#seq-wrap-pick-one').click();
  await page.waitForSelector('#seq-wrap-kind');
  await page.selectOption('#seq-wrap-kind', kind);
  await page.fill('#seq-wrap-label', label);
  await page.locator('#seq-wrap-confirm').click();
  await page.waitForTimeout(600);
}

test.describe('UC-4: レビュー指摘 (失敗時 alt 追加)', () => {
  test('成功メッセージ 2 箇所をそれぞれ alt で囲む', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-success-msgs.puml');
    await page.waitForTimeout(1500);

    // 後ろから囲む。先に囲むと後続の行番号がずれるため。
    await wrapLine(page, 7, 'alt', 'on-error');   // Auth --> User : new_token
    await wrapLine(page, 5, 'alt', 'on-error');   // Auth --> User : token

    var t = await getEditorText(page);
    var altCount = (t.match(/^alt /gm) || []).length;
    expect(altCount).toBe(2);
    expect(t.indexOf('alt on-error')).toBeLessThan(t.indexOf('Auth --> User : token'));
  });
});
