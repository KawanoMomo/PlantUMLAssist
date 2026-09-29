'use strict';
// BLK-migrator-20260929-0951: アクティビティ図の split / end split の横棒 (分岐・合流の線) にホバーしても枠が出なかった。
// PlantUML 1.2026.8 は fork の棒を塗った細い <rect> で描くが、split の棒は横の <line> (stroke-width 1.5) で描く。
// 棒は「上下から矢印がつながる横の区間」として描いた側から拾い、本文の split / split again / end split を fork と
// 同じ入れ物として読む。上の棒は split の行、下の棒は end split の行を指す。
// fixtures/svg/blk-migrator-0951-*.svg は同名の dsl を PlantUML 1.2026.8 で描いたもの。
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

function load(name) {
  var dsl = fs.readFileSync(path.join(FIX, 'dsl', 'blk-migrator-0951-' + name + '.puml'), 'utf8').replace(/\r\n/g, '\n');
  var div = document.createElement('div');
  div.innerHTML = fs.readFileSync(path.join(FIX, 'svg', 'blk-migrator-0951-' + name + '.svg'), 'utf8');
  var svg = div.querySelector('svg');
  var overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ACT.buildOverlay(svg, ACT.parse(dsl), overlay);
  return { dsl: dsl, lines: dsl.split('\n'), svg: svg, overlay: overlay };
}
function num(el, a) { return parseFloat(el.getAttribute(a)); }
// 点を覆う枠のうち、いちばん手前 (document の後ろ) のもの
function topAt(overlay, x, y) {
  var hit = null;
  Array.prototype.forEach.call(overlay.querySelectorAll('rect.selectable[data-type]'), function(r) {
    if (r.style && r.style.pointerEvents === 'none') return;
    if (x >= num(r, 'x') && x <= num(r, 'x') + num(r, 'width') && y >= num(r, 'y') && y <= num(r, 'y') + num(r, 'height')) hit = r;
  });
  return hit;
}
// 描かれた棒: split の横線 (太さ 1.5) と fork の細い rect。上から順に
function drawnBars(svg) {
  var out = [];
  Array.prototype.forEach.call(svg.querySelectorAll('line'), function(l) {
    if (num(l, 'y1') !== num(l, 'y2')) return;
    if (!/stroke-width:1\.5/.test(l.getAttribute('style') || '')) return;
    var x1 = Math.min(num(l, 'x1'), num(l, 'x2')), x2 = Math.max(num(l, 'x1'), num(l, 'x2'));
    out.push({ kind: 'line', x1: x1, x2: x2, y: num(l, 'y1') });
  });
  Array.prototype.forEach.call(svg.querySelectorAll('rect'), function(r) {
    var h = num(r, 'height');
    if (!(h > 0 && h < 12)) return;
    out.push({ kind: 'rect', x1: num(r, 'x'), x2: num(r, 'x') + num(r, 'width'), y: num(r, 'y') + h / 2 });
  });
  return out.sort(function(a, b) { return a.y - b.y || a.x1 - b.x1; });
}
// 棒の左端・中央・右端 (端は 2px 内側) の枠の行
function barLines(overlay, bar) {
  return [bar.x1 + 2, (bar.x1 + bar.x2) / 2, bar.x2 - 2].map(function(x) {
    var r = topAt(overlay, x, bar.y);
    return r ? r.getAttribute('data-line') : null;
  });
}

describe('split を fork と同じ入れ物として読む', function() {
  test('split / split again / end split は枝 2 本の入れ物になり、後ろの stop は外に出る', function() {
    var p = ACT.parse(load('split').dsl);
    var kinds = p.nodes.map(function(n) { return n.kind; });
    expect(kinds).toEqual(['start', 'fork', 'stop']);
    var f = p.nodes[1];
    expect(f.keyword).toBe('split');
    expect(f.line).toBe(3);
    expect(f.endLine).toBe(7);
    expect(f.branches.length).toBe(2);
    expect(f.branches[0].body[0].text).toBe('a');
    expect(f.branches[1].body[0].text).toBe('b');
  });

  test('fork は keyword fork のまま。end merge でも閉じる', function() {
    var p = ACT.parse(['@startuml', 'fork', ':a;', 'fork again', ':b;', 'end merge', ':c;', '@enduml'].join('\n'));
    expect(p.nodes.map(function(n) { return n.kind; })).toEqual(['fork', 'action']);
    expect(p.nodes[0].keyword).toBe('fork');
    expect(p.nodes[0].endLine).toBe(6);
  });

  test('枝を足すと split の入れ物には split again を書く (fork には fork again)', function() {
    var dsl = load('split').dsl;
    var out = ACT.addForkBranch(dsl, 3).split('\n');
    expect(out.indexOf('split again', 5)).toBeGreaterThan(-1);
    expect(out.filter(function(l) { return l.trim() === 'fork again'; }).length).toBe(0);
    expect(out[out.indexOf('end split') - 2].trim()).toBe('split again');
  });

  test('split again の枝を消すと end split の手前までが消える', function() {
    var out = ACT.deleteBranchAt(load('split3').dsl, 7);
    expect(out).toBe(['@startuml', 'start', 'split', '  :a;', 'split again', '  :b;', 'end split', 'stop', '@enduml', ''].join('\n'));
  });
});

describe('split の棒 (横線) に枠が出る (PlantUML 1.2026.8)', function() {
  test('枝 2 本: 上の棒の左端・中央・右端は 3 行目、下の棒は 7 行目', function() {
    var f = load('split');
    var bars = drawnBars(f.svg);
    expect(bars.length).toBe(2);
    expect(barLines(f.overlay, bars[0])).toEqual(['3', '3', '3']);
    expect(barLines(f.overlay, bars[1])).toEqual(['7', '7', '7']);
    expect(topAt(f.overlay, (bars[0].x1 + bars[0].x2) / 2, bars[0].y).getAttribute('data-type')).toBe('fork');
  });

  test('枝 3 本でも同じ (下の棒は end split の 9 行目)', function() {
    var f = load('split3');
    var bars = drawnBars(f.svg);
    expect(bars.length).toBe(2);
    expect(barLines(f.overlay, bars[0])).toEqual(['3', '3', '3']);
    expect(barLines(f.overlay, bars[1])).toEqual(['9', '9', '9']);
  });

  test('入れ子の split: 外は 3 / 11 行目、内は 4 / 8 行目', function() {
    var f = load('splitnest');
    var bars = drawnBars(f.svg);
    expect(bars.length).toBe(4);
    var got = bars.map(function(b) { return barLines(f.overlay, b)[1]; });
    expect(got).toEqual(['3', '4', '8', '11']);
  });

  test('detach で終わる枝があっても、上の棒は 3 行目・下の棒は 10 行目', function() {
    var f = load('splitdetach');
    var bars = drawnBars(f.svg);
    expect(bars.length).toBe(2);
    expect(barLines(f.overlay, bars[0])).toEqual(['3', '3', '3']);
    expect(barLines(f.overlay, bars[1])).toEqual(['10', '10', '10']);
  });

  test('split・fork・split が続いても、それぞれの開きと閉じの行を指す (前の合流の棒を次の開きが取らない)', function() {
    var f = load('seq');
    var bars = drawnBars(f.svg);
    expect(bars.length).toBe(6);
    var got = bars.map(function(b) { return b.kind + ':' + barLines(f.overlay, b)[0]; });
    expect(got).toEqual(['line:3', 'line:7', 'rect:8', 'rect:12', 'line:13', 'line:17']);
  });

  test('矢印の横の区間 (太さ 1) は棒にしない', function() {
    var f = load('split');
    var n = f.overlay.querySelectorAll('rect.selectable[data-type="fork"]').length;
    expect(n).toBe(1);
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
