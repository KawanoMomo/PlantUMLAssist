const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText } = require('../helpers');

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

  // TICKET-junior-20261122-1001-wish: 複数行を選んで Alt+↑ / Alt+↓ を押すと、選んだ行の塊がまとめて動き、
  // 選択は塊に付いていく。差分は塊と入れ替わった 1 行だけで、Ctrl+Z 1 回で元のバイト列に戻る。
  async function selectLines(page, from, to) {
    await page.locator('#editor').evaluate((el, r) => {
      el.focus();
      var lines = el.value.split('\n');
      var s = lines.slice(0, r[0] - 1).join('\n').length + (r[0] > 1 ? 1 : 0);
      var e = lines.slice(0, r[1]).join('\n').length;
      el.setSelectionRange(s, e);
    }, [from, to]);
  }
  async function selectedText(page) {
    return page.locator('#editor').evaluate((el) => el.value.substring(el.selectionStart, el.selectionEnd));
  }

  test('[複数行] 3 行を選んで Alt+↑ 1 回で塊ごと 1 行上へ動き、Ctrl+Z 1 回で戻る', async ({ page }) => {
    await setup(page);
    const before = await getEditorText(page);
    const b = before.split('\n');
    // 7〜9 行目 (System -> DB / DB --> System / System --> User) を選ぶ。
    await selectLines(page, 7, 9);
    const sel = await selectedText(page);
    expect(sel).toBe(b.slice(6, 9).join('\n'));
    await page.keyboard.press('Alt+ArrowUp');
    await page.waitForTimeout(900);
    const a = (await getEditorText(page)).split('\n');
    expect(a.length).toBe(b.length);
    // 差分は塊と、塊の下へ回った 6 行目 (User -> System) だけ。
    expect(a.slice(5, 8)).toEqual(b.slice(6, 9));
    expect(a[8]).toBe(b[5]);
    for (let i = 0; i < 5; i++) expect(a[i]).toBe(b[i]);
    for (let i = 9; i < b.length; i++) expect(a[i]).toBe(b[i]);
    // 選択は動かした塊に付いていく
    expect(await selectedText(page)).toBe(sel);
    await page.locator('#editor').focus();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(900);
    expect(await getEditorText(page)).toBe(before);
  });

  test('[複数行] 3 行を選んで Alt+↓ で塊ごと 1 行下へ。1 行目に掛かる塊の Alt+↑ は動かない', async ({ page }) => {
    await setup(page);
    const before = await getEditorText(page);
    const b = before.split('\n');
    await selectLines(page, 2, 4);
    const sel = await selectedText(page);
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForTimeout(700);
    const a = (await getEditorText(page)).split('\n');
    expect(a[1]).toBe(b[4]);
    expect(a.slice(2, 5)).toEqual(b.slice(1, 4));
    expect(await selectedText(page)).toBe(sel);
    // 端: 1 行目を含む塊の Alt+↑ は本文を 1 バイトも変えない
    const now = await getEditorText(page);
    await selectLines(page, 1, 3);
    await page.keyboard.press('Alt+ArrowUp');
    await page.waitForTimeout(400);
    expect(await getEditorText(page)).toBe(now);
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
