'use strict';
// BLK-human-20260912-0900: シーケンスのメッセージは、ステレオタイプ・autonumber の
// 有無に関わらず「矢印・ラベル・番号・ステレオタイプのどこを押しても」同じメッセージが
// 選ばれること。従来は g.message の最初の <text> だけを当たり判定にしていたため、
// autonumber では番号、ステレオタイプ付きではステレオタイプの文字だけが反応していた。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

// run-tests.js は全 test file を 1 プロセスで回し、global.window に軽量 sandbox を
// 置いている。ここで jsdom に差し替えたままにすると後続の test file が壊れるので、
// ファイル末尾で必ず元に戻す。
var _prevWindow = global.window;
var _prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;

var MODS = [
  '../src/core/html-utils.js',
  '../src/core/dsl-utils.js', '../src/core/note-edit.js',
  '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js',
  '../src/core/dsl-updater.js',
  '../src/core/text-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/line-resolver.js',
  '../src/core/overlay-builder.js',
  '../src/core/selection-router.js',
  '../src/core/sequence-participant-zone.js', '../src/modules/sequence.js',
  '../src/ui/sequence-overlay.js'
];
// 先行する test ファイルが別の jsdom window でこれらを require 済みだと、
// require キャッシュのせいで IIFE が再実行されず現在の window に登録されない。
MODS.forEach(function(m) { delete require.cache[require.resolve(m)]; });
MODS.forEach(function(m) { require(m); });

var seq = window.MA.modules.plantumlSequence;
var overlay = window.MA.sequenceOverlay;
var OB = window.MA.overlayBuilder;

function loadFixture(name) {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/' + name + '.svg'), 'utf8');
  var dslText = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/' + name + '.puml'), 'utf8');
  var div = document.createElement('div');
  div.innerHTML = svgText;
  return { svgEl: div.querySelector('svg'), parsed: seq.parseSequence(dslText) };
}

function buildOverlay(f) {
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
  return overlayEl;
}

function rectsOf(overlayEl) {
  return Array.prototype.slice.call(overlayEl.querySelectorAll('rect[data-type="message"]'));
}

function covers(rect, x, y) {
  var rx = parseFloat(rect.getAttribute('x'));
  var ry = parseFloat(rect.getAttribute('y'));
  var rw = parseFloat(rect.getAttribute('width'));
  var rh = parseFloat(rect.getAttribute('height'));
  return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
}

// g.message の中の「押されうる点」: 各 text の先頭・末尾、矢印の線の両端と中点。
function clickPoints(g) {
  var pts = [];
  Array.prototype.forEach.call(g.querySelectorAll('text'), function(t) {
    var x = parseFloat(t.getAttribute('x')) || 0;
    var y = parseFloat(t.getAttribute('y')) || 0;
    var w = parseFloat(t.getAttribute('textLength')) || 0;
    pts.push({ x: x + 1, y: y - 4, what: 'text head: ' + t.textContent });
    pts.push({ x: x + w - 1, y: y - 4, what: 'text tail: ' + t.textContent });
  });
  var line = g.querySelector('line');
  if (line) {
    var x1 = parseFloat(line.getAttribute('x1'));
    var x2 = parseFloat(line.getAttribute('x2'));
    var ly = parseFloat(line.getAttribute('y1'));
    pts.push({ x: (x1 + x2) / 2, y: ly, what: 'arrow middle' });
    pts.push({ x: Math.min(x1, x2) + 1, y: ly, what: 'arrow start' });
    pts.push({ x: Math.max(x1, x2) - 1, y: ly, what: 'arrow end' });
  }
  return pts;
}

['sequence-basic', 'sequence-autonumber', 'sequence-stereotype'].forEach(function(name) {
  describe('message hit area: ' + name, function() {
    test('矢印・ラベル・番号・ステレオタイプのどの点も同じ rect に入る', function() {
      var f = loadFixture(name);
      var overlayEl = buildOverlay(f);
      var rects = rectsOf(overlayEl);
      var groups = f.svgEl.querySelectorAll('g.message');
      expect(rects.length).toBe(groups.length);
      for (var i = 0; i < groups.length; i++) {
        var pts = clickPoints(groups[i]);
        expect(pts.length > 2).toBe(true);
        for (var j = 0; j < pts.length; j++) {
          var hit = OB.hitTestTopmost(overlayEl, pts[j].x, pts[j].y);
          var ok = hit && hit.getAttribute('data-type') === 'message'
            && hit.getAttribute('data-id') === rects[i].getAttribute('data-id');
          if (!ok) {
            throw new Error(name + ' msg#' + i + ' の ' + pts[j].what
              + ' (' + pts[j].x + ',' + pts[j].y + ') が message rect に入らない'
              + ' / hit=' + (hit ? hit.getAttribute('data-type') + ':' + hit.getAttribute('data-id') : 'none'));
          }
          expect(covers(rects[i], pts[j].x, pts[j].y)).toBe(true);
        }
      }
    });
  });
});

describe('extractUnionBBox', function() {
  test('text/line/polygon すべてを含む箱を返す', function() {
    var div = document.createElement('div');
    div.innerHTML = '<svg><g class="message">'
      + '<polygon points="100,10,110,14,100,18,104,14"/>'
      + '<line x1="20" x2="106" y1="14" y2="14"/>'
      + '<text x="30" y="10" textLength="8" font-size="13">1</text>'
      + '<text x="42" y="10" textLength="30" font-size="13">Login</text>'
      + '</g></svg>';
    var g = div.querySelector('g.message');
    var bb = OB.extractUnionBBox(g);
    expect(bb === null).toBe(false);
    expect(bb.x <= 20).toBe(true);
    expect(bb.x + bb.width >= 110).toBe(true);
    expect(bb.y <= -3).toBe(true);
    expect(bb.y + bb.height >= 18).toBe(true);
  });

  test('中身が無ければ null', function() {
    var div = document.createElement('div');
    div.innerHTML = '<svg><g class="message"></g></svg>';
    expect(OB.extractUnionBBox(div.querySelector('g.message'))).toBe(null);
  });
});

describe('message の hover 表示', function() {
  test('当たり判定の範囲が分かる hover スタイルを持つ', function() {
    var html = fs.readFileSync(path.join(__dirname, '../plantuml-assist.html'), 'utf8');
    // BLK-human-20260912-2130: hover の枠はシーケンス専用セレクタをやめ、
    // data-type を持つ当たり判定全部 (= 全図種) に共通の 1 ルールにした。
    // メッセージにも同じ枠が出るので、確かめる対象を共通のセレクタに寄せる。
    var i = html.indexOf('#overlay-layer rect.selectable[data-type]:hover:not(.selected)');
    expect(i > -1).toBe(true);
    var block = html.slice(i, html.indexOf('}', i));
    expect(block.indexOf('stroke:') > -1).toBe(true);
    expect(block.indexOf('stroke-dasharray') > -1).toBe(true);
  });
});

// 後続の test file のために sandbox を復す。
global.window = _prevWindow;
global.document = _prevDocument;
// 自分の jsdom window に登録されたモジュールをキャッシュに残すと、後続の
// test file が require しても IIFE が再実行されず自分の window に登録されない。
MODS.forEach(function(m) { delete require.cache[require.resolve(m)]; });
