'use strict';
// BLK-builder-20260925-0314-1: sequence 図の参加者の枠を、DSL の名前と SVG の名前の完全一致で当てていたため、
// PlantUML が描いた頭・尻・帯と名前が合わない図で枠が落ち「⚠ Overlay マッチング失敗」が出ていた
// (migrator の progress.md で 4 枚: seq-11 / seq-12 / dirty-01 / sequence-with-teoz)。
//   - 日本語の名前: PlantUML は data-qualified-name の ASCII 以外の文字を `.` に伏せる (`センサ制御` → `.....`)
//   - `create` した参加者: 頭が g.participant-head に入らず、裸の <rect> で途中に描かれる
//   - 帯の <title> は表示名 (`Session Manager`) で、DSL の帯は別名 (`SM`) で持つ
//   - teoz (`& B -> C`): class の無い SVG。並んだ矢印の文字とライフラインを拾えなかった
// 直し方: 名前を PlantUML と同じ伏せ方で比べ、頭・尻・帯・ライフラインは SVG に描かれた物から当てる。
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

describe('BLK-builder-20260925-0314-1: 名前の伏せ字 (qualifiedNameKey / matchByEntityName)', function() {
  test('ASCII 以外の文字は 1 文字 (サロゲート対も 1 文字) ずつ `.` になる', function() {
    expect(OB.qualifiedNameKey('センサ制御')).toBe('.....');
    expect(OB.qualifiedNameKey('A太郎b')).toBe('A..b');
    expect(OB.qualifiedNameKey('𠮷野家')).toBe('...');
    expect(OB.qualifiedNameKey('App')).toBe('App');
  });
  test('伏せた名前が重なるときは文書の順と参加者の順で 1 つずつ組にする', function() {
    var div = document.createElement('div');
    div.innerHTML = '<svg><g class="h" data-qualified-name="App"></g><g class="h" data-qualified-name=".."></g>' +
      '<g class="h" data-qualified-name=".."></g></svg>';
    var svg = div.querySelector('svg');
    var gs = svg.querySelectorAll('g');
    var m = OB.matchByEntityName(svg, [{ id: '太郎' }, { id: 'App' }, { id: '別名' }], 'g.h');
    expect(m.length).toBe(3);
    expect(m[0].groupEl).toBe(gs[1]);
    expect(m[1].groupEl).toBe(gs[0]);
    expect(m[2].groupEl).toBe(gs[2]);
  });
  test('ASCII だけの名前は伏せ字の要素に当てない', function() {
    var div = document.createElement('div');
    div.innerHTML = '<svg><g class="h" data-qualified-name="..."></g></svg>';
    expect(OB.matchByEntityName(div.querySelector('svg'), [{ id: 'abc' }], 'g.h').length).toBe(0);
  });
});

describe('BLK-builder-20260925-0314-1: 日本語の名前の参加者 (dirty-01)', function() {
  test('日本語の名前を使うメッセージも読む (4 本)', function() {
    var f = load('seq-names-japanese');
    expect(f.parsed.relations.length).toBe(4);
    expect(f.parsed.relations[0].to).toBe('センサ制御');
  });
  test('センサ制御 の頭・尻・ライフラインに枠が出て、マッチング失敗にならない', function() {
    var f = load('seq-names-japanese');
    var b = build(f);
    expect(rects(b.overlayEl, 'participant', 'センサ制御').length).toBe(2);
    expect(rects(b.overlayEl, 'lifeline', 'センサ制御').length).toBeGreaterThan(0);
    expect(b.res.unmatched.participant).toBe(0);
    expect(b.res.unmatched.message).toBe(0);
    expect(rects(b.overlayEl, 'message').length).toBe(4);
  });
});

describe('BLK-builder-20260925-0314-1: create した参加者 (seq-12 / seq-11)', function() {
  test('create participant の頭 (裸の rect) に枠が出る', function() {
    var f = load('seq-names-create');
    var b = build(f);
    var inst = rects(b.overlayEl, 'participant', 'Inst');
    expect(inst.length).toBe(2);   // 途中の頭 + 尻
    var headRect = Array.prototype.find.call(f.svgEl.querySelectorAll('rect'), function(r) {
      return !r.closest('g.participant-tail') && Math.abs(num(r, 'width') - 66.9238) < 0.01;
    });
    var cx = num(headRect, 'x') + num(headRect, 'width') / 2, cy = num(headRect, 'y') + num(headRect, 'height') / 2;
    expect(inst.some(function(r) { return covers(r, cx, cy); })).toBe(true);
    expect(b.res.unmatched.participant).toBe(0);
  });
  test('`create participant "…" as X` は宣言の行として読み、書き換えても `create` は残る', function() {
    var f = load('seq-names-create');
    var inst = f.parsed.elements.filter(function(e) { return e.kind === 'participant' && e.id === 'Inst'; })[0];
    expect(inst.line).toBe(5);
    expect(inst.label).toBe('Instance');
    expect(inst.created).toBe(true);
    expect(f.parsed.elements.some(function(e) { return e.kind === 'participant' && e.id === 'participant'; })).toBe(false);
    var out = seq.updateParticipant(f.dsl, 5, 'label', 'Worker');
    expect(out.split(String.fromCharCode(10))[4]).toBe('create participant "Worker" as Inst');
  });
  test('destroy して create し直した参加者: 頭の枠が出て、別名と表示名の違う帯にも枠が出る', function() {
    var f = load('seq-names-destroy-create');
    var b = build(f);
    expect(b.res.unmatched.participant).toBe(0);
    expect(rects(b.overlayEl, 'participant', 'SM').length).toBe(2);
    // 帯 (<title>Session Manager</title> の幅 10 の rect) はどれも SM のライフラインの枠に入る
    var bars = Array.prototype.filter.call(f.svgEl.querySelectorAll('g > title'), function(t) {
      return t.textContent === 'Session Manager';
    }).map(function(t) { return t.parentNode.querySelector('rect'); }).filter(function(r) {
      return r && num(r, 'width') === 10;
    });
    expect(bars.length).toBeGreaterThan(0);
    var lls = rects(b.overlayEl, 'lifeline', 'SM');
    bars.forEach(function(r) {
      var cx = num(r, 'x') + 5, cy = num(r, 'y') + num(r, 'height') / 2;
      expect(lls.some(function(l) { return covers(l, cx, cy); })).toBe(true);
    });
  });
  test('作られた参加者の頭は帯として数えない', function() {
    var f = load('seq-names-destroy-create');
    var bars = overlay.collectActivationBars(f.svgEl);
    expect(bars.every(function(b) { return b.w <= 30; })).toBe(true);
  });
});

describe('BLK-builder-20260925-0314-1: teoz の並んだメッセージ (`& B -> C`)', function() {
  test('`&` の行もメッセージとして読む (4 本・Charlie も参加者)', function() {
    var f = load('seq-names-teoz');
    expect(f.parsed.relations.length).toBe(4);
    expect(f.parsed.elements.some(function(e) { return e.kind === 'participant' && e.id === 'Charlie'; })).toBe(true);
  });
  test('4 本のメッセージ・3 人のライフラインに枠が出る', function() {
    var f = load('seq-names-teoz');
    var b = build(f);
    expect(b.res.unmatched.message).toBe(0);
    expect(b.res.unmatched.participant).toBe(0);
    expect(rects(b.overlayEl, 'message').length).toBe(4);
    ['Alice', 'Bob', 'Charlie'].forEach(function(p) {
      expect(rects(b.overlayEl, 'lifeline', p).length).toBe(1);
    });
  });
  test('並んだ矢印の枠は、隣の矢印の矢じりを覆わない', function() {
    var f = load('seq-names-teoz');
    var b = build(f);
    var msgs = rects(b.overlayEl, 'message');
    var hi = msgs.filter(function(r) { return r.getAttribute('data-line') === '11'; })[0];
    // hello (Alice -> Bob) の矢じりの重心
    var poly = f.svgEl.querySelector('polygon');
    var pts = poly.getAttribute('points').split(/[\s,]+/).map(parseFloat);
    var cx = (pts[0] + pts[2] + pts[4] + pts[6]) / 4, cy = (pts[1] + pts[3] + pts[5] + pts[7]) / 4;
    expect(covers(hi, cx, cy)).toBe(false);
  });
  test('書き換えても `&` と字下げは残る', function() {
    var t = '@startuml\n!pragma teoz true\nAlice -> Bob : hello\n  & Bob -> Charlie : hi\n@enduml';
    var out = seq.updateMessage(t, 4, 'label', 'yo');
    expect(out.split('\n')[3]).toBe('  & Bob -> Charlie : yo');
  });
});

describe('BLK-builder-20260925-0314-1: @startuml … @enduml が 2 つあるファイル (dirty-03)', function() {
  test('描かれる最初の図だけを読む (2 つ目の参加者・メッセージを数えない)', function() {
    var t = ['@startuml init_seq', 'Participant App', 'ACTOR User', 'User -> App : PowerOn()', 'App --> User : Ready', '@enduml', '',
      '@startuml diag_seq', 'participant Tool', 'actor 整備士', '整備士 -> Tool : StartDiag()', '@enduml'].join(String.fromCharCode(10));
    var p = seq.parseSequence(t);
    expect(p.relations.length).toBe(2);
    expect(p.elements.filter(function(e) { return e.kind === 'participant'; }).map(function(e) { return e.id; }).sort())
      .toEqual(['App', 'User']);
  });
});
