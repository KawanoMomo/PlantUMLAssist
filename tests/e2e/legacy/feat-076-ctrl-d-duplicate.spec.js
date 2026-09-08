// @ts-check
// FEAT-076 / HFR-003 / [AC-1]〜[AC-5]: Ctrl+D で単独選択された message を直後に複製する。
// 🔴 手数の数値は測らない (charter §5 の 3 操作に本機能は含まれない)。
// スクリーンショットは test-results/ にのみ保存する (docs/images は保護対象のため書かない)。
const path = require('path');
const { test, expect } = require('@playwright/test');
const SHOT = path.join(__dirname, '..', '..', '..', 'test-results', 'feat-076');
const LINE = 8, TEXT = 'System -> DB : Query'; // 既定テンプレートの 8 行目
const shot = (page, n) => page.screenshot({ path: path.join(SHOT, n), fullPage: true });
const txt = (page) => page.locator('#editor').inputValue();
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
async function ctrlZ(page) { await page.keyboard.press('Control+z'); await page.waitForTimeout(500); }

test.describe('FEAT-076: Ctrl+D で選択中メッセージを直後に複製する', () => {
  test('[AC-1] 選択行の直後に同一内容の行が 1 行だけ増え、modal は開かない', async ({ page }) => {
    await boot(page);
    const before = await txt(page);
    expect(await selectLine(page, LINE)).toBeTruthy();
    await blur(page);
    await shot(page, 'ac1-before-ctrl-d.png');
    await ctrlD(page);
    const b = before.split('\n'), a = (await txt(page)).split('\n');
    expect(a.length).toBe(b.length + 1);
    expect(a[LINE - 1]).toBe(TEXT);
    expect(a[LINE]).toBe(TEXT);
    expect(a.slice(0, LINE - 1).join('\n')).toBe(b.slice(0, LINE - 1).join('\n'));
    expect(a.slice(LINE + 1).join('\n')).toBe(b.slice(LINE).join('\n'));
    expect(await page.locator('#seq-modal').evaluate((el) => el.style.display || 'none')).not.toBe('flex');
    await shot(page, 'ac1-after-ctrl-d.png');
  });

  test('[AC-2] Ctrl+D の直後に Ctrl+Z 1 回で複製前の DSL に戻る', async ({ page }) => {
    await boot(page);
    const before = await txt(page);
    await selectLine(page, LINE);
    await blur(page);
    await ctrlD(page);
    expect(await txt(page)).not.toBe(before);
    await ctrlZ(page);
    expect(await txt(page)).toBe(before);
    await shot(page, 'ac2-after-undo.png');
  });

  // 🔴「操作の直後に何もしない」以外の経路。複製と別系統の編集が 1 本の history に載ることを見る。
  test('[AC-2] 複製の後に別の編集を挟んでも Ctrl+Z 2 回で複製前まで戻る', async ({ page }) => {
    await boot(page);
    const before = await txt(page);
    await selectLine(page, LINE);
    await blur(page);
    await ctrlD(page);
    const dup = await txt(page);
    expect(dup).not.toBe(before);
    // 割り込み編集。pushHistory は app.js の editor 'input' ハンドラが行うため、
    // 実ユーザーの入力と同じく input イベントだけを起こす。
    await page.locator('#editor').focus();
    await page.evaluate(() => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      ed.value = ed.value.replace('@enduml', 'System -> DB : Interleaved\n@enduml');
      ed.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(600);
    expect(await txt(page)).toContain('Interleaved');
    await blur(page);
    await ctrlZ(page);
    expect(await txt(page)).toBe(dup);
    await ctrlZ(page);
    expect(await txt(page)).toBe(before);
    await shot(page, 'ac2-interleaved-undo.png');
  });

  test('[AC-3] DSL エディタ textarea にフォーカスがある間 / IME 変換中は発火しない', async ({ page }) => {
    await boot(page);
    const before = await txt(page);
    await selectLine(page, LINE);
    await page.locator('#editor').focus();
    await ctrlD(page);
    expect(await txt(page)).toBe(before);
    await blur(page);
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',
      { key: 'd', ctrlKey: true, isComposing: true, bubbles: true, cancelable: true })));
    await page.waitForTimeout(400);
    expect(await txt(page)).toBe(before);
  });

  test('[AC-4] 選択 0 件 / 複数件 / message 以外では DSL が 1 文字も変化しない', async ({ page }) => {
    await boot(page);
    const before = await txt(page);
    await page.evaluate(() => window.MA.selection.clearSelection());
    await blur(page);
    await ctrlD(page);
    expect(await txt(page)).toBe(before);
    await page.evaluate(() => {
      var p = window.MA.modules.plantumlSequence.parseSequence(document.getElementById('editor').value);
      var m = p.relations.filter(function(x) { return x.kind === 'message'; });
      window.MA.selection.setSelected([
        { type: 'message', id: m[0].id, line: m[0].line },
        { type: 'message', id: m[1].id, line: m[1].line }]);
    });
    await blur(page);
    await ctrlD(page);
    expect(await txt(page)).toBe(before);
    await page.evaluate(() => {
      var p = window.MA.modules.plantumlSequence.parseSequence(document.getElementById('editor').value);
      window.MA.selection.setSelected([{ type: 'participant', id: p.elements[0].id, line: p.elements[0].line }]);
    });
    await blur(page);
    await ctrlD(page);
    expect(await txt(page)).toBe(before);
  });

  test('[AC-5] 挿入 modal 表示中は発火しない', async ({ page }) => {
    await boot(page);
    await selectLine(page, LINE);
    await blur(page);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#seq-modal-content');
    const before = await txt(page);
    await blur(page);
    await ctrlD(page);
    expect(await txt(page)).toBe(before);
    await shot(page, 'ac5-modal-open-no-fire.png');
  });
});
