const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText } = require('./helpers');

// FEAT-117: Ctrl+E でエクスポートメニューを開き、そのままキーボードで形式を選べるようにする。
//
// 🔴 実現案からの逸脱 (run 20260904-0611 が実測して記録):
//   FEAT-117 の「テスト量と [I3] の +200 行上限」節 1 は「E2E で判定するのは [AC-1] [AC-4] の
//   2 件のみでよい。[AC-2] [AC-3] [AC-5] [AC-6] は jsdom で classList / document.activeElement /
//   defaultPrevented を見れば判定できる」としているが、本 run の実測では
//   tests/run-tests.js の sourceFiles 配列に src/app.js が含まれておらず (grep -n "app.js"
//   tests/run-tests.js のヒット 0 件)、本 FEAT の変更対象である document keydown ハンドラは
//   jsdom 単体層に載せられない。tests/feat-014-delete-key.test.js の冒頭コメントも同じ事実を
//   逐語で記録している。run-tests.js に src/app.js を足すのは DOM スタブの大幅追加を要し
//   [I3]「ついでに直さない」に反するため採らず、全 6 AC を本 E2E 側で判定する。
//   正味差分は +200 行以内に収まっており、テストの削除・アサーションの弱化は 0 件である。
//
// E5 の分類 (loop_agent/feature_implementer.md「E5 の名宛人と申告様式」[R-1]):
//   (a) 新しい振る舞いを主張するテスト = [AC-1] [AC-2] [AC-3] [AC-4] の 4 件 (事前 FAIL 観測必須)
//   (b) 回帰ガード / 非退行テスト     = [AC-5] [AC-6] の 2 件 (事前 PASS を許す)

async function pressCtrlE(page, modifiers) {
  const keys = (modifiers || []).concat(['Control', 'e']);
  return page.keyboard.press(keys.join('+'));
}

test.describe('FEAT-117: Ctrl+E でエクスポートメニューを開く', () => {
  test('[AC-1] エディタ以外にフォーカスがある状態で Ctrl+E → #export-menu が .open を持つ', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#preview-container').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#export-menu')).not.toHaveClass(/\bopen\b/);

    await pressCtrlE(page);

    await expect(page.locator('#export-menu')).toHaveClass(/\bopen\b/);
  });

  test('[AC-2] 先頭ボタンにフォーカスが移り、Tab で 4 項目を辿れる', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#preview-container').click({ position: { x: 5, y: 5 } });
    await pressCtrlE(page);

    const activeId = () => page.evaluate(() => document.activeElement && document.activeElement.id);
    expect(await activeId()).toBe('exp-svg');

    const seen = ['exp-svg'];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
      seen.push(await activeId());
    }
    expect(seen).toEqual(['exp-svg', 'exp-png', 'exp-png-transparent', 'exp-clipboard']);
  });

  test('[AC-3] Ctrl+E でブラウザ既定の動作が起きない (preventDefault 済み)', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#preview-container').click({ position: { x: 5, y: 5 } });
    // アプリの document ハンドラより後に走る window(バブル終端)で defaultPrevented を観測する。
    await page.evaluate(() => {
      window.__feat117 = null;
      window.addEventListener('keydown', function (e) {
        if ((e.key || '').toLowerCase() === 'e') window.__feat117 = e.defaultPrevented;
      });
    });

    await pressCtrlE(page);

    expect(await page.evaluate(() => window.__feat117)).toBe(true);
  });

  test('[AC-4] DSL エディタにフォーカスがある間も動作し、textarea の内容を変えない', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.locator('#editor').click();
    const before = await getEditorText(page);

    await pressCtrlE(page);

    await expect(page.locator('#export-menu')).toHaveClass(/\bopen\b/);
    expect(await getEditorText(page)).toBe(before);
  });

  test('[AC-5] Ctrl+Shift+E / Ctrl+Alt+E では発火しない', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#preview-container').click({ position: { x: 5, y: 5 } });

    await pressCtrlE(page, ['Shift']);
    await expect(page.locator('#export-menu')).not.toHaveClass(/\bopen\b/);

    await pressCtrlE(page, ['Alt']);
    await expect(page.locator('#export-menu')).not.toHaveClass(/\bopen\b/);
  });

  test('[AC-6] Ctrl+Z の undo と Tab インデントが回帰しない', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');

    // Tab インデント: 2 行目行頭で Tab → 半角スペース 2 個が入る (操作前後で値が変わること)
    const beforeTab = await getEditorText(page);
    const caret = beforeTab.split('\n')[0].length + 1;
    await page.locator('#editor').click();
    await page.evaluate((c) => {
      const ed = document.getElementById('editor');
      ed.setSelectionRange(c, c);
    }, caret);
    await page.keyboard.press('Tab');
    const afterTab = await getEditorText(page);
    expect(afterTab).not.toBe(beforeTab);
    expect(afterTab.split('\n')[1].startsWith('  ')).toBe(true);

    // Ctrl+Z: Tab 直前の DSL に戻る (操作前後で値が変わること)
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    const afterUndo = await getEditorText(page);
    expect(afterUndo).not.toBe(afterTab);
    expect(afterUndo).toBe(beforeTab);
  });
});
