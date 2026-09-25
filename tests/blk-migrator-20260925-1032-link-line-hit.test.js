'use strict';
// BLK-migrator-20260925-1032: 複合状態 (入れ物) の中の空所を指すと、その中を通る遷移が選ばれていた。
// 遷移の当たり判定が「線・矢じり・ラベルを囲う箱」1 枚で、斜めや折れた線では線の無い空所まで覆い、
// しかも箱が入れ物より手前にあったため。線そのものは太い透明な線 (path.link-hit) で当て、入れ物より手前に、
// 箱は入れ物より後ろに置く。入れ物の外では箱が今までどおり当たる。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

var _prevWindow = global.window;
var _prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;

var MODS = [
  '../src/core/html-utils.js',
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js',
  '../src/core/dsl-updater.js',
  '../src/core/text-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/line-resolver.js',
  '../src/core/overlay-builder.js',
  '../src/core/state-svg-map.js',
  '../src/core/selection-router.js',
  '../src/core/edge-hint.js',
  '../src/core/relation-options.js',
  '../src/core/state-transition.js',
  '../src/modules/state.js'
];
MODS.forEach(function(m) { delete require.cache[require.resolve(m)]; });
MODS.forEach(function(m) { require(m); });

var OB = window.MA.overlayBuilder;
var ST = window.MA.modules.plantumlState;

function build() {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/state-composite-center.svg'), 'utf8');
  var dsl = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/state-composite-center.puml'), 'utf8');
  var div = document.createElement('div');
  div.innerHTML = svgText;
  var svgEl = div.querySelector('svg');
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ST.buildOverlay(svgEl, ST.parse(dsl), overlayEl);
  return { svgEl: svgEl, overlayEl: overlayEl };
}

describe('関係の線に沿った当たり判定 (BLK-migrator-20260925-1032)', function() {
  test('linePoints: 直線・H/V・相対・3 次曲線を折れ線の点列にする', function() {
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M10,10 L50,10 V30 h-20 C30,60 60,60 60,30');
    var subs = OB.linePoints(p);
    expect(subs.length).toBe(1);
    var pts = subs[0];
    expect(pts[0]).toEqual([10, 10]);
    expect(pts[1]).toEqual([50, 10]);
    expect(pts[2]).toEqual([50, 30]);
    expect(pts[3]).toEqual([30, 30]);
    var last = pts[pts.length - 1];
    expect(Math.round(last[0])).toBe(60);
    expect(Math.round(last[1])).toBe(30);
    // 曲線は刻まれて、制御点 (y=60) まで届かない
    var maxY = Math.max.apply(null, pts.map(function(q) { return q[1]; }));
    expect(maxY < 55).toBe(true);
    var ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    ln.setAttribute('x1', '0'); ln.setAttribute('y1', '0'); ln.setAttribute('x2', '0'); ln.setAttribute('y2', '40');
    expect(OB.linePoints(ln)).toEqual([[[0, 0], [0, 40]]]);
  });

  test('遷移ごとに線の当たり (path.link-hit、幅 16、linkline) を置き、箱 (link) は入れ物より後ろ', function() {
    var f = build();
    var lines = f.overlayEl.querySelectorAll('path.link-hit[data-type="transition"]');
    expect(lines.length >= 4).toBe(true);
    Array.prototype.forEach.call(lines, function(l) {
      expect(l.getAttribute('data-hit-kind')).toBe('linkline');
      expect(l.getAttribute('stroke-width')).toBe('16');
    });
    var all = Array.prototype.slice.call(f.overlayEl.querySelectorAll('rect.selectable, path.link-hit'));
    var idx = function(sel) { return all.indexOf(f.overlayEl.querySelector(sel)); };
    var container = idx('rect[data-hit-kind="container"]');
    expect(container >= 0).toBe(true);
    expect(idx('rect[data-type="transition"][data-hit-kind="link"]') < container).toBe(true);
    expect(idx('path.link-hit') > container).toBe(true);
  });

  test('複合状態の真ん中 (線の無い空所) を指すと複合状態が選ばれる', function() {
    var f = build();
    var r = f.svgEl.querySelector('rect[fill="none"][rx="12.5"]');
    var x = parseFloat(r.getAttribute('x')) + parseFloat(r.getAttribute('width')) / 2;
    var y = parseFloat(r.getAttribute('y')) + parseFloat(r.getAttribute('height')) / 2;
    // 前提: その点はどの遷移の線からも 8px より離れ、どれかの遷移の箱の中にある (以前はその遷移が選ばれた)
    var inBox = Array.prototype.some.call(f.overlayEl.querySelectorAll('rect[data-hit-kind="link"]'), function(b) {
      var bx = +b.getAttribute('x'), by = +b.getAttribute('y');
      return x >= bx && x <= bx + +b.getAttribute('width') && y >= by && y <= by + +b.getAttribute('height');
    });
    expect(inBox).toBe(true);
    var hit = OB.hitTestTopmost(f.overlayEl, x, y);
    expect(hit && hit.getAttribute('data-type')).toBe('state');
    expect(hit.getAttribute('data-id')).toBe('counter');
  });

  test('遷移の線の上・ラベルの上は、複合状態の中でもその遷移が選ばれる', function() {
    var f = build();
    var links = Array.prototype.slice.call(f.svgEl.querySelectorAll('g.link'));
    links.forEach(function(g) {
      var line = parseInt(g.getAttribute('data-source-line'), 10) + 1;
      var subs = OB.linePoints(g.querySelector('path'));
      var pts = subs[0];
      var mid = pts[Math.floor(pts.length / 2)];
      var hit = OB.hitTestTopmost(f.overlayEl, mid[0] + 3, mid[1] + 3);
      expect(hit && hit.getAttribute('data-type')).toBe('transition');
      expect(hit.getAttribute('data-line')).toBe(String(line));
      Array.prototype.forEach.call(g.querySelectorAll('text'), function(t) {
        var tx = parseFloat(t.getAttribute('x')) + (parseFloat(t.getAttribute('textLength')) || 10) / 2;
        var th = OB.hitTestTopmost(f.overlayEl, tx, parseFloat(t.getAttribute('y')) - 4);
        expect(th && th.getAttribute('data-line')).toBe(String(line));
      });
    });
  });

  test('線から 8px を超えて離れた空所は、入れ物が無ければ今までどおり関係の箱が当たる', function() {
    var ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var svg = new window.DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg"><g class="link"><path d="M0,0 L100,100" fill="none"/></g></svg>',
      'image/svg+xml').documentElement;
    OB.addLinkRects(ov, svg.querySelector('g.link'), { 'data-type': 'relation', 'data-id': 'r1' }, 8);
    OB.raiseSmallestLast(ov);
    var hit = OB.hitTestTopmost(ov, 80, 20);   // 対角線から約 42px
    expect(hit && hit.getAttribute('data-hit-kind')).toBe('link');
    var on = OB.hitTestTopmost(ov, 50, 52);
    expect(on && on.getAttribute('data-hit-kind')).toBe('linkline');
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
MODS.forEach(function(m) { try { delete require.cache[require.resolve(m)]; } catch (e) {} });
