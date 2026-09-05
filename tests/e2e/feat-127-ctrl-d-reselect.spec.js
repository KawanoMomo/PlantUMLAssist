// @ts-check
// FEAT-127 / UI-013 / HFR-063: Ctrl+D で複製した直後、選択を複製で生まれた新しい行へ移す。
//
// 🔴 タグについて: issues/FEAT-127.md には受入条件 (AC) 節が存在しない
//    (`grep -n "AC-\|効果測定\|受入" issues/FEAT-127.md` のヒットは 0 件。実装 run 20260905-1946 実測)。
//    そのため存在しない AC 番号を騙らず、本 FEAT 本文が名指した振る舞いから導出した条件に
//    `[F127-n]` の一意タグを付す (LOOP-437 (i): 同一 spec 内でタグを重複させない)。
//    タグの根拠は各 test の直上に FEAT / UI-013 の逐語で示す。
// 🔴 LOOP-801 [R-2]: アサーションは上記の導出条件に限り、代理指標を書かない。
// 🔴 手数の数値は測らない (charter §5 の 3 操作に本機能は含まれない)。
// スクリーンショットは test-results/ にのみ保存する (docs/images は保護対象のため書かない)。
const path = require('path');
const { test, expect } = require('@playwright/test');
const SHOT = path.join(__dirname, '..', '..', 'test-results', 'feat-127');
const LINE = 8, TEXT = 'System -> DB : Query'; // 既定テンプレートの 8 行目
const shot = (page, n) => page.screenshot({ path: path.join(SHOT, n), fullPage: true });
const txt = (page) => page.locator('#editor').inputValue();
const sel = (page) => page.evaluate(() => window.MA.selection.getSelected() || []);

async function boot(page) {
  await page.goto('/');
  await page.waitForSelector('#preview-svg', { timeout: 5000 });
  await page.waitForTimeout(500);
}
async function selectLine(page, line) {
  return page.evaluate((l) => {
    var p = window.MA.modules.plantumlSequence.parseSequence(document.getElementById('editor').value);
    var r = p.relations.filter(function(x) { return x.kind === 'message' && x.line === l; })[0];
    if (!r) return null;
    window.MA.selection.setSelected([{ type: 'message', id: r.id, line: r.line }]);
    return r.id;
  }, line);
}
async function blur(page) {
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    document.body.focus();
  });
}
async function ctrlD(page) { await page.keyboard.press('Control+d'); await page.waitForTimeout(500); }

test.describe('FEAT-127: Ctrl+D の複製直後、選択が新しい行へ移る', () => {
  // 導出元 (FEAT-127 表題の逐語):
  //   「`Ctrl+D` で複製した直後、選択を複製で生まれた新しい行へ移す」
  // 導出元 (UI-013「未検証のまま残る振る舞い」1 の逐語):
  //   「複製直後、選択ハイライトは元の行に残るか、複製された行に移るか、それとも消えるか」
  test('[F127-1] 複製直後の単独選択が、複製で生まれた行 (元行の直後) を指す', async ({ page }) => {
    await boot(page);
    const beforeId = await selectLine(page, LINE);
    expect(beforeId).toBeTruthy();
    await blur(page);
    const before = await sel(page);
    expect(before.length).toBe(1);
    expect(before[0].line).toBe(LINE);
    await shot(page, 'f127-1-before.png');

    await ctrlD(page);

    // DSL 側: 複製が現に成立していること (前提の確認。FEAT-076 の振る舞いは変えない)
    const lines = (await txt(page)).split('\n');
    expect(lines[LINE - 1]).toBe(TEXT);
    expect(lines[LINE]).toBe(TEXT);

    const after = await sel(page);
    expect(after.length).toBe(1);
    // 🔴 LOOP-437 (ii): 操作前の値と「異なる」ことを明示にアサートする。
    //    id は文書順の連番採番のため複製元の id は変化しないが、line は必ず前進する。
    expect(after[0].line).not.toBe(before[0].line);
    expect(after[0].line).toBe(LINE + 1);
    expect(after[0].type).toBe('message');
    await shot(page, 'f127-1-after.png');
  });

  // 導出元 (UI-013「未検証のまま残る振る舞い」2 の逐語):
  //   「複製直後にもう一度 Ctrl+D(連続複製)を押した場合、… 選択 id が再パース後も有効かどうか未検証。
  //    id が無効化されていた場合、2 回目の Ctrl+D は無反応」
  // 導出元 (FEAT-127 本文の逐語): 「連続複製が階段状に増えること」
  test('[F127-2] 連続 Ctrl+D で選択が毎回 1 行ずつ下へ進み、複製が直下に積まれる', async ({ page }) => {
    await boot(page);
    const before = (await txt(page)).split('\n');
    await selectLine(page, LINE);
    await blur(page);

    await ctrlD(page);
    const sel1 = await sel(page);
    expect(sel1.length).toBe(1);
    expect(sel1[0].line).toBe(LINE + 1);

    await ctrlD(page);
    const sel2 = await sel(page);
    expect(sel2.length).toBe(1);
    // 🔴 1 回目の選択行と「異なる」ことを明示にアサートする (LOOP-437 (ii))。
    expect(sel2[0].line).not.toBe(sel1[0].line);
    expect(sel2[0].line).toBe(LINE + 2);

    // 階段状 (複製が元行の直下に 1 行ずつ積まれる) であること
    const a = (await txt(page)).split('\n');
    expect(a.length).toBe(before.length + 2);
    expect(a[LINE - 1]).toBe(TEXT);
    expect(a[LINE]).toBe(TEXT);
    expect(a[LINE + 1]).toBe(TEXT);
    expect(a.slice(LINE + 2).join('\n')).toBe(before.slice(LINE).join('\n'));
    await shot(page, 'f127-2-after-two.png');
  });

  // 🔴 (b) 回帰ガード / 非退行テスト (E5 [R-1](b) により分類を明記する。事前 PASS を許す)。
  //    FEAT-076 [AC-4] の「複製が成立しない経路では DSL が 1 文字も変化しない」に対応する
  //    選択側の非退行 —— 本 FEAT の追加が空振り経路の選択状態を壊していないことを見る。
  test('[F127-3] (b) 複製が成立しない経路 (選択 0 件 / 複数選択) では選択も DSL も変化しない', async ({ page }) => {
    await boot(page);
    const before = await txt(page);

    await page.evaluate(() => window.MA.selection.clearSelection());
    await blur(page);
    await ctrlD(page);
    expect((await sel(page)).length).toBe(0);
    expect(await txt(page)).toBe(before);

    const multi = await page.evaluate(() => {
      var p = window.MA.modules.plantumlSequence.parseSequence(document.getElementById('editor').value);
      var m = p.relations.filter(function(x) { return x.kind === 'message'; });
      window.MA.selection.setSelected([
        { type: 'message', id: m[0].id, line: m[0].line },
        { type: 'message', id: m[1].id, line: m[1].line }]);
      return window.MA.selection.getSelected();
    });
    await blur(page);
    await ctrlD(page);
    expect(await sel(page)).toEqual(multi);
    expect(await txt(page)).toBe(before);
  });
});
