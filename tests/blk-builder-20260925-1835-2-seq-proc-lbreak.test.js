'use strict';
// BLK-builder-20260925-1835-2: migrator の実物 5 枚 (aws-icons の Sequence - Images・Figure 5 の 2 枚・S3 Upload Workflow、
// corpus の seq-22) で「⚠ Overlay マッチング失敗: message:N」が出て、メッセージの枠が抜けた・ずれた。
// 当て方の穴は 3 つで、どれも「描かれた矢印と DSL のメッセージの並べ方」:
//  (1) 文言の比べ方が改行 `\n` しか落とさず、左寄せ `\l`・右寄せ `\r`・スプライト `<$x>`・`<&icon>` が残って一致しなかった
//  (2) 文言の無いメッセージ (`a -> b ++ :`) と `return` が並ぶ区間で、return の矢印を数えず本数が合わなかった
//  (3) 同じファイルで定義した手続き (`!procedure $log(...)` の本体がメッセージ) を呼ぶ行を読まず、描かれた矢印が多かった
// fixtures/svg/v1-2026-8-{local-proc,lbreak-sprite}.svg は同名の dsl を同梱 PlantUML 1.2026.8 で描いたもの。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

var _prevWindow = global.window;
var _prevDocument = global.document;
var _prevParser = global.DOMParser;
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

var W = global.window;
var SEQ = W.MA.modules.plantumlSequence;
var SO = W.MA.sequenceOverlay;
var FIX = path.join(__dirname, 'fixtures');

function dslOf(name) {
  return fs.readFileSync(path.join(FIX, 'dsl', 'v1-2026-8-' + name + '.puml'), 'utf8').replace(/\r\n/g, '\n');
}
function build(name) {
  var div = document.createElement('div');
  div.innerHTML = fs.readFileSync(path.join(FIX, 'svg', 'v1-2026-8-' + name + '.svg'), 'utf8');
  var svg = div.querySelector('svg');
  var dsl = dslOf(name);
  var parsed = SEQ.parseSequence(dsl);
  var out = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  var res = SO.buildSequenceOverlay(svg, parsed, out, dsl);
  return { svg: svg, out: out, parsed: parsed, res: res };
}
function num(el, a) { return parseFloat(el.getAttribute(a)); }
function msgRect(out, id) { return out.querySelector('rect[data-type="message"][data-id="' + id + '"]'); }
// 描かれた文字 s の中心が、そのメッセージの枠の中にあるか
function textInside(svg, rect, s) {
  var hit = false;
  Array.prototype.forEach.call(svg.querySelectorAll('text'), function(t) {
    if ((t.textContent || '').trim() !== s) return;
    var x = num(t, 'x') + 5, y = num(t, 'y') - 4;
    var rx = num(rect, 'x'), ry = num(rect, 'y');
    if (x >= rx && x <= rx + num(rect, 'width') && y >= ry && y <= ry + num(rect, 'height')) hit = true;
  });
  return hit;
}

describe('BLK-builder-20260925-1835-2: 同じファイルの手続きを呼ぶ行はその本体のメッセージとして読む', function() {
  test('`$log("Logger","Flush()")` は Logger -> Logger : Flush() のメッセージ (行は呼んだ行)', function() {
    var p = SEQ.parseSequence(dslOf('local-proc'));
    var rels = p.relations.map(function(r) { return r.from + '>' + r.to + ':' + r.label + '@' + r.line; });
    expect(rels).toEqual(['Logger>Logger:Flush()@8', 'Logger>Logger:Write(VERSION)@9', 'Logger>Logger:Rotate()@10', 'Logger>Store:Close()@11']);
    // 本体の `$who` を参加者として読まない (参加者は Logger と Store だけ)
    expect(p.elements.filter(function(e) { return e.kind === 'participant'; }).map(function(e) { return e.id; })).toEqual(['Logger', 'Store']);
  });
  test('4 本とも枠が出て、Overlay マッチング失敗にならない', function() {
    var b = build('local-proc');
    expect(b.res.unmatched.message).toBe(0);
    b.parsed.relations.forEach(function(r) { expect(msgRect(b.out, r.id)).toBeTruthy(); });
    expect(textInside(b.svg, msgRect(b.out, b.parsed.relations[0].id), 'Flush()')).toBe(true);
    expect(textInside(b.svg, msgRect(b.out, b.parsed.relations[2].id), 'Rotate()')).toBe(true);
    expect(textInside(b.svg, msgRect(b.out, b.parsed.relations[3].id), 'Close()')).toBe(true);
  });
  test('呼び出し行はフォームの書換で壊さない (矢印の形でない行は元のまま)', function() {
    var dsl = dslOf('local-proc');
    expect(SEQ.updateMessage(dsl, 8, 'label', 'X')).toBe(dsl);
  });
  test('手続きの定義が無い呼び出し (!include 先) は今までどおり読まない', function() {
    var p = SEQ.parseSequence('@startuml\nparticipant A\n$log("A","x")\n@enduml\n');
    expect(p.relations.length).toBe(0);
  });
});

describe('BLK-builder-20260925-1835-2: \\l・\\r・<&icon>・文言の無いメッセージと return が並んでも順に当たる', function() {
  test('5 本とも枠が出て、Overlay マッチング失敗にならない', function() {
    var b = build('lbreak-sprite');
    expect(b.parsed.relations.length).toBe(5);
    expect(b.res.unmatched.message).toBe(0);
    b.parsed.relations.forEach(function(r) { expect(msgRect(b.out, r.id)).toBeTruthy(); });
  });
  test('文言に \\l を含むメッセージの枠が、描かれた 2 行目の文字を覆う', function() {
    var b = build('lbreak-sprite');
    var r = b.parsed.relations;
    expect(textInside(b.svg, msgRect(b.out, r[1].id), 'create token')).toBe(true);
    expect(textInside(b.svg, msgRect(b.out, r[0].id), 'POST /prod')).toBe(true);
    expect(textInside(b.svg, msgRect(b.out, r[4].id), 'bye')).toBe(true);
  });
  test('return には枠を出さない', function() {
    var b = build('lbreak-sprite');
    var ids = Array.prototype.map.call(b.out.querySelectorAll('rect[data-type="message"]'), function(e) { return e.getAttribute('data-id'); });
    ids.forEach(function(id) { expect(/^__m_\d+$/.test(id)).toBe(true); });
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
global.DOMParser = _prevParser;
