// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, clickOverlayByLine } = require('../helpers');

// DSL 中の n 本目の message の現在行を返す。note / alt を差し込むたびに
// 行番号がずれるので、操作のたびに引き直す。
async function messageLineMatching(page, re) {
  var lines = (await getEditorText(page)).split('\n');
  for (var i = 0; i < lines.length; i++) {
    if (/^\s*\S+\s+-+>>?\s+\S+\s*:/.test(lines[i]) && re.test(lines[i])) return i + 1;
  }
  return -1;
}

// FEAT-114: 「囲む」は 2 連 prompt() ではなく seq-modal の 1 枚フォーム
// (uc-04-review-error-handling.spec.js と同じ手順)。
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

test.describe('UC-8: IEC 61508 Safety Case', () => {
  test('fault detection note + エラー応答 alt の合成', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-cache-spec.puml');
    // 固定 sleep ではなく overlay の生成を待つ (負荷が高いと 1.5s では
    // 描画が間に合わず、行番号の引き直しが古い overlay と食い違う)。
    await page.waitForSelector('#overlay-layer rect[data-line]', { timeout: 15000 });

    // (1) DB 応答に fault detection の note を付ける
    var resultLine = await messageLineMatching(page, /result1/);
    expect(resultLine).toBeGreaterThan(0);
    await clickOverlayByLine(page, resultLine);
    await page.waitForTimeout(300);
    await page.locator('.seq-insert-note-after').click();
    await page.waitForTimeout(500);
    await page.locator('#seq-mod-ntext-rle .rle-textarea').fill('Fault detection: timeout > 5s');
    await page.locator('#seq-mod-ntarget').selectOption({ index: 0 });
    await page.locator('#seq-mod-confirm').click();
    // DSL への反映と再描画を待ってから行番号を引き直す。
    await expect(page.locator('#editor')).toHaveValue(/Fault detection/, { timeout: 15000 });
    await page.waitForTimeout(600);

    // (2) 利用者へのエラー応答を alt で囲む。note を付けた message とは別の
    //     message を狙う (同じ message だと (1) の note の overlay 矩形が
    //     重なってクリックを奪う)。
    var respLine = await messageLineMatching(page, /: resp\s*$/);
    expect(respLine).toBeGreaterThan(0);
    await page.waitForSelector('#overlay-layer rect[data-line="' + respLine + '"]', { timeout: 15000 });
    await wrapLine(page, respLine, 'alt', 'fault-handler');

    var t = await getEditorText(page);
    expect(t).toContain('Fault detection');
    expect(t).toContain('alt fault-handler');
    expect(t.indexOf('Fault detection')).toBeLessThan(t.indexOf('alt fault-handler'));
  });
});
