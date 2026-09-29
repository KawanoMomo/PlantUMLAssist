'use strict';
// BLK-migrator-20260929-1858: `skinparam roundCorner` を付けると note の紙と折り返しが円弧 (A) を含む path で描かれ、
// 折り返しを「頂点がちょうど 4 つ」で見分けていた notePapers が紙を 1 枚も見つけなかった。紙が無いと sequence は
// 本文 1 行目の文字で探すが、Creole の見出し印 (`== 見出し ==`) を落とさないので文字が一致せず、note は枠 0 だった。
// 直し方: 折り返しは描いた形 (外接矩形の左上から下へ降り、右下を通って左上へ戻る直角三角形。角の丸みは問わない) で
// 見分ける (全図種共通の 1 か所)。noteLineKey は Creole の見出し印も落とす。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

if (!global.window || !global.window.document) {
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>',
    { url: 'http://localhost/' });
  var prevMA = global.window && global.window.MA;
  global.window = dom.window;
  if (prevMA) global.window.MA = prevMA;
  global.DOMParser = dom.window.DOMParser;
}
if (!global.document) global.document = global.window.document;
var document = global.window.document;

[
  'html-utils', 'dsl-utils', 'note-edit', 'regex-parts', 'id-normalizer',
  'dsl-updater', 'text-updater', 'parser-utils', 'line-resolver',
  'overlay-builder', 'selection-router', 'sequence-participant-zone',
  'sequence-autonumber', 'sequence-activation-insert',
].forEach(function(m) {
  try { delete require.cache[require.resolve('../src/core/' + m + '.js')]; } catch (e) {}
  try { require('../src/core/' + m + '.js'); } catch (e) {}
});
try { delete require.cache[require.resolve('../src/modules/sequence.js')]; } catch (e) {}
require('../src/modules/sequence.js');
try { delete require.cache[require.resolve('../src/ui/sequence-overlay.js')]; } catch (e) {}
require('../src/ui/sequence-overlay.js');

var window = global.window;
var OB = window.MA.overlayBuilder;
var seq = window.MA.modules.plantumlSequence;
var overlay = window.MA.sequenceOverlay;

function svgOf(name) {
  var div = document.createElement('div');
  div.innerHTML = fs.readFileSync(path.join(__dirname, 'fixtures/svg/' + name + '.svg'), 'utf8');
  return div.querySelector('svg');
}
function dslOf(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures/dsl/' + name + '.puml'), 'utf8').split(String.fromCharCode(13)).join('');
}
function num(r, a) { return parseFloat(r.getAttribute(a)); }
function covers(r, x, y) {
  return x >= num(r, 'x') && x <= num(r, 'x') + num(r, 'width') && y >= num(r, 'y') && y <= num(r, 'y') + num(r, 'height');
}
function hitAt(o, x, y) {
  var all = Array.prototype.slice.call(o.querySelectorAll('rect[data-type]')).filter(function(r) {
    return !r.hasAttribute('data-front') && covers(r, x, y);
  });
  var r = all.length ? all[all.length - 1] : null;
  return r ? r.getAttribute('data-type') + '@' + r.getAttribute('data-line') : 'none';
}
function textPoint(svgEl, s) {
  var t = Array.prototype.filter.call(svgEl.querySelectorAll('text'), function(e) { return e.textContent === s; })[0];
  if (!t) throw new Error('text not drawn: ' + s);
  return { x: num(t, 'x') + 3, y: num(t, 'y') - 4 };
}

describe('BLK-migrator-20260929-1858: roundCorner の note も紙として拾う (全図種共通)', function() {
  // PlantUML 1.2026.8 が `skinparam roundCorner 8` の note に出す形 (fixtures は同梱 jar の出力そのもの)。
  [
    ['note-roundcorner-seq', 60, 128],
    ['note-roundcorner-class', 98, 166],
    ['note-roundcorner-act', 80, 147],
    ['note-roundcorner-comp', 92, 160],
    ['note-roundcorner-state', 92, 160],
    ['note-roundcorner-uc', 77, 145],
  ].forEach(function(c) {
    test(c[0] + ': 円弧を含む紙と折り返しの組を紙 1 枚として拾い、紙の左右は描いた紙の縁', function() {
      var ps = OB.notePapers(svgOf(c[0]));
      expect(ps.length).toBe(1);
      expect(Math.round(ps[0].body.x)).toBe(c[1]);
      expect(Math.round(ps[0].body.x + ps[0].body.width)).toBe(c[2]);
    });
  });

  test('折り返しの見分けは形で行う: 角の丸い折り返し・直角の折り返しは紙、右上の欠けた三角・四角・矢じりは紙にしない', function() {
    var div = document.createElement('div');
    div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">' +
      // 角の丸い紙 + 角の丸い折り返し
      '<path d="M10,14 L10,50 A4,4 0 0 0 14,54 L70,54 A4,4 0 0 0 74,50 L74,20 L64,10 L14,10 A4,4 0 0 0 10,14" fill="#FEFFDD"/>' +
      '<path d="M64,10 L64,18 A2,2 0 0 0 66,20 L74,20 L64,10" fill="#FEFFDD"/>' +
      // 曲線 (C) で丸めた折り返し
      '<path d="M110,10 L110,50 L174,50 L174,20 L164,10 L110,10" fill="#FEFFDD"/>' +
      '<path d="M164,10 L164,18 C164,19 165,20 166,20 L174,20 L164,10" fill="#FEFFDD"/>' +
      // 右上に直角のある三角 (折り返しではない)
      '<path d="M200,0 L210,0 L210,10 L200,0" fill="#000"/>' +
      '<path d="M300,0 L310,0 L310,10 L300,10 Z" fill="#000"/>' +
      '<polygon points="1,1,9,5,1,9,4,5" fill="#000"/>' +
      '</svg>';
    var ps = OB.notePapers(div.querySelector('svg'));
    expect(ps.map(function(p) { return Math.round(p.body.x) + '-' + Math.round(p.body.x + p.body.width); })).toEqual(['10-74', '110-174']);
  });

  test('noteLineKey: Creole の見出し印 (= / == / === / ====、閉じの印は有っても無くても) を落とす', function() {
    expect(OB.noteLineKey('  == 見出し ==')).toBe('見出し');
    expect(OB.noteLineKey('= 大見出し')).toBe('大見出し');
    expect(OB.noteLineKey('=== 中 ===')).toBe('中');
    expect(OB.noteLineKey('==== 小')).toBe('小');
    expect(OB.noteLineKey('a == b')).toBe('a == b');
    expect(OB.noteLineKey('|= Item |= Status |')).toBe('Item Status');
  });
});

describe('BLK-migrator-20260929-1858: sequence の roundCorner + 見出しの note に枠が出て、押すと note の行', function() {
  test('最小再現: 見出し・本文の文字と紙の左右の縁のどこでも note@6、y のメッセージは note を覆わない', function() {
    var svgEl = svgOf('note-roundcorner-seq');
    var dsl = dslOf('note-roundcorner-seq');
    var o = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.buildSequenceOverlay(svgEl, seq.parseSequence(dsl), o, dsl);
    var h = textPoint(svgEl, '見出し'), b = textPoint(svgEl, '一致');
    expect(hitAt(o, h.x, h.y)).toBe('note@6');
    expect(hitAt(o, b.x, b.y)).toBe('note@6');
    var p = OB.notePapers(svgEl)[0];
    expect(hitAt(o, p.body.x + 2, p.body.y + p.body.height / 2)).toBe('note@6');
    expect(hitAt(o, p.body.x + p.body.width - 2, p.body.y + p.body.height / 2)).toBe('note@6');
    // y の文字の上は y のメッセージ (10 行目)
    var y = textPoint(svgEl, 'y');
    expect(hitAt(o, y.x, y.y)).toBe('message@10');
  });
});
