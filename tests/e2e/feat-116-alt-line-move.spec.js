const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText } = require('./helpers');

// FEAT-116 (resolves HFR-033): DSL エディタ内で Alt+↑ / Alt+↓ によりカーソル行を上下に移動する。
//
// FEAT-116 の「テスト量と [I3] の +200 行上限」節は E2E で判定する AC を [AC-1] [AC-6] の
// 2 件に限定し、残りは「jsdom の単体層で足りる」としている。🔴 その前提は本 run の実測で
// 成立しなかった: tests/run-tests.js の sourceFiles に src/app.js は含まれておらず
// (DOM 依存が大きいため意図的に除外されている。tests/feat-014-delete-key.test.js の冒頭コメントが
// 同じ事実を逐語で記録している)、本 FEAT の変更対象である app.js の keydown ハンドラは
// jsdom 単体層に載せられない。よって [AC-2]〜[AC-5] [AC-7] も実機側で判定する。
// 判定コストは低い (同一ページ上の keyboard.press と textarea の value / selectionStart のみ)。

// 行番号 (1 始まり) の行頭にキャレットを置く。
async function caretToLine(page, lineNum) {
  await page.locator('#editor').evaluate((el, n) => {
    el.focus();
    var lines = el.value.split('\n');
    var pos = lines.slice(0, n - 1).join('\n').length + (n > 1 ? 1 : 0);
    el.setSelectionRange(pos, pos);
  }, lineNum);
}

async function caretLine(page) {
  return page.locator('#editor').evaluate(
    (el) => el.value.substring(0, el.selectionStart).split('\n').length
  );
}

async function setup(page) {
  await gotoApp(page);
  await loadFixture(page, 'sequence-basic.puml');
  await page.waitForTimeout(800);
}

test.describe('FEAT-116: Alt+↑ / Alt+↓ による DSL エディタの行移動', () => {
  test('[AC-1] Alt+↓ でカーソル行が次行と入れ替わる', async ({ page }) => {
    await setup(page);
    const before = (await getEditorText(page)).split('\n');
    await caretToLine(page, 2);
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForTimeout(600);
    const after = (await getEditorText(page)).split('\n');
    expect(after.join('\n')).not.toBe(before.join('\n'));
    expect(after[1]).toBe(before[2]);
    expect(after[2]).toBe(before[1]);
    await page.screenshot({ path: 'test-results/feat-116-alt-down.png', fullPage: false });
  });

  test('[AC-2] Alt+↑ でカーソル行が前行と入れ替わる', async ({ page }) => {
    await setup(page);
    const before = (await getEditorText(page)).split('\n');
    await caretToLine(page, 3);
    await page.keyboard.press('Alt+ArrowUp');
    await page.waitForTimeout(600);
    const after = (await getEditorText(page)).split('\n');
    expect(after.join('\n')).not.toBe(before.join('\n'));
    expect(after[1]).toBe(before[2]);
    expect(after[2]).toBe(before[1]);
  });

  test('[AC-3] 先頭行の Alt+↑ / 末尾行の Alt+↓ は DSL を 1 バイトも変えない', async ({ page }) => {
    await setup(page);
    const before = await getEditorText(page);
    await caretToLine(page, 1);
    await page.keyboard.press('Alt+ArrowUp');
    await page.waitForTimeout(400);
    expect(await getEditorText(page)).toBe(before);
    await caretToLine(page, before.split('\n').length);
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForTimeout(400);
    expect(await getEditorText(page)).toBe(before);
  });

  test('[AC-4] 入替後もカーソルは移動した行の上に残り、連打で 2 行動かせる', async ({ page }) => {
    await setup(page);
    const before = (await getEditorText(page)).split('\n');
    await caretToLine(page, 2);
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForTimeout(500);
    expect(await caretLine(page)).toBe(3);
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForTimeout(500);
    expect(await caretLine(page)).toBe(4);
    const after = (await getEditorText(page)).split('\n');
    expect(after[3]).toBe(before[1]);
  });

  test('[AC-5] IME 変換中 (isComposing) は発火しない', async ({ page }) => {
    await setup(page);
    const before = await getEditorText(page);
    await caretToLine(page, 2);
    // isComposing:true の KeyboardEvent を直接投げる。Playwright の keyboard API では
    // isComposing を立てられないため、この 1 件のみ dispatchEvent で代替する
    // (手数の計上には用いない。charter §5 / LOOP-144 の計数要件とは無関係のテストである)。
    await page.locator('#editor').evaluate((el) => {
      el.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowDown', altKey: true, isComposing: true, bubbles: true, cancelable: true,
      }));
    });
    await page.waitForTimeout(400);
    expect(await getEditorText(page)).toBe(before);
  });

  test('[AC-6] Alt+↓ の直後に Ctrl+Z 1 回で入替前の DSL へ戻る', async ({ page }) => {
    await setup(page);
    const before = await getEditorText(page);
    await caretToLine(page, 2);
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForTimeout(900);
    expect(await getEditorText(page)).not.toBe(before);
    await page.locator('#editor').focus();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(900);
    expect(await getEditorText(page)).toBe(before);
  });

  // (b) 回帰ガード。実装前から PASS することを想定している (E5 の分類を run ログ / IMPL に明記済み)。
  test('[AC-7] 既存の Tab / Shift+Tab インデントが回帰しない', async ({ page }) => {
    await setup(page);
    await caretToLine(page, 2);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);
    expect((await getEditorText(page)).split('\n')[1].substring(0, 2)).toBe('  ');
    await caretToLine(page, 2);
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(400);
    expect((await getEditorText(page)).split('\n')[1].substring(0, 2)).not.toBe('  ');
  });
});
