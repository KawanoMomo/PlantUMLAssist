'use strict';
// BLK-migrator-20260929-0459: `note across` (全参加者にまたがる注釈) の紙に選択枠が一切出なかった。
// 注釈の見出しの形が across を読まず、注釈の要素が作られないので、描かれた紙が黙って捨てられていた。
// 直し方: (1) `note across` / `hnote across` / `rnote across` (1 行・複数行・色付き) を注釈として読み、位置 across を保つ。
// (2) 当て方: 描いた注釈の紙は、DSL の読み取りが注釈と認めたかどうかに関係なく、本文の note / hnote / rnote の行に当てる
// (文字で当て、残りは並び順)。どの行にも当たらない紙だけ枠を出さない。
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
var NE = window.MA.noteEdit;
var NL = String.fromCharCode(10);

function load(name) {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures/svg/' + name + '.svg'), 'utf8');
  var dslText = fs.readFileSync(path.join(__dirname, 'fixtures/dsl/' + name + '.puml'), 'utf8').split(String.fromCharCode(13)).join('');
  var div = document.createElement('div');
  div.innerHTML = svgText;
  return { svgEl: div.querySelector('svg'), parsed: seq.parseSequence(dslText), dsl: dslText };
}
function build(f, parsed) {
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.buildSequenceOverlay(f.svgEl, parsed || f.parsed, overlayEl, f.dsl);
  return overlayEl;
}
function num(r, a) { return parseFloat(r.getAttribute(a)); }
function covers(r, x, y) {
  return x >= num(r, 'x') && x <= num(r, 'x') + num(r, 'width') && y >= num(r, 'y') && y <= num(r, 'y') + num(r, 'height');
}
function topAt(overlayEl, x, y) {
  var all = Array.prototype.slice.call(overlayEl.querySelectorAll('rect[data-type]')).filter(function(r) {
    return !r.hasAttribute('data-front') && covers(r, x, y);
  });
  return all.length ? all[all.length - 1] : null;
}
function textPoint(svgEl, s) {
  var t = Array.prototype.filter.call(svgEl.querySelectorAll('text'), function(e) { return e.textContent === s; })[0];
  if (!t) throw new Error('text not drawn: ' + s);
  return { x: num(t, 'x') + 3, y: num(t, 'y') - 4 };
}
// 紙 (折り返し角の path) の外形の左端・右端の中ほど
function paperEdges(svgEl) {
  var papers = window.MA.overlayBuilder.notePapers(svgEl);
  return papers.map(function(p) {
    return { left: { x: p.box.x + 1, y: p.box.y + p.box.height / 2 }, right: { x: p.box.x + p.box.width - 1, y: p.box.y + p.box.height / 2 } };
  });
}
function hitAt(o, p) {
  var r = topAt(o, p.x, p.y);
  return r ? r.getAttribute('data-type') + '@' + r.getAttribute('data-line') : 'none';
}

describe('BLK-migrator-20260929-0459: note across を注釈として読む', function() {
  test('1 行の note across', function() {
    var h = NE.matchSeqHead('note across : 全体にまたがるnote');
    expect(h.position).toBe('across');
    expect(h.shape).toBe('note');
    expect(h.text).toBe('全体にまたがるnote');
    expect(h.targets).toEqual([]);
    expect(h.block).toBe(false);
  });
  test('複数行・hnote・rnote・色付き', function() {
    expect(NE.matchSeqHead('note across').block).toBe(true);
    var hc = NE.matchSeqHead('hnote across #LightBlue : 色付きの帯');
    expect(hc.shape + '|' + hc.position + '|' + hc.color + '|' + hc.text).toBe('hnote|across|#LightBlue|色付きの帯');
    expect(NE.matchSeqHead('rnote across').shape).toBe('rnote');
    expect(NE.matchSeqHead('note acrossX : x')).toBe(null);
  });
  test('パーサが note across を注釈の要素にする (複数行は見出しの行と end の行)', function() {
    var p = seq.parseSequence(['@startuml', 'participant A', 'participant B', 'A -> B : req', 'note across', '  1 行目', '  2 行目', 'end note', 'B --> A : res', '@enduml'].join(NL));
    var n = p.elements.filter(function(e) { return e.kind === 'note'; });
    expect(n.length).toBe(1);
    expect(n[0].position + '@' + n[0].line + '-' + n[0].endLine).toBe('across@5-8');
    expect(n[0].text).toBe('1 行目' + NL + '2 行目');
    expect(p.relations.length).toBe(2);
  });
  test('本文・色を直しても across は書き換えない', function() {
    var t = ['@startuml', 'A -> B : req', 'note across : 古い', '@enduml'].join(NL);
    expect(NE.updateSeqNote(t, 3, 'text', '新しい').split(NL)[2]).toBe('note across : 新しい');
    expect(NE.updateSeqNote(t, 3, 'color', '#pink').split(NL)[2]).toBe('note across #pink : 古い');
    var b = ['@startuml', 'hnote across', '  a', 'end note', '@enduml'].join(NL);
    expect(NE.updateSeqNote(b, 2, 'text', 'a' + NL + 'b')).toBe(['@startuml', 'hnote across', '  a', '  b', 'end hnote', '@enduml'].join(NL));
  });
  test('対象の無いまま位置を変えようとしても本文は変わらない (位置の選択肢は増やさない)', function() {
    var t = ['@startuml', 'A -> B : req', 'note across : x', '@enduml'].join(NL);
    expect(NE.updateSeqNote(t, 3, 'position', 'over')).toBe(t);
    expect(NE.updateSeqNote(t, 3, 'targets', ['A']).split(NL)[2]).toBe('note over A : x');
  });
});

describe('BLK-migrator-20260929-0459: note across の紙に枠が出て、押すとその行', function() {
  test('最小再現 (1 行): 紙の左右の縁・本文の文字のどこでも note の枠、行は 5', function() {
    var f = load('seq-note-across-1line');
    var o = build(f);
    var edges = paperEdges(f.svgEl);
    expect(edges.length).toBe(1);
    expect(hitAt(o, edges[0].left)).toBe('note@5');
    expect(hitAt(o, edges[0].right)).toBe('note@5');
    expect(hitAt(o, textPoint(f.svgEl, '全体にまたがるnote'))).toBe('note@5');
  });
  test('複数行 (note across … end note): 見出しの行 (5)', function() {
    var f = load('seq-note-across-block');
    var o = build(f);
    var edges = paperEdges(f.svgEl);
    expect(edges.length).toBe(1);
    expect(hitAt(o, edges[0].left)).toBe('note@5');
    expect(hitAt(o, edges[0].right)).toBe('note@5');
    expect(hitAt(o, textPoint(f.svgEl, '2 行目の注釈'))).toBe('note@5');
  });
  // hnote の帯は polygon で、jsdom は polygon・text の外接矩形を測れない (getBBox が無い)。
  // 枠の当たりは E2E (migrator-04) の実ブラウザで確かめ、ここでは注釈として読めることを見る。
  test('hnote across 色付きと並ぶ note over: どちらも注釈の要素 (行 5 と 6)', function() {
    var f = load('seq-note-across-hnote-color');
    var n = f.parsed.elements.filter(function(e) { return e.kind === 'note'; });
    expect(n.map(function(e) { return e.shape + ':' + e.position + '@' + e.line; })).toEqual(['hnote:across@5', 'note:over@6']);
  });
  test('メッセージの枠は今までどおり', function() {
    var f = load('seq-note-across-1line');
    var o = build(f);
    expect(hitAt(o, textPoint(f.svgEl, 'req'))).toBe('message@4');
    expect(hitAt(o, textPoint(f.svgEl, 'res'))).toBe('message@6');
  });
});

describe('BLK-migrator-20260929-0459: 読めない書き方の注釈でも描いた紙に枠を出す (当て方)', function() {
  // パーサが注釈と認めなかった場合を、読んだ結果から注釈を抜いて作る。
  function withoutNotes(parsed) {
    var copy = JSON.parse(JSON.stringify(parsed));
    copy.elements = copy.elements.filter(function(e) { return e.kind !== 'note'; });
    return copy;
  }
  test('文字で当たる: 紙の縁・本文に本文の note の行 (5) の枠', function() {
    var f = load('seq-note-across-1line');
    var o = build(f, withoutNotes(f.parsed));
    var edges = paperEdges(f.svgEl);
    expect(hitAt(o, edges[0].left)).toBe('note@5');
    expect(hitAt(o, textPoint(f.svgEl, '全体にまたがるnote'))).toBe('note@5');
  });
  test('複数行の本文でも見出しの行に当たる', function() {
    var f = load('seq-note-across-block');
    var o = build(f, withoutNotes(f.parsed));
    expect(hitAt(o, paperEdges(f.svgEl)[0].right)).toBe('note@5');
  });
  test('文字で当たらなければ並び順で残りの注釈の行に当てる', function() {
    var f = load('seq-note-across-1line');
    f.dsl = f.dsl.replace('note across : 全体にまたがるnote', 'note across : 描かれた文字と違う本文');
    var o = build(f, withoutNotes(f.parsed));
    expect(hitAt(o, paperEdges(f.svgEl)[0].left)).toBe('note@5');
  });
  test('当てる行が無い紙には枠を出さない (仮の枠も置かない)', function() {
    var f = load('seq-note-across-1line');
    var dsl = f.dsl.split(NL).filter(function(l) { return !/^note across/.test(l); }).join(NL);
    f.dsl = dsl;
    var o = build(f, seq.parseSequence(dsl));
    expect(o.querySelectorAll('rect[data-type="note"]').length).toBe(0);
  });
});
