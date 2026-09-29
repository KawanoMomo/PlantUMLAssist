'use strict';
// BLK-builder-20260925-0934-3: 図の飾り (title / header / footer / caption / legend) の枠を図種で分けずに置く。
// PlantUML は class 図などでは <g class="header"> … に入れて描き (legend は行を持たない)、sequence では class の無い
// 裸の <text> / <rect> で描く。どちらも本文の行から飾りを読み、描かれたものに書かれた行を指す枠を置く。
// fixtures/svg/chrome-*.svg は同名の fixtures/dsl/*.puml を同梱の plantuml.jar で描いたもの
// (chrome-seq = corpus の seq-18 を 1.2026.2 で描いた裸の文字、chrome-seq-g = 同じ図を 1.2026.3 で描いた <g class="header"> …、
// chrome-class = web/plantuml の vega/nonreg/simple/A0005 から前書きを除いたもの)。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

var _prevWindow = global.window;
var _prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;

var MODS = ['../src/core/overlay-builder.js'];
MODS.forEach(function(m) { delete require.cache[require.resolve(m)]; });
MODS.forEach(function(m) { require(m); });
var OB = window.MA.overlayBuilder;

function fixture(name) {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures', 'svg', name + '.svg'), 'utf8');
  var dsl = fs.readFileSync(path.join(__dirname, 'fixtures', 'dsl', name + '.puml'), 'utf8');
  var host = document.createElement('div');
  host.innerHTML = svgText.replace(/^<\?[^>]*\?>/, '');
  var svgEl = host.querySelector('svg');
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  return { svgEl: svgEl, overlayEl: overlayEl, dsl: dsl };
}

function chromeRects(overlayEl) {
  var out = {};
  Array.prototype.forEach.call(overlayEl.querySelectorAll('rect[data-src-kind]'), function(r) {
    out[r.getAttribute('data-src-kind')] = {
      line: Number(r.getAttribute('data-line')),
      x: parseFloat(r.getAttribute('x')), y: parseFloat(r.getAttribute('y')),
      w: parseFloat(r.getAttribute('width')), h: parseFloat(r.getAttribute('height')),
    };
  });
  return out;
}

function contains(r, x, y, w, h) {
  return r.x <= x && r.y <= y && r.x + r.w >= x + w && r.y + r.h >= y + h;
}

describe('chromeEntries: 本文から飾りを読む', function() {
  test('1 行の飾りと、legend … endlegend / header … endheader の複数行', function() {
    var e = OB.chromeEntries([
      '@startuml', 'title 題名', 'center header ヘッダ', 'right footer Page %page%', 'caption 図1',
      'legend right', '  A = 1', '  B = 2', 'endlegend', 'header', 'h1', 'end header', 'A -> B', '@enduml',
    ].join('\n'));
    expect(e.map(function(x) { return x.kind + '@' + x.line; })).toEqual(
      ['title@2', 'header@3', 'footer@4', 'caption@5', 'legend@6', 'header@10']);
    expect(e[4].texts).toEqual(['A = 1', 'B = 2']);
    expect(e[5].texts).toEqual(['h1']);
  });
  test('<style> の中の `header {` や skinparam titleBorder は飾りではない。`legend legend` は 1 行の凡例', function() {
    var e = OB.chromeEntries(fs.readFileSync(path.join(__dirname, 'fixtures', 'dsl', 'chrome-class.puml'), 'utf8'));
    expect(e.map(function(x) { return x.kind + '@' + x.line; })).toEqual(
      ['title@2', 'legend@3', 'footer@4', 'header@5', 'caption@6']);
    expect(OB.chromeEntries('@startuml\nskinparam titleBorderColor red\nA -> B\n@enduml')).toEqual([]);
  });
  test('\\n で改行した行は表示行に分ける', function() {
    var e = OB.chromeEntries('@startuml\ncaption 一行目\\n二行目\n@enduml');
    expect(e[0].texts).toEqual(['一行目', '二行目']);
  });
});

describe('addDocumentChrome: sequence (裸の text / rect)', function() {
  test('header / footer / caption / legend に書かれた行を指す枠が出る。legend は囲む箱ごと', function() {
    var f = fixture('chrome-seq');
    var n = OB.addDocumentChrome(f.svgEl, f.overlayEl, f.dsl);
    var r = chromeRects(f.overlayEl);
    expect(n).toBe(5);
    expect(r.header.line).toBe(4);
    expect(r.footer.line).toBe(5);
    expect(r.caption.line).toBe(6);
    expect(r.legend.line).toBe(12);
    expect(r.title.line).toBe(3);
    // 凡例の箱 (x=12, y=143.1484, 188.5684x45.2188) を含む
    expect(contains(r.legend, 12, 143.1484, 188.5684, 45.2188)).toBe(true);
    // ヘッダは図の上端 (y≒5〜17)、フッタは下端 (y≒222〜234)
    expect(r.header.y).toBeLessThan(10);
    expect(r.footer.y).toBeGreaterThan(210);
  });
  test('モジュールが既に枠を置いた飾り (sequence の題名) には重ねて置かない', function() {
    var f = fixture('chrome-seq');
    OB.addRect(f.overlayEl, 6, 26, 174, 22, { 'data-type': 'title', 'data-id': '__title', 'data-line': '3' });
    OB.addDocumentChrome(f.svgEl, f.overlayEl, f.dsl);
    expect(f.overlayEl.querySelectorAll('rect[data-src-kind="title"]').length).toBe(0);
    expect(f.overlayEl.querySelectorAll('rect[data-src-kind]').length).toBe(4);
  });
  test('%page% / %lastpage% は描かれた数字に当たる', function() {
    var svgText = '<svg xmlns="http://www.w3.org/2000/svg"><g><text x="10" y="200" font-size="10" textLength="60">Page 1 of 1</text>' +
      '<g class="message"><text x="10" y="50" textLength="30">Page</text></g></g></svg>';
    var host = document.createElement('div');
    host.innerHTML = svgText;
    var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var n = OB.addDocumentChrome(host.querySelector('svg'), overlayEl, '@startuml\nfooter Page %page% of %lastpage%\nA -> B : Page\n@enduml');
    expect(n).toBe(1);
    var r = chromeRects(overlayEl).footer;
    expect(r.line).toBe(2);
    expect(r.y).toBeGreaterThan(180);   // メッセージの中の同じ語には当てない
  });
});

describe('addDocumentChrome: sequence (1.2026.3 の <g class="header"> …)', function() {
  test('同じ図を <g> で描く版でも、飾りごとに同じ行の枠が 1 つずつ出る', function() {
    var f = fixture('chrome-seq-g');
    var n = OB.addDocumentChrome(f.svgEl, f.overlayEl, f.dsl);
    var r = chromeRects(f.overlayEl);
    expect(n).toBe(5);
    expect([r.title.line, r.header.line, r.footer.line, r.caption.line, r.legend.line]).toEqual([3, 4, 5, 6, 12]);
  });
});

describe('addDocumentChrome: class (<g class="header"> … 、legend は行なし)', function() {
  test('header / footer / caption / legend の <g> に本文の行で枠を置く', function() {
    var f = fixture('chrome-class');
    OB.addDocumentChrome(f.svgEl, f.overlayEl, f.dsl);
    var r = chromeRects(f.overlayEl);
    expect(r.header.line).toBe(5);
    expect(r.footer.line).toBe(4);
    expect(r.caption.line).toBe(6);
    expect(r.legend.line).toBe(3);
    // 凡例の箱 (x=12.6519, y=253.7969, 52.041x27.6094)
    expect(contains(r.legend, 12.6519, 253.7969, 52.041, 27.6094)).toBe(true);
  });
  test('本文なしの呼び出し (図種のモジュール) は行のある <g> だけに枠を置き、本文ありの呼び出しは残りの legend だけを足す', function() {
    // BLK-migrator-20260925-0932: addUnclaimed / activity / state は同じ addDocumentChrome を本文なしで呼ぶ (当て方は 1 か所)。
    var f = fixture('chrome-class');
    expect(OB.addUnclaimed(f.svgEl, f.overlayEl, [], 'g.title')).toBe(4);   // title / header / footer / caption (legend は行なし)
    expect(Number(f.overlayEl.querySelector('rect[data-src-kind="header"]').getAttribute('data-line'))).toBe(5);
    expect(OB.addDocumentChrome(f.svgEl, f.overlayEl, f.dsl)).toBe(1);
    expect(f.overlayEl.querySelectorAll('rect[data-src-kind="title"]').length).toBe(1);
    expect(f.overlayEl.querySelector('rect[data-src-kind="legend"]').getAttribute('data-line')).toBe('3');
  });
  test('本文なしの呼び出しは @startuml の行 (startUmlLine) を足して本文の行にする', function() {
    var f = fixture('chrome-class');
    OB.addDocumentChrome(f.svgEl, f.overlayEl, null, { startUmlLine: 5 });
    expect(f.overlayEl.querySelector('rect[data-src-kind="title"]').getAttribute('data-line')).toBe('6');
    expect(f.overlayEl.querySelectorAll('rect[data-src-kind="legend"]').length).toBe(0);
  });
  test('飾りの無い図では何も置かない', function() {
    var f = fixture('chrome-class');
    expect(OB.addDocumentChrome(f.svgEl, f.overlayEl, '@startuml\nclass A\n@enduml')).toBe(0);
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
