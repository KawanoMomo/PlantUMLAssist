'use strict';
// BLK-human-20260912-2130: シーケンス図で入った「ホバーで選択範囲が枠で見え、
// その枠内のどこを押しても同じ要素が選べる」を、状態遷移 / クラス / コンポーネント /
// ユースケース / アクティビティの 5 図種にも同じ仕様で入れる。
// 関係 (遷移・関連・依存・矢印) はラベル・ガード・多重度など付随する文字も含めて
// 1 つの当たり判定にする。実装は src/core/overlay-builder.js の extractLinkBBox 1 か所。
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
  '../src/core/selection-router.js',
  '../src/core/edge-hint.js',
  '../src/core/relation-options.js',
  '../src/core/state-transition.js',
  '../src/modules/usecase.js',
  '../src/modules/component.js',
  '../src/modules/class.js',
  '../src/modules/activity.js',
  '../src/modules/state.js'
];
MODS.forEach(function(m) { delete require.cache[require.resolve(m)]; });
MODS.forEach(function(m) { require(m); });

var OB = window.MA.overlayBuilder;
var MODULES = window.MA.modules;

function loadFixture(name) {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/hover-' + name + '.svg'), 'utf8');
  var dslText = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/hover-' + name + '.puml'), 'utf8');
  var div = document.createElement('div');
  div.innerHTML = svgText;
  return { svgEl: div.querySelector('svg'), dsl: dslText };
}

function buildOverlay(mod, f) {
  var parsed = mod.parse(f.dsl);
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  mod.buildOverlay(f.svgEl, parsed, overlayEl);
  return overlayEl;
}

function rectBox(rect) {
  return {
    x: parseFloat(rect.getAttribute('x')),
    y: parseFloat(rect.getAttribute('y')),
    w: parseFloat(rect.getAttribute('width')),
    h: parseFloat(rect.getAttribute('height')),
  };
}

function covers(rect, x, y) {
  var b = rectBox(rect);
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

// 関係の <g class="link"> の中で「押されうる点」: ラベル等 <text> の先頭と末尾、
// 矢じり <polygon> の頂点、線 <path> の始点と終点。
function linkClickPoints(g) {
  var pts = [];
  Array.prototype.forEach.call(g.querySelectorAll('text'), function(t) {
    var x = parseFloat(t.getAttribute('x')) || 0;
    var y = parseFloat(t.getAttribute('y')) || 0;
    var w = parseFloat(t.getAttribute('textLength')) || 0;
    pts.push({ x: x + 1, y: y - 4, what: 'ラベル先頭: ' + t.textContent });
    pts.push({ x: x + w / 2, y: y - 4, what: 'ラベル中央: ' + t.textContent });
    pts.push({ x: x + w - 1, y: y - 4, what: 'ラベル末尾: ' + t.textContent });
  });
  // 矢じりは重心 (先端は相手の図形の縁に接するので、そこは相手の当たり判定でよい)
  var poly = g.querySelector('polygon');
  if (poly) {
    var nums = (poly.getAttribute('points') || '').split(/[\s,]+/)
      .map(parseFloat).filter(function(v) { return !isNaN(v); });
    var sx = 0, sy = 0, n = 0;
    for (var i = 0; i + 1 < nums.length; i += 2) { sx += nums[i]; sy += nums[i + 1]; n++; }
    if (n) pts.push({ x: sx / n, y: sy / n, what: '矢じりの中心' });
  }
  // 線は中ほど (端は図形の縁)
  var p = g.querySelector('path');
  if (p) {
    var d = (p.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g) || [];
    if (d.length >= 4) {
      var mid = Math.floor(d.length / 4) * 2;
      pts.push({ x: parseFloat(d[mid]), y: parseFloat(d[mid + 1]), what: '線の中ほど' });
    }
  }
  return pts;
}

var CASES = [
  { name: 'state', mod: 'plantumlState', relType: 'transition' },
  { name: 'class', mod: 'plantumlClass', relType: 'relation' },
  { name: 'component', mod: 'plantumlComponent', relType: 'relation' },
  { name: 'usecase', mod: 'plantumlUsecase', relType: 'relation' },
];

CASES.forEach(function(c) {
  describe('関係の当たり判定: ' + c.name, function() {
    test('矢印・線・ラベル・ガード・多重度のどこを押しても同じ関係が選ばれる', function() {
      var f = loadFixture(c.name);
      var overlayEl = buildOverlay(MODULES[c.mod], f);
      var rects = Array.prototype.slice.call(
        overlayEl.querySelectorAll('rect[data-type="' + c.relType + '"]'));
      var groups = Array.prototype.slice.call(f.svgEl.querySelectorAll('g.link'));
      expect(groups.length > 0).toBe(true);
      // rect は 1 関係あたり「和集合 1 枚 + ラベルごとの小さい 1 枚」だが、
      // data-id は関係と 1 対 1 (= 利用者から見た当たり判定は関係ごとに 1 つ)
      var ids = {};
      rects.forEach(function(r) { ids[r.getAttribute('data-id')] = true; });
      expect(Object.keys(ids).length).toBe(groups.length);

      var seen = {};
      for (var i = 0; i < groups.length; i++) {
        // ラベルを持つ関係だけを見る (ラベルの無い関係は元から線の箱で足りている)
        if (!groups[i].querySelector('text')) continue;
        var pts = linkClickPoints(groups[i]);
        expect(pts.length > 2).toBe(true);
        // 押されうる全ての点が「同じ 1 つの」関係の当たり判定に入ること。
        // どの点を押しても選ばれる関係が変わらない、が守りたい性質。
        var id = null;
        for (var j = 0; j < pts.length; j++) {
          var hit = OB.hitTestTopmost(overlayEl, pts[j].x, pts[j].y);
          // 矢じりは相手の図形の縁に接して描かれる。縁の内側の 1 点が相手の
          // 図形の当たり判定になるのは正しい (押した先が相手の図形) ので、
          // 関係の当たり判定がその点を含んでいれば良しとする。
          if (pts[j].what === '矢じりの中心' && hit
              && hit.getAttribute('data-type') !== c.relType) {
            var own = OB.extractLinkBBox(groups[i], 8);
            expect(pts[j].x >= own.x && pts[j].x <= own.x + own.width
              && pts[j].y >= own.y && pts[j].y <= own.y + own.height).toBe(true);
            continue;
          }
          if (!hit || hit.getAttribute('data-type') !== c.relType) {
            throw new Error(c.name + ' link#' + i + ' の ' + pts[j].what
              + ' (' + pts[j].x + ',' + pts[j].y + ') で ' + c.relType
              + ' が選ばれない / hit=' + (hit ? hit.getAttribute('data-type') : 'none'));
          }
          if (id === null) id = hit.getAttribute('data-id');
          if (hit.getAttribute('data-id') !== id) {
            throw new Error(c.name + ' link#' + i + ' の ' + pts[j].what
              + ' だけ別の関係 (' + hit.getAttribute('data-id') + ' != ' + id + ') が選ばれる');
          }
        }
        // 関係ごとに別の id が当たること (全部が同じ 1 つに吸われていない)
        expect(seen[id]).toBe(undefined);
        seen[id] = true;
      }
      expect(Object.keys(seen).length > 0).toBe(true);
    });

    test('関係の当たり判定はラベルを含むので線と矢じりだけの箱より広い', function() {
      var f = loadFixture(c.name);
      var overlayEl = buildOverlay(MODULES[c.mod], f);
      var groups = Array.prototype.slice.call(f.svgEl.querySelectorAll('g.link'));
      var widened = 0;
      for (var i = 0; i < groups.length; i++) {
        var t = groups[i].querySelector('text');
        if (!t) continue;
        // 従来の当たり判定 = 線と矢じりだけ (ラベルを含まない) の箱
        var lineOnly = OB.extractUnionBBox(groups[i], 'path, line, polygon');
        var withLabel = OB.extractLinkBBox(groups[i], 8);
        if (!lineOnly || !withLabel) continue;
        if (withLabel.width * withLabel.height > lineOnly.width * lineOnly.height) widened++;
      }
      expect(widened > 0).toBe(true);
    });
  });
});

describe('要素の当たり判定', function() {
  test('状態は枠の中のどこ (ラベルの文字・枠の四隅の内側) を押しても選ばれる', function() {
    var f = loadFixture('state');
    var overlayEl = buildOverlay(MODULES.plantumlState, f);
    var stateRects = overlayEl.querySelectorAll('rect[data-type="state"]');
    expect(stateRects.length > 0).toBe(true);
    Array.prototype.forEach.call(f.svgEl.querySelectorAll('g.entity'), function(g) {
      var r = g.querySelector('rect');
      var t = g.querySelector('text');
      if (!r || !t) return;
      var x = parseFloat(r.getAttribute('x'));
      var y = parseFloat(r.getAttribute('y'));
      var w = parseFloat(r.getAttribute('width'));
      var h = parseFloat(r.getAttribute('height'));
      var pts = [
        { x: x + 1, y: y + 1 }, { x: x + w - 1, y: y + h - 1 },
        { x: parseFloat(t.getAttribute('x')) + 1, y: parseFloat(t.getAttribute('y')) - 4 },
      ];
      pts.forEach(function(p) {
        var hit = OB.hitTestTopmost(overlayEl, p.x, p.y);
        expect(hit && hit.getAttribute('data-type')).toBe('state');
      });
    });
  });

  test('アクティビティのアクション・分岐は形の中のどこを押しても選ばれる', function() {
    var f = loadFixture('activity');
    var overlayEl = buildOverlay(MODULES.plantumlActivity, f);
    var rects = overlayEl.querySelectorAll('rect[data-type="action"]');
    expect(rects.length > 0).toBe(true);
    Array.prototype.forEach.call(rects, function(r) {
      var b = rectBox(r);
      [[b.x + 1, b.y + 1], [b.x + b.w - 1, b.y + b.h - 1], [b.x + b.w / 2, b.y + b.h / 2]]
        .forEach(function(p) { expect(covers(r, p[0], p[1])).toBe(true); });
    });
  });
});

describe('hover の枠', function() {
  var html = fs.readFileSync(path.join(__dirname, '../plantuml-assist.html'), 'utf8');

  test('data-type を持つ当たり判定は図種を問わず同じ青の破線で囲われる', function() {
    var sel = '#overlay-layer rect.selectable[data-type]:hover:not(.selected)';
    var i = html.indexOf(sel);
    expect(i > -1).toBe(true);
    var block = html.slice(i, html.indexOf('}', i));
    expect(block.indexOf('stroke:') > -1).toBe(true);
    expect(block.indexOf('stroke-dasharray') > -1).toBe(true);
    // シーケンス専用のセレクタは残っていない (図種ごとに別実装しない)
    expect(html.indexOf('rect.selectable[data-type="message"]:hover')).toBe(-1);
  });

  test('peek (琥珀) と lg-mark (緑) の印は hover の枠に上書きされない', function() {
    var sel = '#overlay-layer rect.selectable[data-type]:hover:not(.selected)';
    var i = html.indexOf(sel);
    var line = html.slice(i, html.indexOf('{', i));
    expect(line.indexOf(':not(.peek)') > -1).toBe(true);
    expect(line.indexOf(':not(.lg-mark)') > -1).toBe(true);
  });
});

describe('extractLinkBBox (共通実装)', function() {
  test('線・矢じり・ラベルの和集合に padding を足した箱を返す', function() {
    var div = document.createElement('div');
    div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><g class="link">'
      + '<path d="M10,10 C10,20 10,30 10,40" fill="none"/>'
      + '<polygon points="10,46,14,37,10,41,6,37,10,46"/>'
      + '<text x="12" y="30" textLength="40">start [ready]</text>'
      + '</g></svg>';
    var g = div.querySelector('g.link');
    var bb = OB.extractLinkBBox(g, 8);
    // x: min(6, 10, 12) - 8 = -2 / 右端: max(14, 52) + 8 = 60
    expect(bb.x).toBe(-2);
    expect(bb.x + bb.width).toBe(60);
    expect(bb.y <= 10 - 8).toBe(true);
    expect(bb.y + bb.height >= 46 + 8).toBe(true);
  });

  test('関係の <g> でなければ null を返す (呼び出し元は従来の箱に落ちる)', function() {
    expect(OB.extractLinkBBox(null, 8)).toBe(null);
  });

  test('closestLinkGroup は子要素から関係の <g> を遡れる', function() {
    var div = document.createElement('div');
    div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><g class="link">'
      + '<polygon points="0,0,1,1,2,2,0,0"/></g></svg>';
    var poly = div.querySelector('polygon');
    expect(OB.closestLinkGroup(poly)).toBe(div.querySelector('g.link'));
    expect(OB.closestLinkGroup(div.querySelector('svg'))).toBe(null);
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
MODS.forEach(function(m) { delete require.cache[require.resolve(m)]; });
