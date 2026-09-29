const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture } = require('../helpers');

// BLK-primary-20260908-0103-design (design 5c「Sequence — 途中に挿入」):
// メッセージの隙間にカーソルを置くと出るガイド線が、Activity 図と同じく
// 「+ DSL N 行目に挿入」と矢印の列を示す。以前は sequence module が
// resolveInsertLine を公開しておらず、汎用の「+ ここに挿入」が図の全幅に
// 伸びるだけで、どの行に入るのか読めなかった。

// 1 本目と 2 本目のメッセージの隙間の座標。
// メッセージの当たり矩形は矢印の上のラベルまで含む高さになり、上下の矩形が接して
// 2 本の中点はどちらかの矩形の中に入る (矩形の上ではガイドは出ず、選択が優先)。
// 1 本目の列のまま 1 本目の矩形のすぐ下へ下り、矩形に当たらない最初の点を隙間とする
// (BLK-releaser-20260929-0851-1)。
async function gapBetweenMessages(page) {
  return page.evaluate(() => {
    var rects = Array.prototype.slice.call(
      document.querySelectorAll('#overlay-layer rect[data-type="message"]'));
    var boxes = rects.map(function(r) {
      var b = r.getBoundingClientRect();
      return { line: parseInt(r.getAttribute('data-line'), 10), top: b.top, bottom: b.bottom, mid: b.top + b.height / 2, x: b.left + b.width / 2 };
    }).sort(function(a, b) { return a.mid - b.mid; });
    if (boxes.length < 2) return null;
    var x = boxes[0].x;
    for (var y = boxes[0].bottom + 1; y < boxes[1].bottom; y += 1) {
      var el = document.elementFromPoint(x, y);
      if (el && !(el.getAttribute && el.getAttribute('data-type'))) return { x: x, y: y, upper: boxes[0].line };
    }
    return null;
  });
}

test.describe('BLK-primary-20260908-0103-design: Sequence の hover ガイドが行番号を示す', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);
  });

  test('隙間の hover で「+ DSL N 行目に挿入」が出る', async ({ page }) => {
    const gap = await gapBetweenMessages(page);
    expect(gap).not.toBeNull();
    await page.mouse.move(gap.x, gap.y);
    await page.waitForTimeout(300);

    const label = page.locator('#hover-layer text.hover-label');
    await expect(label).toHaveCount(1);
    const text = await label.textContent();
    expect(text).toMatch(/^\+ DSL \d+ 行目に挿入$/);
  });

  test('ガイド線の行番号は、クリックで開くメニューの行番号と一致する', async ({ page }) => {
    const gap = await gapBetweenMessages(page);
    await page.mouse.move(gap.x, gap.y);
    await page.waitForTimeout(300);
    const guideNum = (await page.locator('#hover-layer text.hover-label').textContent()).match(/DSL (\d+) 行目/)[1];

    await page.mouse.click(gap.x, gap.y);
    await page.waitForTimeout(500);
    await expect(page.locator('#seq-modal')).toBeVisible();
    const menuNum = (await page.locator('#seq-pick-target').textContent()).match(/DSL (\d+) 行目/)[1];
    expect(guideNum).toBe(menuNum);
  });

  test('ガイド線は図の全幅ではなく、その矢印の列に収まる', async ({ page }) => {
    const gap = await gapBetweenMessages(page);
    await page.mouse.move(gap.x, gap.y);
    await page.waitForTimeout(300);

    const guide = page.locator('#hover-layer line.hover-guide').first();
    await expect(guide).toHaveCount(1);
    const x1 = parseFloat(await guide.getAttribute('x1'));
    const x2 = parseFloat(await guide.getAttribute('x2'));
    const overlayWidth = await page.evaluate(() =>
      parseFloat(document.getElementById('overlay-layer').getAttribute('width') || '0'));
    expect(x2 - x1).toBeGreaterThan(0);
    expect(x2 - x1).toBeLessThan(overlayWidth);
  });
});
