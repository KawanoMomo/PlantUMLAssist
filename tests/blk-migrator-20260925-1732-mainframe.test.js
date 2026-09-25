'use strict';
// BLK-migrator-20260925-1732: `mainframe 見出し` のある図で、見出しの文字に枠が出ず「⚠ Overlay マッチング失敗: message:6」が出ていた
// (migrator の corpus seq-19)。当て方の直し:
//   - mainframe の枠・札・札の文字は図全体の飾り。title / header / footer / caption と同じ 6 図種共通の 1 か所
//     (overlayBuilder.addDocumentChrome) で札に mainframe の行の枠を置き、図種の当て方 (並び・文字・描いた形) には数えない
//   - `newpage` より後 (2 枚目以降) はプレビューに描かれないので、メッセージ・注釈・群を並びの照合にも数にも入れない
//   - 宣言の後ろの `<<ステレオタイプ>>` / `order N` / `#色` を名前の外として読む (読めないと参加者が暗黙に作られ、並びが入れ替わる)
// fixtures/svg/mainframe-*.svg は同名の fixtures/dsl/*.puml を同梱の plantuml.jar (1.2026.8) で描いたもの
// (mainframe-seq19 = persona-data の corpus/seq-19-newpage-mainframe-stereotype.puml)。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

var _prevWindow = global.window;
var _prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
var document = dom.window.document;

[
  'html-utils', 'dsl-utils', 'note-edit', 'regex-parts', 'id-normalizer',
  'dsl-updater', 'text-updater', 'parser-utils', 'line-resolver', 'props-renderer',
  'overlay-builder', 'selection-router', 'sequence-participant-zone',
  'sequence-autonumber', 'sequence-activation-insert',
].forEach(function(m) {
  try { delete require.cache[require.resolve('../src/core/' + m + '.js')]; } catch (e) {}
  try { require('../src/core/' + m + '.js'); } catch (e) {}
});
['../src/modules/sequence.js', '../src/ui/sequence-overlay.js', '../src/modules/activity.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});

var W = global.window;
var seq = W.MA.modules.plantumlSequence;
var act = W.MA.modules.plantumlActivity;
var SO = W.MA.sequenceOverlay;
var OB = W.MA.overlayBuilder;

function load(name) {
  var svgText = fs.readFileSync(path.join(__dirname, 'fixtures', 'svg', name + '.svg'), 'utf8');
  var dsl = fs.readFileSync(path.join(__dirname, 'fixtures', 'dsl', name + '.puml'), 'utf8').replace(/\r\n/g, '\n');
  var host = document.createElement('div');
  host.innerHTML = svgText.replace(/^<\?[^>]*\?>/, '');
  return { svgEl: host.querySelector('svg'), dsl: dsl, overlayEl: document.createElementNS('http://www.w3.org/2000/svg', 'svg') };
}
// app.js の描画と同じ順: 図種の buildOverlay の後に addDocumentChrome。
function buildSeq(f) {
  var parsed = seq.parseSequence(f.dsl);
  var res = SO.buildSequenceOverlay(f.svgEl, parsed, f.overlayEl, f.dsl);
  OB.addDocumentChrome(f.svgEl, f.overlayEl, f.dsl);
  return res;
}
function buildAct(f) {
  act.buildOverlay(f.svgEl, act.parse(f.dsl), f.overlayEl, f.dsl);
  OB.addDocumentChrome(f.svgEl, f.overlayEl, f.dsl);
}
function rects(overlayEl, sel) {
  return Array.prototype.map.call(overlayEl.querySelectorAll('rect' + (sel || '')), function(r) {
    return {
      type: r.getAttribute('data-type'), kind: r.getAttribute('data-src-kind'), line: Number(r.getAttribute('data-line')),
      id: r.getAttribute('data-id'),
      x: parseFloat(r.getAttribute('x')), y: parseFloat(r.getAttribute('y')),
      w: parseFloat(r.getAttribute('width')), h: parseFloat(r.getAttribute('height')),
    };
  });
}
function at(list, x, y) {
  var hit = null;
  list.forEach(function(r) { if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) hit = r; });  // 後に置いた物が手前
  return hit;
}

describe('BLK-migrator-20260925-1732: 宣言の後ろの飾りは名前の外', function() {
  test('`participant "表示名" as 別名 <<ステレオタイプ>>` を宣言として読み、並びは宣言の順', function() {
    var p = seq.parseSequence(load('mainframe-seq19').dsl);
    var parts = p.elements.filter(function(e) { return e.kind === 'participant'; });
    expect(parts.map(function(e) { return [e.id, e.label, e.line]; })).toEqual([['Drv', 'MCUドライバ', 3], ['App', 'アプリ', 4]]);
  });
  test('order と色 (#名前・#16 進) も外して読み、"…" の中の # は表示名のまま', function() {
    var p = seq.parseSequence('@startuml\nparticipant Foo order 20 #red\nactor "利用者" as U <<人>> #FFAA00\nparticipant X as "型 #1"\nFoo -> U\n@enduml');
    var parts = p.elements.filter(function(e) { return e.kind === 'participant'; });
    expect(parts.map(function(e) { return [e.id, e.label, e.line]; })).toEqual([['Foo', 'Foo', 2], ['U', '利用者', 3], ['X', '型 #1', 4]]);
  });
  test('フォームで表示名を直しても後ろの飾りはそのまま残る', function() {
    var t = '@startuml\nparticipant "MCUドライバ" as Drv <<HW Abstraction>>\n@enduml';
    expect(seq.updateParticipant(t, 2, 'label', 'MCU')).toBe('@startuml\nparticipant "MCU" as Drv <<HW Abstraction>>\n@enduml');
  });
});

describe('BLK-migrator-20260925-1732: newpage より後は 1 枚目の当て方に数えない', function() {
  test('最初の newpage の行を憶え、一覧には 2 枚目のメッセージも残す', function() {
    var p = seq.parseSequence(load('mainframe-seq19').dsl);
    expect(p.meta.newpageLine).toBe(8);
    expect(p.relations.length).toBe(8);
  });
  test('seq-19: 「Overlay マッチング失敗」の元になる未対応が 0、1 枚目のメッセージ 2 本に本人の枠', function() {
    var f = load('mainframe-seq19');
    var res = buildSeq(f);
    expect(res.unmatched).toEqual({ participant: 0, message: 0, note: 0, activation: 0, group: 0 });
    var msgs = rects(f.overlayEl, '[data-type="message"]');
    expect(msgs.map(function(r) { return r.line; })).toEqual([6, 7]);
  });
});

describe('BLK-migrator-20260925-1732: mainframe の札に mainframe の行の枠 (6 図種共通の 1 か所)', function() {
  test('seq-19: 札の文字「起動シーケンス概要」を指すと mainframe の行 (5)、参加者は宣言の行に本人の枠', function() {
    var f = load('mainframe-seq19');
    buildSeq(f);
    var all = rects(f.overlayEl, '.selectable');
    var head = at(all, 70, 24);   // 札の文字 (x 13〜139, 基線 30.5)
    expect(head && head.kind).toBe('mainframe');
    expect(head.line).toBe(5);
    expect(at(all, 140, 20).line).toBe(5);   // 札の斜めの縁の内側
    expect(pick(at(all, 80, 88))).toEqual(({ type: 'participant', id: 'Drv', line: 3 }));   // 「MCUドライバ」
    expect(pick(at(all, 220, 88))).toEqual(({ type: 'participant', id: 'App', line: 4 }));  // 「アプリ」
    // 枠全体 (図の余白) には置かない
    expect(at(all, 290, 250)).toBe(null);
  });
  test('群・ref のある sequence: 群と ref の並びはずれず、札は mainframe の行', function() {
    var f = load('mainframe-seq-groups');
    var res = buildSeq(f);
    expect(res.unmatched.group).toBe(0);
    expect(rects(f.overlayEl, '[data-type="group"]').map(function(r) { return r.line; })).toEqual([7, 13]);
    var mf = rects(f.overlayEl, '[data-src-kind="mainframe"]');
    expect(mf.length).toBe(1);
    expect(mf[0].line).toBe(6);
  });
  test('box のある sequence: 囲みの見出しは box の枠 (mainframe の枠を囲みと取り違えない)', function() {
    var f = load('mainframe-seq-box');
    buildSeq(f);
    var box = rects(f.overlayEl, '[data-type="box"]');
    expect(box.length).toBe(1);
    expect(box[0].x).toBeGreaterThan(20);    // 囲みの rect は x=26 (mainframe は x=10)
    expect(box[0].y).toBeGreaterThan(40);
    var mf = rects(f.overlayEl, '[data-src-kind="mainframe"]');
    expect(mf.length).toBe(1);
    expect(mf[0].line).toBe(2);
  });
  test('新記法のアクティビティ図: 札は mainframe の行、枠の内側全体を覆う枠は置かない', function() {
    var f = load('mainframe-activity');
    buildAct(f);
    var all = rects(f.overlayEl, '.selectable');
    expect(at(all, 40, 30).kind).toBe('mainframe');
    all.forEach(function(r) { expect(r.w * r.h).toBeLessThan(76 * 168 / 2); });
    expect(rects(f.overlayEl, '[data-type="action"]').map(function(r) { return r.line; })).toEqual([4]);
  });
  test('旧記法のアクティビティ図: 枠の rect を行の無い図形として関係の行に当てない', function() {
    var f = load('mainframe-activity-legacy');
    buildAct(f);
    var all = rects(f.overlayEl, '.selectable');
    expect(at(all, 30, 30).kind).toBe('mainframe');
    all.forEach(function(r) { expect(r.w * r.h).toBeLessThan(94 * 215 / 2); });
  });
  test('class 図・state 図も同じ 1 か所で札に mainframe の行', function() {
    ['mainframe-class', 'mainframe-state'].forEach(function(name) {
      var f = load(name);
      expect(OB.addDocumentChrome(f.svgEl, f.overlayEl, f.dsl)).toBe(1);
      var mf = rects(f.overlayEl, '[data-src-kind="mainframe"]');
      expect(mf.length).toBe(1);
      expect(mf[0].line).toBe(2);
      expect(mf[0].y).toBeLessThan(15);
    });
  });
  test('chromeEntries は mainframe の行を読み、札の文字・札・枠を chromeElements で返す', function() {
    var f = load('mainframe-seq19');
    var en = OB.chromeEntries(f.dsl).filter(function(e) { return e.kind === 'mainframe'; });
    expect(en).toEqual([{ kind: 'mainframe', line: 5, texts: ['起動シーケンス概要'] }]);
    var els = OB.chromeElements(f.svgEl, f.dsl).map(function(e) { return e.tagName.toLowerCase(); }).sort();
    expect(els).toEqual(['path', 'rect', 'text']);
    expect(OB.chromeElements(f.svgEl, '@startuml\nA -> B\n@enduml')).toEqual([]);
  });
});

function pick(r) { return r && { type: r.type, id: r.id, line: r.line }; }

if (_prevWindow) global.window = _prevWindow;
if (_prevDocument) global.document = _prevDocument;
