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
    // 足した枝は空のまま end split の直前に入る (BLK-owner-20260927-0745-1: `:;` を書かない)
    expect(out[out.indexOf('end split') - 1].trim()).toBe('split again');
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

// 追記 (migrator run=20260929-2351): repeat 行に処理を書いた `repeat :検証;` の箱・文字・出入りの矢印と、
// 色付きレーン `|#LightGray|B|` へ移る矢印の縦 5px の区間に枠が出なかった。
// 矢印の線 (太さ 1 の <line>) の中点と矢じりの中心に、どれか 1 つ枠が出ること
function flowGaps(f) {
  var gaps = [];
  Array.prototype.forEach.call(f.svg.querySelectorAll('line'), function(l) {
    if (!/stroke-width:1;/.test(l.getAttribute('style') || '')) return;
    var x = (num(l, 'x1') + num(l, 'x2')) / 2, y = (num(l, 'y1') + num(l, 'y2')) / 2;
    if (Math.abs(num(l, 'x1') - num(l, 'x2')) + Math.abs(num(l, 'y1') - num(l, 'y2')) < 0.5) return;
    if (!topAt(f.overlay, x, y)) gaps.push('line@' + Math.round(x) + ',' + Math.round(y));
  });
  Array.prototype.forEach.call(f.svg.querySelectorAll('polygon'), function(p) {
    var pts = (p.getAttribute('points') || '').split(',').map(parseFloat);
    if (pts.length !== 8) return;
    var x = (pts[0] + pts[2] + pts[4] + pts[6]) / 4, y = (pts[1] + pts[3] + pts[5] + pts[7]) / 4;
    if (!topAt(f.overlay, x, y)) gaps.push('head@' + Math.round(x) + ',' + Math.round(y));
  });
  return gaps;
}
function textAt(f, s) {
  var t = Array.prototype.find.call(f.svg.querySelectorAll('text'), function(n) { return n.textContent.trim() === s; });
  var x = num(t, 'x') + (num(t, 'textLength') || 6) / 2, y = num(t, 'y') - 4;
  var r = topAt(f.overlay, x, y);
  return r ? r.getAttribute('data-type') + ':' + r.getAttribute('data-line') : null;
}

describe('repeat 行に処理を書いた repeat (`repeat :検証;`)', function() {
  test('入口の処理を持つ repeat として読み、中の処理は repeat の中', function() {
    var p = ACT.parse(load('repeat-label').dsl);
    expect(p.nodes.map(function(n) { return n.kind; })).toEqual(['start', 'repeat', 'stop']);
    expect(p.nodes[1].startAction).toBe('検証');
    expect(p.nodes[1].line).toBe(3);
    expect(p.nodes[1].endLine).toBe(5);
    expect(p.nodes[1].body[0].text).toBe('ログ出力');
  });

  test('入口の箱と文字は repeat の行 (3 行目)、矢印の線・矢じりに枠が出る', function() {
    var f = load('repeat-label');
    expect(textAt(f, '検証')).toBe('source-line:3');
    expect(textAt(f, 'ログ出力')).toBe('action:4');
    expect(flowGaps(f)).toEqual([]);
    // 箱そのもの (rect) を指しても同じ枠
    var box = Array.prototype.find.call(f.svg.querySelectorAll('rect'), function(r) {
      return num(r, 'y') < 60 && num(r, 'height') > 20;
    });
    var r = topAt(f.overlay, num(box, 'x') + 3, num(box, 'y') + 3);
    expect(r.getAttribute('data-line')).toBe('3');
  });

  test('`endwhile (なし)` と `repeat while (…) is (…) not (…)` も入れ物の閉じとして読み、実物の図 (activity-25) の全点に枠が出る', function() {
    var f = load('repeat-full');
    var p = ACT.parse(f.dsl);
    var w = p.nodes.filter(function(n) { return n.kind === 'while'; })[0];
    expect(w.line).toBe(4);
    expect(w.endLine).toBe(10);
    var rep = w.body.filter(function(n) { return n.kind === 'repeat'; })[0];
    expect(rep.line).toBe(6);
    expect(rep.endLine).toBe(9);
    expect(rep.startAction).toBe('検証');
    expect(rep.notLabel).toBe('成功');
    // 後ろの処理は while の外
    expect(p.nodes.map(function(n) { return n.kind; })).toEqual(['start', 'action', 'while', 'action', 'stop']);
    expect(textAt(f, '検証')).toBe('source-line:6');
    expect(flowGaps(f)).toEqual([]);
  });

  test('repeat while を右パネルで書き直しても not (…) は残る', function() {
    expect(ACT.fmtRepeatWhile('エラー?', '再試行', '成功')).toBe('repeat while (エラー?) is (再試行) not (成功)');
    expect(ACT.fmtRepeatWhile('c', 'yes')).toBe('repeat while (c) is (yes)');
  });
});

describe('色付きレーン `|#LightGray|B|` へ移る矢印', function() {
  test('レーンの背景は動作の箱と見なさず、矢印の全区間 (縦 5px を含む) に枠が出る', function() {
    var f = load('lane-color');
    expect(flowGaps(f)).toEqual([]);
    expect(textAt(f, 'a')).toBe('action:4');
    expect(textAt(f, 'x')).toBe('action:6');
    // 背景 (#D3D3D3 の縦長の rect) の空所は動作の枠にならない
    var bg = Array.prototype.find.call(f.svg.querySelectorAll('rect'), function(r) { return r.getAttribute('fill') === '#D3D3D3'; });
    var r = topAt(f.overlay, num(bg, 'x') + num(bg, 'width') / 2, num(bg, 'y') + 60);
    expect(r ? r.getAttribute('data-type') : null).not.toBe('action');
    // レーン A から B へ移る矢印は 1 本 (同じ行) として光る
    var segs = Array.prototype.filter.call(f.overlay.querySelectorAll('rect[data-type="flow"]'), function(x) {
      return num(x, 'y') > 110 && num(x, 'y') < 130;
    }).map(function(x) { return x.getAttribute('data-id'); });
    expect(segs.length).toBeGreaterThan(1);
    expect(segs.every(function(id) { return id === segs[0]; })).toBe(true);
  });

  test('<style> の背景・色付きレーン 3 本・SDL の形 (<<input>>) の図 (activity-16) でも、矢印・分岐・終了に本人の枠が出る', function() {
    var f = load('lane-style');
    var p = ACT.parse(f.dsl);
    // `:内容を確認; <<input>>` は 1 行で閉じた動作 (後ろの if を呑まない)
    expect(p.nodes.map(function(n) { return n.kind + ':' + n.line; })).toEqual(['start:11', 'action:12', 'action:14', 'if:15', 'stop:22']);
    expect(p.nodes[2].stereotype).toBe('<<input>>');
    expect(flowGaps(f)).toEqual([]);
    expect(textAt(f, '承認?')).toBe('decision:15');
    expect(textAt(f, '内容を確認')).toBe('action:14');
    expect(textAt(f, '支払処理')).toBe('action:17');
    expect(textAt(f, '差し戻し内容を確認')).toBe('action:20');
    var stop = Array.prototype.filter.call(f.svg.querySelectorAll('ellipse'), function(e) { return num(e, 'rx') === 11; })[0];
    expect(topAt(f.overlay, num(stop, 'cx'), num(stop, 'cy')).getAttribute('data-line')).toBe('22');
    // 図全体の背景・レーンの背景は動作の枠にならない
    expect(topAt(f.overlay, 2, 2)).toBeNull();
  });

  test('動作の文言を直しても、後ろの SDL の形 (<<input>>) は残る', function() {
    var dsl = ['@startuml', ':内容を確認; <<input>>', '@enduml'].join('\n');
    expect(ACT.updateAction(dsl, 2, 2, '内容を点検')).toBe(['@startuml', ':内容を点検; <<input>>', '@enduml'].join('\n'));
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
