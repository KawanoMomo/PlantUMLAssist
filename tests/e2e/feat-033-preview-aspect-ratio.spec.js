// @ts-check
// FEAT-033 / resolves UI-010
// プレビューの図を縦横同率で表示し、表示幅を超える分は横スクロールで読む。
//
// 受入条件 (FEAT-033 §5):
//   [AC-1] プレビュー内の PlantUML SVG が、幅方向の縮小によって縦横比を崩さない
//   [AC-2] 表示幅を超える図が、横スクロールで端まで到達できる
//   [AC-3] 既存のズーム / Fit (一様倍率) が引き続き機能する
//
// 手数 (charter §5) の主張はしない。本 FEAT は表示品質の課題である。
// スクリーンショットは test-results/ にのみ保存する
// (docs/images は git status --porcelain の保護対象のため書かない)。
const path = require('path');
const { test, expect } = require('@playwright/test');

const SHOT_DIR = path.join(__dirname, '..', '..', 'test-results', 'feat-033');

// participant 20 / メッセージ 100 の「表示幅を超える」図 (UI-010 の実測条件と同型)
function wideDsl() {
  var lines = ['@startuml'];
  for (var i = 1; i <= 20; i++) lines.push('participant P' + i);
  for (var m = 0; m < 100; m++) {
    var a = (m % 19) + 1;
    lines.push('P' + a + ' -> P' + (a + 1) + ' : msg' + (m + 1));
  }
  lines.push('@enduml');
  return lines.join('\n');
}

async function boot(page) {
  await page.goto('/');
  await page.waitForSelector('#preview-svg', { timeout: 5000 });
  await page.evaluate((t) => {
    var ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
    ed.blur();
    document.body.focus();
  }, wideDsl());
  await page.waitForSelector('#preview-svg svg', { timeout: 20000 });
  await page.waitForTimeout(800);
}

// 図が実際にプレビュー幅を超えていることを前提として確認する。
// これが成立しない場合、max-width:100% は発火せず [AC-1] は無意味に PASS する。
async function measure(page) {
  return page.evaluate(() => {
    var svg = document.querySelector('#preview-svg svg');
    var c = document.getElementById('preview-container');
    var cs = getComputedStyle(svg);
    return {
      attrW: parseFloat(svg.getAttribute('width') || '0'),
      attrH: parseFloat(svg.getAttribute('height') || '0'),
      cssW: parseFloat(cs.width),
      cssH: parseFloat(cs.height),
      containerW: c.clientWidth,
    };
  });
}

test.describe('FEAT-033 プレビューの縦横同率表示と横スクロール', () => {
  test('[AC-1] SVG の描画寸法が width/height 属性と一致し、縦横比が崩れない', async ({ page }) => {
    await boot(page);
    const m = await measure(page);

    // 前提: 図の実寸がプレビュー幅を超えている (超えていなければ本テストは条件を試験できない)
    expect(m.attrW).toBeGreaterThan(m.containerW);

    // 縮小率 1.0 で一致すること
    expect(Math.abs(m.cssW - m.attrW)).toBeLessThan(1);
    expect(Math.abs(m.cssH - m.attrH)).toBeLessThan(1);

    // 縦横比が原寸と一致すること (非一様スケーリングの禁止)
    expect(Math.abs(m.cssW / m.cssH - m.attrW / m.attrH)).toBeLessThan(0.001);

    await page.screenshot({ path: path.join(SHOT_DIR, 'ac1-preview-native-size.png') });
  });

  test('[AC-2] 表示幅を超える分を横スクロールで右端まで読める', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { /* @ts-ignore */ setZoom(1.0); });
    await page.waitForTimeout(200);

    const s = await page.evaluate(() => {
      var c = document.getElementById('preview-container');
      c.scrollLeft = c.scrollWidth;
      return { scrollWidth: c.scrollWidth, clientWidth: c.clientWidth, scrollLeft: c.scrollLeft };
    });

    expect(s.scrollWidth).toBeGreaterThan(s.clientWidth);
    expect(s.scrollLeft).toBeGreaterThan(0);
    // 右端に到達できること
    expect(s.scrollLeft + s.clientWidth).toBeGreaterThanOrEqual(s.scrollWidth - 2);

    await page.screenshot({ path: path.join(SHOT_DIR, 'ac2-scrolled-to-right-edge.png') });
  });

  test('[AC-3] Fit / ズームが一様倍率で引き続き機能する', async ({ page }) => {
    await boot(page);
    await page.locator('#btn-zoom-fit').dispatchEvent('click');
    await page.waitForTimeout(200);

    const fit = await page.evaluate(() => {
      var el = document.getElementById('preview-svg');
      var ov = document.getElementById('overlay-layer');
      return {
        svgTransform: getComputedStyle(el).transform,
        overlayTransform: ov ? getComputedStyle(ov).transform : null,
        display: (document.getElementById('zoom-display') || {}).textContent,
      };
    });

    // matrix(a, 0, 0, d, 0, 0) の a === d (一様倍率) であること
    const nums = String(fit.svgTransform).match(/-?[0-9.]+/g) || [];
    expect(nums.length).toBeGreaterThanOrEqual(6);
    expect(Math.abs(parseFloat(nums[0]) - parseFloat(nums[3]))).toBeLessThan(0.0001);
    expect(parseFloat(nums[0])).toBeGreaterThan(0);
    // overlay に同一の transform が当たっていること
    expect(fit.overlayTransform).toBe(fit.svgTransform);

    // ズームイン後も一様倍率のまま
    await page.locator('#btn-zoom-in').dispatchEvent('click');
    await page.waitForTimeout(200);
    const zoomed = await page.evaluate(() => getComputedStyle(document.getElementById('preview-svg')).transform);
    const n2 = String(zoomed).match(/-?[0-9.]+/g) || [];
    expect(Math.abs(parseFloat(n2[0]) - parseFloat(n2[3]))).toBeLessThan(0.0001);
    expect(parseFloat(n2[0])).toBeGreaterThan(parseFloat(nums[0]));

    await page.screenshot({ path: path.join(SHOT_DIR, 'ac3-fit-and-zoom.png') });
  });

  // FEAT-033「完了条件 (観察可能な差分 / G2)」の (b): participant ヘッダと
  // メッセージラベルの視覚的な重なりが 0 件であること。E4 の効果測定に用いる。
  test('[E4] participant ヘッダとメッセージラベルの重なりが0件', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      var svg = document.querySelector('#preview-svg svg');
      // participant ヘッダ = 図の上端付近にある矩形。メッセージラベル = それ以外の text。
      var texts = Array.prototype.slice.call(svg.querySelectorAll('text'));
      var boxes = texts.map(function (t) {
        var b = t.getBoundingClientRect();
        return { x: b.left, y: b.top, w: b.width, h: b.height, s: t.textContent };
      }).filter(function (b) { return b.w > 0 && b.h > 0; });
      var headers = boxes.filter(function (b) { return /^P\d+$/.test((b.s || '').trim()); });
      var labels = boxes.filter(function (b) { return /^msg\d+$/.test((b.s || '').trim()); });
      var overlaps = 0;
      headers.forEach(function (h) {
        labels.forEach(function (l) {
          if (h.x < l.x + l.w && l.x < h.x + h.w && h.y < l.y + l.h && l.y < h.y + h.h) overlaps++;
        });
      });
      // 右端 participant が SVG の描画ボックス内に収まっているか。
      // max-width:100% で幅だけ丸められると SVG のボックスは 574px で終わり、
      // 右端の participant は描画領域の外に出る (スクロールしても現れない)。
      var svgBox = svg.getBoundingClientRect();
      var rightMost = headers.reduce(function (a, b) { return (a && a.x > b.x) ? a : b; }, null);
      var cs = getComputedStyle(svg);
      return {
        rightMostHeader: rightMost ? rightMost.s : null,
        rightMostRight: rightMost ? Math.round(rightMost.x + rightMost.w) : null,
        svgBoxRight: Math.round(svgBox.right),
        rightMostInsideSvgBox: !!rightMost && (rightMost.x + rightMost.w) <= svgBox.right + 1,
        headers: headers.length,
        labels: labels.length,
        overlaps: overlaps,
        attrW: svg.getAttribute('width'),
        attrH: svg.getAttribute('height'),
        cssW: cs.width,
        cssH: cs.height,
        maxWidth: cs.maxWidth,
      };
    });
    // 実測値を run ログへ転記するため出力する
    console.log('[FEAT-033 E4] ' + JSON.stringify(r));
    // PlantUML は participant 見出しを図の上端と下端の両方に描くため 20*2 = 40
    expect(r.headers).toBe(40);
    expect(r.labels).toBeGreaterThan(0);
    expect(r.overlaps).toBe(0);
    // FEAT-033 完了条件 (a): 縮小率 1.0 で attr と computed が一致すること。
    // 注: overlaps は変更前も 0 であり、この指標単独では差分を弁別しない
    //     (PlantUML の SVG に viewBox が無いため、幅を丸められても文字は再配置されず
    //      クリップされるだけである)。弁別するのは以下の 2 行である。
    expect(r.cssW).toBe(r.attrW + 'px');
    expect(r.cssH).toBe(r.attrH + 'px');
    expect(r.maxWidth).toBe('none');
  });
});
