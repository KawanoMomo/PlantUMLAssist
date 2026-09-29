'use strict';
// BLK-migrator-20260923-1409:
// 表示名が `\n` で複数行になる participant の図で、見出しにホバーしても選択枠が
// 出ない / 別の参加者の枠が出た。
//
// 原因は 2 つとも「当て方」にあった:
//   1. この PlantUML は data-source-line を出さない。行での対応は必ず失敗し、
//      順番 (matchByOrder) に落ちる。順番で当てると、パーサが読めない記法が
//      1 行あるだけで以後の枠が全部ずれる。
//   2. 枠の大きさを最初の <text> から取っていたため、表示名が複数行だと
//      1 行目の上しか当たり判定にならず、その分ライフラインも隣の参加者を掴んだ。
//
// 直し方は「描いた側が SVG に残した情報を先に使う」:
//   - 参加者は data-qualified-name (= DSL の別名) で当てる
//   - 枠は塗りのある図形 (実際に描かれた箱) に合わせる
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

// run-tests.js は全テストを 1 プロセスで回すので、先に走ったテストが作った
// global.window を奪うと、require 済みのモジュールが古い window に登録されたままになる。
// 1307 と同じく、既にあればそれを使い、モジュール側だけ載せ直す。
if (!global.window) {
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>',
    { url: 'http://localhost/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
}

[
  'html-utils', 'dsl-utils', 'note-edit', 'regex-parts', 'id-normalizer',
  'dsl-updater', 'text-updater', 'parser-utils', 'line-resolver',
  'overlay-builder', 'selection-router', 'sequence-participant-zone',
  'sequence-autonumber',
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

function loadFixture(name) {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/' + name + '.svg'), 'utf8');
  var dslText = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/' + name + '.puml'), 'utf8');
  var div = document.createElement('div');
  div.innerHTML = svgText;
  return { svgEl: div.querySelector('svg'), parsed: seq.parseSequence(dslText) };
}

function build(name) {
  var f = loadFixture(name);
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.buildSequenceOverlay(f.svgEl, f.parsed, overlayEl);
  return { overlayEl: overlayEl, svgEl: f.svgEl, parsed: f.parsed };
}

function rectsFor(overlayEl, type, id) {
  var sel = 'rect[data-type="' + type + '"]' + (id ? '[data-id="' + id + '"]' : '') + ':not([data-front])';
  return Array.prototype.slice.call(overlayEl.querySelectorAll(sel));
}

function num(r, a) { return parseFloat(r.getAttribute(a)); }

describe('BLK-migrator-1409: 複数行 (\\n) の表示名を持つ participant', function() {
  test('パーサは `\\n` 入りの表示名を 1 行の宣言として読む', function() {
    var f = loadFixture('sequence-multiline-label');
    var parts = f.parsed.elements.filter(function(e) { return e.kind === 'participant'; });
    expect(parts.map(function(p) { return p.id; })).toEqual(['A', 'B']);
    expect(parts[0].label).toBe('Line1\\n<b>Line2</b>\\nLine3');
    // 表示名の中の行が別の参加者として混ざらない
    expect(parts.length).toBe(2);
  });

  test('この PlantUML は data-source-line を出さない (順番だのみになっていた)', function() {
    var f = loadFixture('sequence-multiline-label');
    expect(f.svgEl.querySelectorAll('[data-source-line]').length).toBe(0);
    expect(f.svgEl.querySelectorAll('[data-qualified-name]').length).toBeGreaterThan(0);
  });

  test('参加者は名前 (data-qualified-name) で当たり、順番に依存しない', function() {
    var f = loadFixture('sequence-multiline-label');
    var parts = f.parsed.elements.filter(function(e) { return e.kind === 'participant'; });
    // わざと並びを逆にしても、名前で当てるので対応は変わらない
    var reversed = parts.slice().reverse();
    var m = OB.matchByEntityName(f.svgEl, reversed, 'g.participant-head');
    expect(m.length).toBe(2);
    m.forEach(function(one) {
      expect(one.groupEl.getAttribute('data-qualified-name')).toBe(one.item.id);
    });
  });

  test('見出しの枠が描かれた箱の高さに合う (3 行ぶんを覆う)', function() {
    var b = build('sequence-multiline-label');
    var headRect = b.svgEl.querySelector('g.participant-head[data-qualified-name="A"] rect');
    var drawnTop = parseFloat(headRect.getAttribute('y'));
    var drawnH = parseFloat(headRect.getAttribute('height'));
    // 3 行ぶんなので 1 行の図 (B) よりはっきり高い
    expect(drawnH).toBeGreaterThan(50);

    var a = rectsFor(b.overlayEl, 'participant', 'A');
    expect(a.length).toBe(2);  // head + tail
    var head = a[0];
    expect(num(head, 'height')).toBeGreaterThanOrEqual(drawnH);
    expect(num(head, 'y')).toBeLessThanOrEqual(drawnTop);
    // 2 行目・3 行目の位置も枠の中に入る
    var lastLine = b.svgEl.querySelectorAll('g.participant-head[data-qualified-name="A"] text')[2];
    var lastY = parseFloat(lastLine.getAttribute('y'));
    expect(lastY).toBeGreaterThan(num(head, 'y'));
    expect(lastY).toBeLessThan(num(head, 'y') + num(head, 'height'));
  });

  test('複数行の見出しの下の方を指しても A が選ばれる (前は何も出なかった)', function() {
    var b = build('sequence-multiline-label');
    var headRect = b.svgEl.querySelector('g.participant-head[data-qualified-name="A"] rect');
    var cx = parseFloat(headRect.getAttribute('x')) + parseFloat(headRect.getAttribute('width')) / 2;
    var lowY = parseFloat(headRect.getAttribute('y'))
      + parseFloat(headRect.getAttribute('height')) * 0.85;
    var hit = OB.hitTestTopmost(b.overlayEl, cx, lowY);
    expect(hit).toBeTruthy();
    expect(hit.getAttribute('data-type')).toBe('participant');
    expect(hit.getAttribute('data-id')).toBe('A');
  });

  test('ライフラインは名前で当たるので別人の枠にならない', function() {
    var b = build('sequence-multiline-label');
    var ids = rectsFor(b.overlayEl, 'lifeline').map(function(r) { return r.getAttribute('data-id'); });
    expect(ids.sort()).toEqual(['A', 'B']);
    // SVG 側のライフラインの x と、当てた参加者の x が同じ側にある
    Array.prototype.forEach.call(b.svgEl.querySelectorAll('g.participant-lifeline'), function(lg) {
      var name = lg.getAttribute('data-qualified-name');
      var ln = lg.querySelector('line');
      var lx = parseFloat(ln.getAttribute('x1'));
      var r = rectsFor(b.overlayEl, 'lifeline', name)[0];
      expect(r).toBeTruthy();
      expect(Math.abs(num(r, 'x') + num(r, 'width') / 2 - lx)).toBeLessThan(8);
    });
  });

  test('メッセージにも枠が出る', function() {
    var b = build('sequence-multiline-label');
    expect(rectsFor(b.overlayEl, 'message').length).toBeGreaterThan(0);
  });

  test('1 行の表示名の図 (回帰) はこれまでどおり当たる', function() {
    var b = build('sequence-basic');
    var parts = b.parsed.elements.filter(function(e) { return e.kind === 'participant'; });
    var ids = {};
    rectsFor(b.overlayEl, 'participant').forEach(function(r) { ids[r.getAttribute('data-id')] = true; });
    expect(Object.keys(ids).length).toBe(parts.length);
  });
});

// このファイルは現在の window に載せ直すためモジュールの require キャッシュを落としている。
// 落としたまま抜けると、後から自前の window を作るテスト (sequence-overlay.test.js など) が
// require しても IIFE が再実行されず、その window に登録されないまま undefined を掴む。
// 出るときにもう一度落として、次のテストが必ず自分の window に載せ直せるようにする。
[
  '../src/core/html-utils.js', '../src/core/dsl-utils.js', '../src/core/note-edit.js',
  '../src/core/regex-parts.js', '../src/core/id-normalizer.js', '../src/core/dsl-updater.js',
  '../src/core/text-updater.js', '../src/core/parser-utils.js', '../src/core/line-resolver.js',
  '../src/core/overlay-builder.js', '../src/core/selection-router.js',
  '../src/core/sequence-participant-zone.js', '../src/core/sequence-autonumber.js',
  '../src/modules/sequence.js', '../src/ui/sequence-overlay.js',
].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
});

// 差し戻し 1 回目: AWS の構成図 (Figure 5 系) は参加者を手続き (`$AWSIcon(...) as x`) で宣言し、
// 帯の略記 (`a->b++ 色:`)・`return`・メッセージに付ける注釈 (`note right`)・
// 引用符の無い囲み名 (`box API Version 1`)・テーマ色の群の枠を使う。
// どれか 1 つ読めないと、順番で当てている枠が以後ずれる / 出ない。
describe('BLK-migrator-1409 差し戻し: 手続きで宣言する参加者の図', function() {
  test('手続きの本体は参加者にせず、手続きの呼び出しを別名つきの参加者として読む', function() {
    var f = loadFixture('sequence-procedure-participants');
    var parts = f.parsed.elements.filter(function(e) { return e.kind === 'participant'; });
    expect(parts.map(function(p) { return p.id; })).toEqual(['user', 'edge', 'api']);
    expect(parts[0].line).toBe(11);
    expect(parts[2].boxId).toBe('__box_0');
  });

  test('引用符の無い空白入りの囲み名を読む', function() {
    var f = loadFixture('sequence-procedure-participants');
    expect(f.parsed.boxes.length).toBe(1);
    expect(f.parsed.boxes[0].label).toBe('API Version 1');
    expect(f.parsed.boxes[0].members).toEqual(['api']);
  });

  test('帯の略記つきメッセージを読み、return は並びを合わせるためだけに憶える', function() {
    var r = seq.parseSequence('@startuml\nA->B++ #lightblue: GET\nB->C++ $AWSColor(Compute):\nreturn\nA -> B-- : ok\n@enduml');
    expect(r.relations.map(function(m) { return m.from + m.arrow + m.to + '|' + m.label; }))
      .toEqual(['A->B|GET', 'B->C|', 'A->B|ok']);
    expect(r.returns.length).toBe(1);
    expect(r.returns[0].line).toBe(4);
  });

  test('色つきの activate を帯として読む', function() {
    var r = seq.parseSequence('@startuml\nA -> B : x\nactivate B %lighten(AWS_COLOR, 75)\ndeactivate B\n@enduml');
    var acts = r.elements.filter(function(e) { return e.kind === 'activation'; });
    expect(acts.length).toBe(2);
    expect(acts[0].target).toBe('B');
    expect(acts[0].color).toBe('%lighten(AWS_COLOR, 75)');
  });

  test('参加者・ライフラインは名前で当たり、return の後のメッセージも本人の矢印に当たる', function() {
    var b = build('sequence-procedure-participants');
    ['user', 'edge', 'api'].forEach(function(id) {
      expect(rectsFor(b.overlayEl, 'participant', id).length).toBe(1);
      expect(rectsFor(b.overlayEl, 'lifeline', id).length).toBe(1);
    });
    var msgs = rectsFor(b.overlayEl, 'message');
    expect(msgs.length).toBe(4);
    // 最後のメッセージ (200 OK) の枠は、SVG の最後の矢印 (return の次) を囲む
    var gs = b.svgEl.querySelectorAll('g.message');
    var lastG = gs[gs.length - 1];
    var last = msgs.filter(function(r) { return r.getAttribute('data-line') === '29'; })[0];
    expect(!!last).toBe(true);
    var ln = lastG.querySelector('line');
    var y = parseFloat(ln.getAttribute('y1'));
    expect(num(last, 'y') <= y && y <= num(last, 'y') + num(last, 'height')).toBe(true);
  });

  test('テーマ色の群の枠も拾い、ライフラインは群の枠より手前に置く', function() {
    var b = build('sequence-procedure-participants');
    expect(rectsFor(b.overlayEl, 'group').length).toBe(1);
    var kids = Array.prototype.slice.call(b.overlayEl.children);
    var gi = kids.indexOf(rectsFor(b.overlayEl, 'group')[0]);
    rectsFor(b.overlayEl, 'lifeline').forEach(function(r) {
      expect(kids.indexOf(r)).toBeGreaterThan(gi);
    });
  });

  test('メッセージに付けた注釈 (note right) に枠が出る。語ごとに分かれた本文でも当たる', function() {
    var f = loadFixture('sequence-procedure-participants');
    var notes = f.parsed.elements.filter(function(e) { return e.kind === 'note'; });
    expect(notes.length).toBe(1);
    expect(notes[0].position).toBe('right');
    // 左寄せの注釈は 1 行を語ごとの <text> に分けて描かれる
    var t = Array.prototype.filter.call(f.svgEl.querySelectorAll('text'), function(x) {
      return x.textContent === 'missing Accept-Version header';
    })[0];
    t.textContent = 'missing';
    var prev = t;
    [' ', 'Accept-Version', ' ', 'header'].forEach(function(w) {
      var n = t.cloneNode(false); n.textContent = w;
      t.parentNode.insertBefore(n, prev.nextSibling);
      prev = n;
    });
    var texts = f.svgEl.querySelectorAll('text');
    var idx = Array.prototype.indexOf.call(texts, t);
    expect(overlay._lineStartsAt(texts, idx, 'missing Accept-Version header')).toBe(true);
    expect(overlay._lineStartsAt(texts, idx, 'missing Accept-Version')).toBe(false);
    expect(overlay._lineStartsAt(texts, idx, 'missing header')).toBe(false);
  });
});
