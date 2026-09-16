// @ts-check
// BLK-human-20260916-0900 — 人間の台本 手順 3「置いた注釈の場所を変える」。
//
// note を足したあと、プレビューで選んでも文章しか直せず、位置 (left of / right of / over) と
// 対象の参加者を変えられなかった (当たり判定が参加者の頭の下の推定位置にあり、note 本体を押しても
// 選べなかった)。到達条件は「note を over A で足す → 選んで right of B に変える → 続けて
// over A,B に変える → SVG 上で note の位置が変わる」こと。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

const DSL = [
  '@startuml',
  'participant A',
  'participant B',
  'participant C',
  'A -> B : 依頼',
  'B -> C : 転送',
  '@enduml',
].join('\n');

async function setDsl(page, dsl) {
  await page.evaluate((text) => {
    var ed = document.getElementById('editor');
    ed.value = text;
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  }, dsl);
  await page.waitForTimeout(800);
}

// 描かれた注釈 (本文 `memo` を囲む塗りのある図形) の左端と幅。
async function noteBox(page) {
  return page.evaluate(() => {
    var svg = document.querySelector('#preview-svg svg');
    if (!svg) return null;
    var t = Array.prototype.filter.call(svg.querySelectorAll('text'), function(x) { return x.textContent.trim() === 'memo'; })[0];
    if (!t) return null;
    var tb = t.getBBox();
    var best = null;
    svg.querySelectorAll('path, polygon, rect').forEach(function(s) {
      var f = (s.getAttribute('fill') || '').toLowerCase();
      if (!f || f === 'none') return;
      var b = s.getBBox();
      if (b.x > tb.x + 2 || b.y > tb.y + 2 || b.x + b.width < tb.x + tb.width - 2 || b.y + b.height < tb.y + tb.height - 2) return;
      if (!best || b.width * b.height < best.width * best.height) best = { x: b.x, y: b.y, width: b.width, height: b.height };
    });
    return best;
  });
}

// 注釈の当たり判定の中央を押す (ホバー枠の出る rect)。
// 変更後も選択は残るので、プロパティが出ていれば押し直さない (押すと選択が外れる)。
async function clickNote(page) {
  await page.waitForTimeout(500);
  if (await page.locator('#seq-edit-npos').isVisible()) return;
  const rect = page.locator('#overlay-layer rect[data-type="note"]').first();
  await expect(rect).toHaveCount(1);
  await rect.click();
  await expect(page.locator('#seq-edit-npos')).toBeVisible();
}

test.describe('人間 手順 3 — 置いた注釈の位置と対象を GUI で変える', () => {
  test('over A で足す → right of B → over A,B で DSL と SVG の位置が変わる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, DSL);

    // 末尾に注釈を over A で足す。
    await page.locator('#seq-tail-kind').selectOption('note');
    await page.locator('#seq-tail-npos').selectOption('over');
    await page.locator('#seq-tail-ntarget').selectOption('A');
    await page.locator('#seq-tail-ntext-rle .rle-textarea').fill('memo');
    await page.locator('#seq-tail-add').click();
    await expect.poll(() => getEditorText(page)).toContain('note over A : memo');
    await expect.poll(() => noteBox(page), { timeout: 15000 }).not.toBe(null);
    const overA = await noteBox(page);

    // 当たり判定は描かれた注釈に重なっている (参加者の頭の下の推定位置ではない)。
    const hit = await page.locator('#overlay-layer rect[data-type="note"]').first().evaluate((r) => ({
      x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height'),
    }));
    expect(hit.x).toBeLessThanOrEqual(overA.x + 1);
    expect(hit.y).toBeLessThanOrEqual(overA.y + 1);
    expect(hit.x + hit.w).toBeGreaterThanOrEqual(overA.x + overA.width - 1);
    expect(hit.y + hit.h).toBeGreaterThanOrEqual(overA.y + overA.height - 1);

    // 選んで right of B に変える。
    await clickNote(page);
    await page.locator('#seq-edit-npos').selectOption('right of');
    await expect.poll(() => getEditorText(page)).toContain('note right of A : memo');
    await clickNote(page);
    await page.locator('input.seq-edit-ntgt[data-pid="B"]').check();
    await expect.poll(() => getEditorText(page)).toContain('note right of B : memo');
    // B の右に描かれ直すまで待つ (途中の right of A の描画を拾わない)。
    await expect.poll(async () => ((await noteBox(page)) || { x: 0 }).x, { timeout: 15000 }).toBeGreaterThan(overA.x + 40);
    const rightB = await noteBox(page);

    // 続けて over A,B に変える。
    await clickNote(page);
    await page.locator('#seq-edit-npos').selectOption('over');
    await expect.poll(() => getEditorText(page)).toContain('note over B : memo');
    await clickNote(page);
    await page.locator('input.seq-edit-ntgt[data-pid="A"]').check();
    await expect.poll(() => getEditorText(page)).toContain('note over A, B : memo');
    // A と B の両方に掛かる幅になる。
    await expect.poll(async () => ((await noteBox(page)) || { width: 0 }).width, { timeout: 15000 }).toBeGreaterThan(overA.width + 5);
    expect((await noteBox(page)).x).toBeLessThan(rightB.x);

    // 上下の順: ↑ 上へ で前のメッセージより上に動く。
    await clickNote(page);
    await page.locator('.seq-move-up').click();
    await expect.poll(async () => {
      const ls = (await getEditorText(page)).split('\n');
      return ls.indexOf('note over A, B : memo') < ls.indexOf('B -> C : 転送');
    }).toBe(true);
  });

  test('足すフォームで over の対象を複数選べ、複数行の note も選んで場所を変えられる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, DSL);

    await page.locator('#seq-tail-kind').selectOption('note');
    await page.locator('#seq-tail-npos').selectOption('over');
    await page.locator('#seq-tail-ntarget').selectOption('B');
    await page.locator('input.seq-tail-nextra[data-pid="C"]').check();
    await page.locator('#seq-tail-ntext-rle .rle-textarea').fill('memo');
    await page.locator('#seq-tail-add').click();
    await expect.poll(() => getEditorText(page)).toContain('note over B, C : memo');

    // 複数行・色付き hnote も選べて、対象を変えると本文と end が残る。
    await setDsl(page, DSL.replace('@enduml', 'hnote over A #pink\nmemo\n2 行目\nend hnote\n@enduml'));
    await expect.poll(() => noteBox(page), { timeout: 15000 }).not.toBe(null);
    await clickNote(page);
    await page.locator('#seq-edit-npos').selectOption('left of');
    await expect.poll(() => getEditorText(page)).toContain('hnote left of A #pink\n  memo\n  2 行目\nend hnote');
  });
});
