// @ts-check
// FEAT-009 (resolves UI-003): 図の空白クリックで選択を解除する。
// 🔴 手数 (charter §5) の削減は主張しない。選択解除は §5 の 3 操作 (途中挿入 /
//    順序入替 / 種別変更) のいずれにも含まれず、手数を増減させない。
const path = require('path');
const { test, expect } = require('@playwright/test');

const SHOT_DIR = path.join(__dirname, '..', '..', '..', 'test-results', 'feat-009');
const GUIDE = '#hover-layer .hover-guide';

async function selectedCount(page) {
  return page.evaluate(() => (window.MA.selection.getSelected() || []).length);
}

// overlay 内の「どの選択 rect にも重ならない点」を返す (= 図の空白)。
async function blankPoint(page) {
  return page.evaluate(() => {
    var ov = document.getElementById('overlay-layer');
    if (!ov) return null;
    var ob = ov.getBoundingClientRect();
    var boxes = Array.prototype.slice.call(ov.querySelectorAll('rect[data-type]'))
      .map(function(r) { return r.getBoundingClientRect(); });
    for (var fy = 0.95; fy > 0.1; fy -= 0.05) {
      for (var fx = 0.95; fx > 0.1; fx -= 0.05) {
        var x = ob.left + ob.width * fx, y = ob.top + ob.height * fy;
        if (!boxes.some(function(b) {
          return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom; })) return { x: x, y: y };
      }
    }
    return null;
  });
}

test.describe('FEAT-009: 図の空白クリックで選択を解除する', () => {
  test('[AC-1] overlay の最背面に当たり判定つきの背景 rect がある', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#overlay-layer rect[data-type="message"]', { timeout: 10000 });
    const info = await page.evaluate(() => {
      var ov = document.getElementById('overlay-layer');
      var bg = ov ? ov.querySelector('rect.overlay-background') : null;
      if (!bg) return null;
      return { first: ov.firstChild === bg, pe: window.getComputedStyle(bg).pointerEvents,
        dataType: bg.getAttribute('data-type'), w: parseFloat(bg.getAttribute('width')) };
    });
    expect(info).not.toBeNull();
    expect(info.first).toBe(true);       // 最背面でなければ他の rect を覆い隠す
    expect(info.pe).toBe('all');         // 当たり判定がなければ空白クリックが届かない
    // data-type を持たないことが selectionRouter に「空白」と解釈させる条件。
    expect(info.dataType).toBeNull(); expect(info.w).toBeGreaterThan(0);
  });

  test('[AC-2] 選択中の空白クリックで解除され、挿入 modal は開かず、直後にガイドが戻る', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#overlay-layer rect[data-type="message"]', { timeout: 10000 });
    const pt = await blankPoint(page);
    expect(pt).not.toBeNull();

    // 非選択時はホバー挿入ガイドが出る (背景 rect が hover 判定を壊していない)。
    await page.mouse.move(pt.x, pt.y);
    await page.waitForTimeout(300);
    expect(await page.locator(GUIDE).count()).toBe(1);

    await page.locator('#overlay-layer rect[data-type="message"]').first().click();
    await page.waitForTimeout(300);
    expect(await selectedCount(page)).toBe(1);
    // 選択中はガイドが抑制される (FEAT-009 本文が記す詰まりの前提)。
    await page.mouse.move(pt.x, pt.y);
    await page.waitForTimeout(300);
    expect(await page.locator(GUIDE).count()).toBe(0);
    await page.screenshot({ path: path.join(SHOT_DIR, 'ac2-before-blank-click.png') });

    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(500);
    expect(await selectedCount(page)).toBe(0);
    expect(await page.locator('#overlay-layer rect.selected').count()).toBe(0);
    // 解除と挿入が 1 クリックで同時に起きないこと。
    expect(await page.evaluate(() => {
      var m = document.getElementById('seq-modal');
      return !!m && window.getComputedStyle(m).display !== 'none'; })).toBe(false);
    await page.screenshot({ path: path.join(SHOT_DIR, 'ac2-after-blank-click.png') });
    // 解除できたので別位置への挿入ガイドが再び出る。
    await page.mouse.move(pt.x + 1, pt.y + 1);
    await page.waitForTimeout(300);
    expect(await page.locator(GUIDE).count()).toBe(1);
    await page.screenshot({ path: path.join(SHOT_DIR, 'ac3-hover-guide-after-deselect.png') });
  });
});
