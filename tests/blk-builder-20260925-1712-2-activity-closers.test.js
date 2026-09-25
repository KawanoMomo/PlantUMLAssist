'use strict';
// BLK-builder-20260925-1712-2: 新記法のアクティビティ図で、閉じの行 (endif / endswitch / end fork) が描く合流の菱形・下の棒と、
// repeat の入口の菱形に枠が出なかった (節点は開きの行 1 つに 1 つなので、並び順の当て方に当てる相手が無い)。
// 本文の開きと閉じを対にし、開きの図形の枠から閉じの図形を探して、閉じの行 (repeat は `repeat` の行) を指す枠を置く。
// 合流へ入る矢印・棒から出る矢印にも枠が出る (矢じりの先・線の元の図形として見る)。
// fixtures/svg/v1-2026-8-act-closers.svg は同名の dsl を PlantUML 1.2026.8 で描いたもの。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/dsl-utils.js', '../src/core/regex-parts.js', '../src/core/line-resolver.js',
  '../src/core/text-updater.js', '../src/core/dsl-updater.js', '../src/core/parser-utils.js',
  '../src/core/props-renderer.js', '../src/core/overlay-builder.js', '../src/modules/activity.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var ACT = global.window.MA.modules.plantumlActivity;
var FIX = path.join(__dirname, 'fixtures');
var DSL = fs.readFileSync(path.join(FIX, 'dsl', 'v1-2026-8-act-closers.puml'), 'utf8').replace(/\r\n/g, '\n');
var LINES = DSL.split('\n');
function lineOf(re) {
  for (var i = 0; i < LINES.length; i++) if (re.test(LINES[i].trim())) return i + 1;
  return -1;
}

function build() {
  var div = document.createElement('div');
  div.innerHTML = fs.readFileSync(path.join(FIX, 'svg', 'v1-2026-8-act-closers.svg'), 'utf8');
  var svg = div.querySelector('svg');
  var overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ACT.buildOverlay(svg, ACT.parse(DSL), overlay);
  return { svg: svg, overlay: overlay };
}
function num(el, a) { return parseFloat(el.getAttribute(a)); }
function pts(p) {
  var n = String(p.getAttribute('points')).split(/[\s,]+/).map(parseFloat);
  var out = [];
  for (var i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i], y: n[i + 1] });
  return out;
}
function bboxOf(list) {
  var xs = list.map(function(q) { return q.x; }), ys = list.map(function(q) { return q.y; });
  return { x: Math.min.apply(null, xs), y: Math.min.apply(null, ys),
    w: Math.max.apply(null, xs) - Math.min.apply(null, xs), h: Math.max.apply(null, ys) - Math.min.apply(null, ys) };
}
// 点を覆う枠のうち、いちばん手前 (document の後ろ) のもの
function topAt(overlay, x, y) {
  var hit = null;
  Array.prototype.forEach.call(overlay.querySelectorAll('rect.selectable[data-type]'), function(r) {
    if (r.style && r.style.pointerEvents === 'none') return;
    if (x >= num(r, 'x') && x <= num(r, 'x') + num(r, 'width') && y >= num(r, 'y') && y <= num(r, 'y') + num(r, 'height')) hit = r;
  });
  return hit;
}
// 文字を持たない小さい菱形 (合流・repeat の入口) を上から順に
function plainDiamonds(svg) {
  return Array.prototype.filter.call(svg.querySelectorAll('polygon'), function(p) {
    var b = bboxOf(pts(p));
    return b.w >= 20 && b.w <= 30 && b.h >= 20 && b.h <= 30;
  }).map(function(p) { return bboxOf(pts(p)); }).sort(function(a, b) { return a.y - b.y; });
}

describe('閉じの行が描く図形にも枠が出る (PlantUML 1.2026.8)', function() {
  var f = build();
  var ds = plainDiamonds(f.svg);
  var bars = Array.prototype.filter.call(f.svg.querySelectorAll('rect'), function(r) {
    return num(r, 'height') > 0 && num(r, 'height') < 12;
  }).map(function(r) { return { x: num(r, 'x'), y: num(r, 'y'), w: num(r, 'width'), h: num(r, 'height') }; })
    .sort(function(a, b) { return a.y - b.y; });

  test('前提: 文字の無い菱形は 3 つ (endif の合流・endswitch の合流・repeat の入口)、棒は 2 本', function() {
    expect(ds.length).toBe(3);
    expect(bars.length).toBe(2);
  });

  test('endif の合流の菱形は endif の行を指す', function() {
    var r = topAt(f.overlay, ds[0].x + ds[0].w / 2, ds[0].y + ds[0].h / 2);
    expect(r && r.getAttribute('data-line')).toBe(String(lineOf(/^endif$/)));
  });

  test('endswitch の合流の菱形は endswitch の行を指す', function() {
    var r = topAt(f.overlay, ds[1].x + ds[1].w / 2, ds[1].y + ds[1].h / 2);
    expect(r && r.getAttribute('data-line')).toBe(String(lineOf(/^endswitch$/)));
  });

  test('repeat の入口の菱形は repeat の行を指す', function() {
    var r = topAt(f.overlay, ds[2].x + ds[2].w / 2, ds[2].y + ds[2].h / 2);
    expect(r && r.getAttribute('data-line')).toBe(String(lineOf(/^repeat$/)));
  });

  test('fork の棒は fork の行、下の棒は end fork の行を指す', function() {
    var top = topAt(f.overlay, bars[0].x + bars[0].w / 2, bars[0].y + bars[0].h / 2);
    var bottom = topAt(f.overlay, bars[1].x + bars[1].w / 2, bars[1].y + bars[1].h / 2);
    expect(top && top.getAttribute('data-line')).toBe(String(lineOf(/^fork$/)));
    expect(bottom && bottom.getAttribute('data-line')).toBe(String(lineOf(/^end fork$/)));
  });

  test('線の端に付いた矢じりにはどれも矢印の枠が出る (合流へ入る・棒から出る・repeat の入口へ入る矢印を含む)', function() {
    // repeat の戻りの矢印は線の途中に矢じりを描く (この BLK の外)。線の端に先が触れる矢じりだけを見る
    var ends = [];
    Array.prototype.forEach.call(f.svg.querySelectorAll('line'), function(l) {
      ends.push({ x: num(l, 'x1'), y: num(l, 'y1') }, { x: num(l, 'x2'), y: num(l, 'y2') });
    });
    var heads = Array.prototype.filter.call(f.svg.querySelectorAll('polygon'), function(p) {
      var q = pts(p), b = bboxOf(q);
      if (q.length !== 4 || b.w > 12 || b.h > 12) return false;
      var tip = q[1];   // 2 点目が先端
      return ends.some(function(e) { return Math.abs(e.x - tip.x) < 1.5 && Math.abs(e.y - tip.y) < 1.5; });
    });
    expect(heads.length).toBeGreaterThan(15);
    heads.forEach(function(p) {
      var b = bboxOf(pts(p));
      var r = topAt(f.overlay, b.x + b.w / 2, b.y + b.h / 2);
      expect(r && r.getAttribute('data-type')).toBe('flow');
    });
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
