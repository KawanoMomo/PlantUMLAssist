'use strict';
// BLK-migrator-20260929-0952: アクティビティ図の 2 つ目以降の partition・入れ子の外側の partition の見出し (名前の文字) と
// 左辺にホバーしても枠が出なかった。PlantUML 1.2026.8 は partition を塗りの無い (色付きなら塗った) <rect> と左上の札の <path>・
// 見出しの <text> で描く。partition を本文から読み (名前・開きの行・閉じの行・入れ子)、見出しの文字を名前で照らして枠を決める。
// 見出し・4 辺のどこを押しても同じ partition (開きの行)。中の空所は partition、中の動作・矢印は本人。
// fixtures/svg/blk-migrator-0952-*.svg は同名の dsl を PlantUML 1.2026.8 で描いたもの。
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
  var dsl = fs.readFileSync(path.join(FIX, 'dsl', 'blk-migrator-0952-' + name + '.puml'), 'utf8').replace(/\r\n/g, '\n');
  var div = document.createElement('div');
  div.innerHTML = fs.readFileSync(path.join(FIX, 'svg', 'blk-migrator-0952-' + name + '.svg'), 'utf8');
  var svg = div.querySelector('svg');
  var overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ACT.buildOverlay(svg, ACT.parse(dsl), overlay);
  return { dsl: dsl, svg: svg, overlay: overlay };
}
function num(el, a) { return parseFloat(el.getAttribute(a)); }
// 点を覆う枠のうち、いちばん手前 (document の後ろ) のもの
function topAt(overlay, x, y) {
  var hit = null;
  Array.prototype.forEach.call(overlay.querySelectorAll('rect.selectable[data-type]'), function(r) {
    if (x >= num(r, 'x') && x <= num(r, 'x') + num(r, 'width') && y >= num(r, 'y') && y <= num(r, 'y') + num(r, 'height')) hit = r;
  });
  return hit ? hit.getAttribute('data-type') + '@' + hit.getAttribute('data-line') : '-';
}
// 描いた partition: 札の <path> の直前の <rect> と、札の後の見出しの <text>
function drawn(svg) {
  var out = [];
  Array.prototype.forEach.call(svg.querySelectorAll('rect'), function(r) {
    var p = r.nextElementSibling;
    if (!p || p.tagName.toLowerCase() !== 'path' || !/stroke-width:1\.5/.test(p.getAttribute('style') || '')) return;
    var t = p.nextElementSibling;
    out.push({ name: t.textContent, x: num(r, 'x'), y: num(r, 'y'), w: num(r, 'width'), h: num(r, 'height'),
      tx: num(t, 'x') + 3, ty: num(t, 'y') - 5 });
  });
  return out;
}
function probe(o, part) {
  return {
    heading: topAt(o.overlay, part.tx, part.ty),
    top: topAt(o.overlay, part.x + part.w / 2, part.y),
    bottom: topAt(o.overlay, part.x + part.w / 2, part.y + part.h),
    left: topAt(o.overlay, part.x, part.y + part.h / 2),
    right: topAt(o.overlay, part.x + part.w, part.y + part.h / 2),
  };
}
function all(line) {
  var v = 'source-line@' + line;
  return { heading: v, top: v, bottom: v, left: v, right: v };
}

describe('activity の partition の見出し・枠線・中の空所', function() {
  test('readPartitions: 名前・開きの行・閉じの行・入れ子。skinparam の { } は数えない', function() {
    var ps = ACT.readPartitions(load('names').dsl.split('\n'));
    expect(ps.map(function(p) { return [p.name, p.line, p.endLine, p.depth]; })).toEqual([['製造 工程', 6, 8, 0], ['B', 9, 11, 0], ['検査', 12, 14, 0]]);
    var nested = ACT.readPartitions(load('nested').dsl.split('\n'));
    expect(nested.map(function(p) { return [p.name, p.line, p.endLine, p.depth]; })).toEqual([['A', 3, 9, 0], ['C', 5, 7, 1]]);
    var styled = ACT.readPartitions(['@startuml', '<style>', 'activityDiagram {', '  partition {', '  }', '}', '</style>',
      'partition "X" <<s>> #red {', ':a;', '}', '@enduml']);
    expect(styled.map(function(p) { return [p.name, p.line, p.endLine]; })).toEqual([['X', 8, 10]]);
  });

  test('2 つの partition: 見出し・4 辺の中点で本人の枠、押すと 3 行目 / 7 行目', function() {
    var o = load('two');
    var ps = drawn(o.svg);
    expect(ps.length).toBe(2);
    expect(probe(o, ps[0])).toEqual(all(3));
    expect(probe(o, ps[1])).toEqual(all(7));
    // 中の空所は partition、中の動作と矢印は本人 (partition A と同じ文字の動作 a も partition の箱に取られない)
    expect(topAt(o.overlay, ps[0].x + 4, ps[0].y + ps[0].h / 2)).toBe('source-line@3');
    expect(o.overlay.querySelectorAll('rect[data-type="action"]').length).toBe(3);
    var a = o.overlay.querySelector('rect[data-type="action"][data-line="4"]');
    expect(num(a, 'y') > ps[0].y + 20).toBeTruthy();
    expect(topAt(o.overlay, num(a, 'x') + num(a, 'width') / 2, num(a, 'y') + num(a, 'height') / 2)).toBe('action@4');
    // 枠の data-id は開きの行ごとに 1 つ (見出し・4 辺・中が一緒に光る)
    var ids = {};
    Array.prototype.forEach.call(o.overlay.querySelectorAll('rect[data-src-kind="partition"]'), function(r) {
      ids[r.getAttribute('data-id')] = (ids[r.getAttribute('data-id')] || 0) + 1;
    });
    expect(ids).toEqual({ 'src:partition@3': 6, 'src:partition@7': 6 });
  });

  test('入れ子: 外側 A・内側 C とも見出し・4 辺で本人の枠。内側の中は C、外側だけの所は A', function() {
    var o = load('nested');
    var ps = drawn(o.svg);
    expect(ps.map(function(p) { return p.name; })).toEqual(['A', 'C']);
    expect(probe(o, ps[0])).toEqual(all(3));
    expect(probe(o, ps[1])).toEqual(all(5));
    expect(topAt(o.overlay, ps[1].x + 4, ps[1].y + ps[1].h - 8)).toBe('source-line@5');
    expect(topAt(o.overlay, ps[0].x + 4, ps[0].y + ps[0].h - 8)).toBe('source-line@3');
    expect(topAt(o.overlay, ps[1].x + ps[1].w / 2, ps[1].y + 55)).toBe('action@6');
  });

  test('クォート・色付き・日本語の名前でも、見出し・4 辺で本人の枠', function() {
    var o = load('names');
    var ps = drawn(o.svg);
    expect(ps.length).toBe(3);
    expect(probe(o, ps[0])).toEqual(all(6));
    expect(probe(o, ps[1])).toEqual(all(9));
    expect(probe(o, ps[2])).toEqual(all(12));
  });

  test('実物 activity-14: 最後の partition 検査の見出し・左辺に枠。入れ子のノートの枠は紙で、partition の箱ではない', function() {
    var o = load('corpus14');
    var ps = drawn(o.svg);
    expect(ps.map(function(p) { return p.name; })).toEqual(['製造工程', '加工', '検査']);
    expect(probe(o, ps[0])).toEqual(all(4));
    expect(probe(o, ps[1])).toEqual(all(6));
    expect(probe(o, ps[2])).toEqual(all(18));
    Array.prototype.forEach.call(o.overlay.querySelectorAll('rect[data-type="note"]'), function(r) {
      expect(num(r, 'width') < 200).toBeTruthy();
    });
    // 動作は 5 つとも本人の枠
    expect(o.overlay.querySelectorAll('rect[data-type="action"]').length).toBe(5);
  });

});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
