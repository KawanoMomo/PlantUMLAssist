const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText } = require('./helpers');

// FEAT-080: Ctrl+/ で DSL エディタの選択行をコメントアウト・解除する。
// FEAT-080 の「テスト量と [I3] の +200 行上限」節が E2E で判定する AC を [AC-4] の 1 件に
// 名指しで限定している。[AC-1] [AC-2] [AC-3] は tests/dsl-utils.test.js の単体層で判定済み。
// [AC-5] のうち「エディタ以外にフォーカスがあるとき発火しない」は純関数層では判定できない
// (ハンドラの結線そのものが対象) ため実機側に 1 件だけ置く。
// スクリーンショットは test-results/ にのみ保存する (docs/images は保護対象のため書かない)。

test.describe('FEAT-080: Ctrl+/ 行コメントのトグル', () => {
  test('[AC-4] 操作でプレビューが再描画され、Ctrl+Z 1 回で押す前の DSL に戻る', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(800);

    const before = await getEditorText(page);
    const target = before.split('\n').findIndex((l) => l.indexOf('->') !== -1);
    expect(target).toBeGreaterThan(-1);
    const caret = before.split('\n').slice(0, target).join('\n').length + 1;

    const editor = page.locator('#editor');
    await editor.evaluate((el, c) => { el.focus(); el.setSelectionRange(c, c); }, caret);
    await page.keyboard.press('Control+/');
    await page.waitForTimeout(1200);

    const after = await getEditorText(page);
    expect(after.split('\n')[target].charAt(0)).toBe("'");
    // 再描画: input 経路を通っているので line-number ガターと DSL が同期している
    expect(after).not.toBe(before);
    await page.screenshot({ path: 'test-results/feat-080-commented.png', fullPage: false });

    await editor.focus();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(800);
    expect(await getEditorText(page)).toBe(before);
    await page.screenshot({ path: 'test-results/feat-080-after-undo.png', fullPage: false });
  });

  test('[AC-5] エディタ以外にフォーカスがあるときは DSL を書き換えない', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(800);

    const before = await getEditorText(page);
    await page.locator('#render-mode').focus();
    await page.keyboard.press('Control+/');
    await page.waitForTimeout(500);
    expect(await getEditorText(page)).toBe(before);
  });
});
