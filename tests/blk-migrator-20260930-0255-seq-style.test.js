'use strict';
// BLK-migrator-20260930-0255: `<style>` で participant と note の色を指定したシーケンス図で、参加者の頭・ライフラインに
// 選択枠が 1 つも出なかった。原因は当て方の前提の 2 か所:
//   - 本文の読み手が `<style>` の中の `participant {` を参加者 `{` と読み、描かれたライフライン (2 本) と人数 (3 人) が
//     合わなくなって、左から順の当て方ごと捨てていた
//   - `participant 店舗 as S` (引用符の無い表示名 + 別名) を宣言と読まず、表示名が別名 S のまま (伏せ字の「..」と照合できない)
// 直し方: `<style>` の中は要素として読まない。引用符の無い `X as Y` も宣言として読む。ライフラインと人数が合わないときも、
// 伏せ字の表示名と字数・ASCII の字が食い違わない次の参加者を左から当て、1 人の読み違いで全員の枠を外さない。
// fixtures/svg/v1-2026-8-seq-style-note.svg は同名の fixtures/dsl を PlantUML 1.2026.8 で描いたもの (migrator の最小再現)。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

var _prevWindow = global.window;
var _prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;

var MODS = [
  '../src/core/html-utils.js', '../src/core/dsl-utils.js', '../src/core/note-edit.js', '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js', '../src/core/dsl-updater.js', '../src/core/text-updater.js',
  '../src/core/parser-utils.js', '../src/core/line-resolver.js', '../src/core/overlay-builder.js',
  '../src/core/selection-router.js', '../src/core/sequence-participant-zone.js', '../src/core/sequence-autonumber.js',
  '../src/core/sequence-activation-insert.js', '../src/core/app-bridge.js',
  '../src/modules/sequence.js', '../src/ui/sequence-overlay.js',
];
MODS.forEach(function(m) { try { delete require.cache[require.resolve(m)]; } catch (e) {} });
MODS.forEach(function(m) { try { require(m); } catch (e) {} });

var window = global.window;
var document = global.document;
var SEQ = window.MA.modules.plantumlSequence;
var SO = window.MA.sequenceOverlay;
var FIX = path.join(__dirname, 'fixtures');
var NAME = 'seq-style-note';

function svgOf() {
  var div = document.createElement('div');
  div.innerHTML = fs.readFileSync(path.join(FIX, 'svg', 'v1-2026-8-' + NAME + '.svg'), 'utf8');
  return div.querySelector('svg');
}
function dslOf() {
  return fs.readFileSync(path.join(FIX, 'dsl', 'v1-2026-8-' + NAME + '.puml'), 'utf8').replace(/\r\n/g, '\n');
}
function overlay(parsed, dsl) {
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  SO.buildSequenceOverlay(svgOf(), parsed, overlayEl, dsl);
  return overlayEl;
}
function rects(overlayEl, type, id) {
  return Array.prototype.slice.call(overlayEl.querySelectorAll('rect[data-type="' + type + '"]' + (id ? '[data-id="' + id + '"]' : '')))
    .filter(function(r) { return !r.hasAttribute('data-front'); });
}
function num(r, a) { return parseFloat(r.getAttribute(a)); }
function covers(r, x, y) {
  return x >= num(r, 'x') && x <= num(r, 'x') + num(r, 'width') && y >= num(r, 'y') && y <= num(r, 'y') + num(r, 'height');
}

describe('本文の読み: <style> の中は要素にしない', function() {
  test('`participant {` / `note {` は参加者・注釈にならず、宣言の 2 人と注釈 1 つだけが残る', function() {
    var p = SEQ.parseSequence(dslOf());
    var parts = p.elements.filter(function(e) { return e.kind === 'participant'; });
    expect(parts.map(function(e) { return e.id; })).toEqual(['S', 'G']);
    expect(p.elements.filter(function(e) { return e.kind === 'note'; }).map(function(e) { return e.line; })).toEqual([16]);
    expect(p.relations.map(function(r) { return r.line; })).toEqual([14, 15, 17]);
  });
  test('1 行の `<style>…</style>` もその行だけ読み飛ばす', function() {
    var p = SEQ.parseSequence(['@startuml', '<style>participant { BackGroundColor red }</style>', 'A -> B : x', '@enduml'].join('\n'));
    expect(p.elements.filter(function(e) { return e.kind === 'participant'; }).map(function(e) { return e.id; })).toEqual(['A', 'B']);
  });
});

describe('本文の読み: 引用符の無い `participant 表示名 as 別名`', function() {
  test('表示名と別名に分けて宣言として読み、行は宣言の行', function() {
    var p = SEQ.parseSequence(dslOf());
    var byId = {};
    p.elements.forEach(function(e) { if (e.kind === 'participant') byId[e.id] = e; });
    expect(byId.S.label).toBe('店舗');
    expect(byId.S.line).toBe(12);
    expect(byId.G.label).toBe('決済GW');
    expect(byId.G.line).toBe(13);
  });
  test('actor・引用符付きの形は今までどおり', function() {
    var p = SEQ.parseSequence(['@startuml', 'actor 利用者 as U', 'participant "Long Name" as L', 'participant X as "Ex"', 'U -> L', '@enduml'].join('\n'));
    var got = p.elements.filter(function(e) { return e.kind === 'participant'; }).map(function(e) { return [e.id, e.label, e.ptype].join('|'); });
    expect(got).toEqual(['U|利用者|actor', 'L|Long Name|participant', 'X|Ex|participant']);
  });
  test('宣言の行は宣言として扱える (削除・並べ替えの対象になる)', function() {
    var dsl = dslOf();
    expect(SEQ.participantOwnsLine(dsl, 'S', 12)).toBe(true);
    expect(SEQ.participantOwnsLine(dsl, 'G', 13)).toBe(true);
  });
});

describe('当て方: <style> で色を替えても参加者の頭・ライフラインに枠が出る (migrator の最小再現)', function() {
  var dsl = dslOf();
  var ov = overlay(SEQ.parseSequence(dsl), dsl);
  test('参加者は頭と尻に 2 つずつ、宣言の行を指す', function() {
    expect(rects(ov, 'participant', 'S').length).toBe(2);
    expect(rects(ov, 'participant', 'G').length).toBe(2);
    rects(ov, 'participant', 'S').forEach(function(r) { expect(r.getAttribute('data-line')).toBe('12'); });
    rects(ov, 'participant', 'G').forEach(function(r) { expect(r.getAttribute('data-line')).toBe('13'); });
  });
  test('店舗の頭 (x 10〜52, y 10〜41) と店舗のライフライン (x 31) に店舗の枠', function() {
    expect(rects(ov, 'participant', 'S').some(function(r) { return covers(r, 30, 25); })).toBe(true);
    expect(rects(ov, 'lifeline', 'S').some(function(r) { return covers(r, 31, 130); })).toBe(true);
    expect(rects(ov, 'lifeline', 'G').some(function(r) { return covers(r, 95, 130); })).toBe(true);
  });
  test('メッセージ 3 本と注釈は書かれた行を指す', function() {
    expect(rects(ov, 'message').map(function(r) { return r.getAttribute('data-line'); }).sort()).toEqual(['14', '15', '17']);
    expect(rects(ov, 'note').map(function(r) { return r.getAttribute('data-line'); })).toEqual(['16']);
  });
});

describe('当て方: 本文から読んだ参加者に描かれない者が混ざっても、他の参加者の照合をずらさない', function() {
  var dsl = dslOf();
  function withExtra(extra, at) {
    var p = SEQ.parseSequence(dsl);
    p.elements.splice(at, 0, extra);
    return p;
  }
  test('先頭に描かれない参加者 (`{`) が 1 人いても、店舗・決済GW はそれぞれの列に当たる', function() {
    var ov = overlay(withExtra({ kind: 'participant', id: '{', label: '{', ptype: 'participant', line: 4 }, 0), dsl);
    expect(rects(ov, 'lifeline', 'S').some(function(r) { return covers(r, 31, 130); })).toBe(true);
    expect(rects(ov, 'lifeline', 'G').some(function(r) { return covers(r, 95, 130); })).toBe(true);
    expect(rects(ov, 'participant', '{').length).toBe(0);
    expect(rects(ov, 'lifeline', '{').length).toBe(0);
  });
  test('伏せ字が同じ「..」の 2 人 (店舗・倉庫) と描かれない 1 人が混ざっても、左から順にそれぞれの列に当たる', function() {
    var d2 = fs.readFileSync(path.join(FIX, 'dsl', 'v1-2026-8-seq-style-same-mask.puml'), 'utf8').replace(/\r\n/g, '\n');
    var div = document.createElement('div');
    div.innerHTML = fs.readFileSync(path.join(FIX, 'svg', 'v1-2026-8-seq-style-same-mask.svg'), 'utf8');
    var p = SEQ.parseSequence(d2);
    p.elements.splice(0, 0, { kind: 'participant', id: '{', label: '{', ptype: 'participant', line: 4 });
    var ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    SO.buildSequenceOverlay(div.querySelector('svg'), p, ov, d2);
    // 列の x: 店舗 31 / 倉庫 83 / 決済GW 147.052 (題は「..」「..」「..GW」)
    expect(rects(ov, 'lifeline', 'S').some(function(r) { return covers(r, 31, 130); })).toBe(true);
    expect(rects(ov, 'lifeline', 'W').some(function(r) { return covers(r, 83, 130); })).toBe(true);
    expect(rects(ov, 'lifeline', 'G').some(function(r) { return covers(r, 147, 130); })).toBe(true);
    expect(rects(ov, 'lifeline', '{').length).toBe(0);
    expect(rects(ov, 'participant', 'W').some(function(r) { return covers(r, 83, 25); })).toBe(true);
  });
  test('表示名が別名のまま (伏せ字と照合できない) の参加者が混ざっても、字数の合う者だけを左から当てる', function() {
    var p = SEQ.parseSequence(dsl);
    p.elements.forEach(function(e) { if (e.id === 'S') e.label = 'S'; });
    p.elements.splice(1, 0, { kind: 'participant', id: 'Ghost', label: 'Ghost', ptype: 'participant', line: 5 });
    var ov = overlay(p, dsl);
    // 列の題は「..」(店舗) と「..GW」(決済GW)。Ghost は字数が合わず、決済GW の列を取らない。
    expect(rects(ov, 'lifeline', 'G').some(function(r) { return covers(r, 95, 130); })).toBe(true);
    expect(rects(ov, 'lifeline', 'Ghost').length).toBe(0);
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
