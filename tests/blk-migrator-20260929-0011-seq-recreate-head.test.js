'use strict';
// BLK-migrator-20260929-0011: 同じ名前の参加者を create → destroy → create し直すと、PlantUML は同じ列の途中に
// 頭をもう一度描く。参加者を名前で 1 つに畳んでいたため 2 回目の頭 (箱・見出し文字) に枠が出なかった。
// 直し方: 描かれた頭ごとに枠を持ち、n 回目の頭を本文の n 回目の create の行に当てる (参加者は名前で 1 人のまま)。
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
var seq = window.MA.modules.plantumlSequence;
var overlay = window.MA.sequenceOverlay;
var OB = window.MA.overlayBuilder;

function load(name) {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/' + name + '.svg'), 'utf8');
  var dslText = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/' + name + '.puml'), 'utf8').replace(/\r\n/g, '\n');
  var div = document.createElement('div');
  div.innerHTML = svgText;
  return { svgEl: div.querySelector('svg'), parsed: seq.parseSequence(dslText), dsl: dslText };
}
function build(f) {
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  var res = overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl, f.dsl);
  return { overlayEl: overlayEl, res: res };
}
function rects(overlayEl, type, id) {
  var sel = 'rect[data-type="' + type + '"]' + (id ? '[data-id="' + id + '"]' : '');
  return Array.prototype.slice.call(overlayEl.querySelectorAll(sel));
}
function num(r, a) { return parseFloat(r.getAttribute(a)); }
function covers(r, x, y) {
  return x >= num(r, 'x') && x <= num(r, 'x') + num(r, 'width') && y >= num(r, 'y') && y <= num(r, 'y') + num(r, 'height');
}
// 点 (x, y) を覆う枠のうち最後に置かれた (= 手前の) もの
function topAt(overlayEl, x, y) {
  var all = Array.prototype.slice.call(overlayEl.querySelectorAll('rect[data-type]')).filter(function(r) {
    return !r.hasAttribute('data-front') && covers(r, x, y);
  });
  return all.length ? all[all.length - 1] : null;
}
function headRects(svgEl, label) {
  return Array.prototype.filter.call(svgEl.querySelectorAll('text'), function(t) { return t.textContent === label; })
    .map(function(t) { return { t: t, y: num(t, 'y'), x: num(t, 'x') }; })
    .sort(function(a, b) { return a.y - b.y; });
}

describe('BLK-migrator-20260929-0011: create の行を名前ごとに読む', function() {
  test('create → destroy → create し直すと、create の行が書かれた順に 2 つ残る', function() {
    var p = seq.parseSequence('@startuml\nparticipant Main\ncreate Worker\nMain -> Worker : run1\ndestroy Worker\ncreate Worker\nMain -> Worker : run2\ndestroy Worker\n@enduml');
    expect(p.meta.createLines.Worker).toEqual([3, 6]);
    expect(p.elements.filter(function(e) { return e.kind === 'participant' && e.id === 'Worker'; }).length).toBe(1);
  });
  test('`create X` の直後の `A -> X **` は同じ 1 回。`**` だけの生成も 1 回に数える', function() {
    var p = seq.parseSequence('@startuml\nparticipant A\ncreate X\nA -> X ** : new\ndestroy X\nA -> X ** : again\n@enduml');
    expect(p.meta.createLines.X).toEqual([3, 6]);
  });
  test('create の無い図は createLines を持たない', function() {
    var p = seq.parseSequence('@startuml\nA -> B : hi\n@enduml');
    expect(p.meta.createLines === undefined).toBe(true);
  });
});

describe('BLK-migrator-20260929-0011: 作り直した参加者の頭に枠が出る', function() {
  test('最小再現: 2 回目の Worker の箱・見出し文字を指すと 2 回目の create の行 (6) が選ばれ、1 回目・尻は今と同じ', function() {
    var f = load('seq-recreate-min');
    var b = build(f);
    var heads = headRects(f.svgEl, 'Worker');
    expect(heads.length).toBe(3); // 1 回目の頭・2 回目の頭・尻
    var first = topAt(b.overlayEl, heads[0].x + 5, heads[0].y - 5);
    var second = topAt(b.overlayEl, heads[1].x + 5, heads[1].y - 5);
    var tail = topAt(b.overlayEl, heads[2].x + 5, heads[2].y - 5);
    expect(first && first.getAttribute('data-type') + ':' + first.getAttribute('data-id')).toBe('participant:Worker');
    expect(second && second.getAttribute('data-type') + ':' + second.getAttribute('data-id') + '@' + second.getAttribute('data-line'))
      .toBe('participant:Worker@6');
    expect(tail && tail.getAttribute('data-type') + ':' + tail.getAttribute('data-id')).toBe('participant:Worker');
    expect(first.getAttribute('data-line')).toBe(tail.getAttribute('data-line'));
    // 2 回目の頭の箱の中央 (ライフラインの真上) も頭の枠
    var mid = topAt(b.overlayEl, heads[1].x + 22, heads[1].y - 8);
    expect(mid && mid.getAttribute('data-type') + '@' + mid.getAttribute('data-line')).toBe('participant@6');
    expect(b.res.unmatched.participant).toBe(0);
  });
  test('ライフラインの枠は作り直した頭の上で切れ、頭の上下の線はライフラインのまま', function() {
    var f = load('seq-recreate-32');
    var b = build(f);
    var lls = rects(b.overlayEl, 'lifeline', 'Worker').filter(function(r) { return !r.hasAttribute('data-front'); });
    expect(lls.length).toBe(2);
    var heads = headRects(f.svgEl, 'Worker');
    lls.forEach(function(l) { expect(covers(l, num(l, 'x') + 6, heads[1].y - 8)).toBe(false); });
    // 1 回目の頭と 2 回目の頭の間の線はライフライン
    var gapY = (heads[0].y + heads[1].y) / 2 + 4;
    expect(lls.some(function(l) { return covers(l, num(l, 'x') + 6, gapY); })).toBe(true);
  });
  test('seq-32 (実物): Worker の 2 回目の頭は 2 回目の create の行、Main・Logger・1 回目の Worker は今と同じ', function() {
    var f = load('seq-recreate-32');
    var b = build(f);
    var lines = f.dsl.split(String.fromCharCode(10));
    var secondCreate = lines.map(function(l, i) { return /^create Worker/.test(l) ? i + 1 : 0; }).filter(Boolean)[1];
    var heads = headRects(f.svgEl, 'Worker');
    expect(heads.length).toBe(3);
    var second = topAt(b.overlayEl, heads[1].x + 5, heads[1].y - 5);
    expect(second && second.getAttribute('data-type') + '@' + second.getAttribute('data-line')).toBe('participant@' + secondCreate);
    var first = topAt(b.overlayEl, heads[0].x + 5, heads[0].y - 5);
    expect(first && first.getAttribute('data-type') + ':' + first.getAttribute('data-id')).toBe('participant:Worker');
    expect(first.getAttribute('data-line')).not.toBe(String(secondCreate));
    // destroy で線が途中で終わった Worker の尻 (図の下端の段) にも Worker の枠 (行は 1 回目の頭と同じ)
    var tail = topAt(b.overlayEl, heads[2].x + 5, heads[2].y - 5);
    expect(tail && tail.getAttribute('data-type') + ':' + tail.getAttribute('data-id') + '@' + tail.getAttribute('data-line'))
      .toBe('participant:Worker@' + first.getAttribute('data-line'));
    ['Main', 'Logger'].forEach(function(n) {
      headRects(f.svgEl, n).forEach(function(h) {
        var r = topAt(b.overlayEl, h.x + 3, h.y - 5);
        if (!r || r.getAttribute('data-type') !== 'participant') return; // メッセージの文字の同じ語は除く
        expect(r.getAttribute('data-id')).toBe(n);
      });
    });
    expect(rects(b.overlayEl, 'participant', 'Logger').length).toBeGreaterThan(0);
    expect(b.res.unmatched.participant).toBe(0);
  });
});
