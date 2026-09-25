'use strict';
// BLK-builder-20260925-1712-1: PlantUML 1.2026.7 以降のシーケンス図 (メッセージが class の無い線と矢じり) で、
// ライフラインの上を矢印の線から数 px 離れて指すと、その矢印のメッセージが選ばれた (migrator の実物 7 枚)。
// ライフラインを手前に出す高さは「メッセージが描いた物」(parts) で決める。parts を矢印全体・上下 5px の帯 1 枚に
// していたため、線の尾 (太さ 1px) の上下 7px までがメッセージのものになっていた。
// 当て方: 線は描いた太さ、矢じりはその形の外接矩形、文字は文字の箱。
// fixtures/svg/v1-2026-8-seq-autonumber.svg は同名の dsl を PlantUML 1.2026.8 で描いたもの。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

// run-tests.js は全ファイルを 1 つの window で回すので、自分の window は終わったら元に戻す
var _prevWindow = global.window;
var _prevDocument = global.document;
var _prevParser = global.DOMParser;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;

var MODS = [
  '../src/core/html-utils.js', '../src/core/dsl-utils.js', '../src/core/note-edit.js', '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js', '../src/core/dsl-updater.js', '../src/core/text-updater.js',
  '../src/core/parser-utils.js', '../src/core/line-resolver.js', '../src/core/overlay-builder.js',
  '../src/core/selection-router.js', '../src/core/sequence-participant-zone.js', '../src/core/sequence-autonumber.js',
  '../src/core/sequence-activation-insert.js', '../src/core/app-bridge.js',
  '../src/modules/sequence.js', '../src/ui/sequence-overlay.js',
];
MODS.forEach(function(m) { try { delete require.cache[require.resolve(m)]; } catch (e) {} });
MODS.forEach(function(m) { try { require(m); } catch (e) {} });

var W = global.window;
var SEQ = W.MA.modules.plantumlSequence;
var SO = W.MA.sequenceOverlay;
var FIX = path.join(__dirname, 'fixtures');

function build(name) {
  var div = document.createElement('div');
  div.innerHTML = fs.readFileSync(path.join(FIX, 'svg', 'v1-2026-8-' + name + '.svg'), 'utf8');
  var svg = div.querySelector('svg');
  var dsl = fs.readFileSync(path.join(FIX, 'dsl', 'v1-2026-8-' + name + '.puml'), 'utf8').replace(/\r\n/g, '\n');
  var out = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  SO.buildSequenceOverlay(svg, SEQ.parseSequence(dsl), out, dsl);
  return { svg: svg, out: out };
}
function num(el, a) { return parseFloat(el.getAttribute(a)); }
// 点 (x, y) を覆う rect のうち document 順で最後 (= 手前) のもの。pointer-events:none は除く。
function topAt(out, x, y) {
  var hit = null;
  Array.prototype.forEach.call(out.querySelectorAll('rect[data-type]'), function(r) {
    if (r.style && r.style.pointerEvents === 'none') return;
    var rx = num(r, 'x'), ry = num(r, 'y'), rw = num(r, 'width'), rh = num(r, 'height');
    if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) hit = r;
  });
  return hit;
}
// 描かれた矢印: 実線・点線の水平な <line> (ライフラインの点線は縦なので除く)
function arrows(svg) {
  return Array.prototype.filter.call(svg.querySelectorAll('line'), function(l) {
    return num(l, 'y1') === num(l, 'y2') && Math.abs(num(l, 'x2') - num(l, 'x1')) > 20;
  }).map(function(l) {
    return { x1: Math.min(num(l, 'x1'), num(l, 'x2')), x2: Math.max(num(l, 'x1'), num(l, 'x2')), y: num(l, 'y1') };
  });
}
function lifelineXs(svg) {
  return Array.prototype.map.call(svg.querySelectorAll('g > title'), function(t) {
    var line = t.parentNode.querySelector('line');
    return { name: t.textContent, x: num(line, 'x1') };
  });
}

describe('1.2026.8 のシーケンス図: 矢印の尾が付くライフライン', function() {
  var f = build('seq-autonumber');
  var lls = lifelineXs(f.svg);
  // 矢印の端のうち、ライフラインの線の上にあるもの (= 矢じりの無い尾。矢じり側は線の手前で止まる)
  var tails = [];
  arrows(f.svg).forEach(function(a) {
    lls.forEach(function(ll) {
      if (Math.abs(a.x1 - ll.x) < 1.5 || Math.abs(a.x2 - ll.x) < 1.5) tails.push({ ll: ll, y: a.y });
    });
  });

  test('前提: 4 本の矢印の尾がライフラインの上にある', function() {
    expect(tails.length).toBe(4);
  });

  test('尾の線から上下 5px 離れたライフラインの上はライフラインが選ばれる', function() {
    tails.forEach(function(t) {
      [-5, 5].forEach(function(dy) {
        var hit = topAt(f.out, t.ll.x, t.y + dy);
        expect(hit && hit.getAttribute('data-type') + ':' + hit.getAttribute('data-id'))
          .toBe('lifeline:' + t.ll.name);
      });
    });
  });

  test('尾の線そのものの上はメッセージが選ばれる', function() {
    tails.forEach(function(t) {
      var hit = topAt(f.out, t.ll.x, t.y);
      expect(hit && hit.getAttribute('data-type')).toBe('message');
    });
  });

  test('矢じりの上はメッセージが選ばれる (矢じりは形の外接矩形でメッセージのもの)', function() {
    Array.prototype.forEach.call(f.svg.querySelectorAll('polygon'), function(pg) {
      var p = String(pg.getAttribute('points')).split(/[\s,]+/).map(parseFloat);
      var tipX = p[2], tipY = p[3];   // 2 点目が先端
      var hit = topAt(f.out, tipX, tipY + 3);
      expect(hit && hit.getAttribute('data-type')).toBe('message');
    });
  });
});

describe("矢じりの形がいろいろな矢印 (開いた矢じり・×印・半矢じり・自分宛て・両向き)", function() {
  test('どの矢印も線の上ではメッセージ、尾の付くライフラインの上下 5px はライフライン', function() {
    var f = build('seq-arrows');
    var lls = lifelineXs(f.svg);
    var checked = 0;
    arrows(f.svg).forEach(function(a) {
      lls.forEach(function(ll) {
        var atEnd = Math.abs(a.x1 - ll.x) < 0.5 || Math.abs(a.x2 - ll.x) < 0.5;
        if (!atEnd) return;
        var on = topAt(f.out, ll.x, a.y);
        expect(on && on.getAttribute('data-type')).toBe('message');
        // 同じ高さに別の矢印 (自分宛て・両向き) や矢じりが無い所だけ比べる
        var near = arrows(f.svg).some(function(b) { return !(b.y === a.y && b.x1 === a.x1 && b.x2 === a.x2) && Math.abs(b.y - a.y) < 12 && b.x1 <= ll.x + 12 && b.x2 >= ll.x - 12; });
        if (near) return;
        var off = topAt(f.out, ll.x, a.y - 5);
        if (off && off.getAttribute('data-type') === 'message') {
          // 矢じり (多角形、または開いた矢じりの短い斜線) がこの端に接していれば、その高さは矢じり (メッセージ) のもの
          var tipLine = Array.prototype.some.call(f.svg.querySelectorAll('line'), function(l) {
            var dx = Math.abs(num(l, 'x2') - num(l, 'x1')), dy = Math.abs(num(l, 'y2') - num(l, 'y1'));
            return dx >= 3 && dy >= 3 && dx <= 16 && dy <= 16 &&
              Math.min(Math.abs(num(l, 'x1') - ll.x), Math.abs(num(l, 'x2') - ll.x)) <= 2 &&
              Math.abs((num(l, 'y1') + num(l, 'y2')) / 2 - a.y) <= 8;
          });
          var tipPoly = Array.prototype.some.call(f.svg.querySelectorAll('polygon'), function(pg) {
            var p = String(pg.getAttribute('points')).split(/[\s,]+/).map(parseFloat);
            var xs = [], ys = [];
            for (var i = 0; i + 1 < p.length; i += 2) { xs.push(p[i]); ys.push(p[i + 1]); }
            return Math.min.apply(null, xs.map(function(x) { return Math.abs(x - ll.x); })) <= 2 &&
              Math.min.apply(null, ys) <= a.y - 3 && Math.max.apply(null, ys) >= a.y - 1;
          });
          expect(tipLine || tipPoly).toBe(true);
          return;
        }
        expect(off && off.getAttribute('data-type')).toBe('lifeline');
        checked++;
      });
    });
    expect(checked).toBeGreaterThan(0);
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
global.DOMParser = _prevParser;
