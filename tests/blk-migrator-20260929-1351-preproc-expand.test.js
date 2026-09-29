'use strict';
// BLK-migrator-20260929-1351: `!definelong RETRY(target)` を `RETRY(B)` で呼ぶと、描かれる B の自己メッセージにも、
// その後ろの `B --> A` にも選択枠が出ず、「⚠ 図の要素 3 個に選択枠を当てられませんでした」が出ていた (seq-36)。
// 直し方: マクロの種類ごとに DSL の読み方を足すのをやめ、同梱 jar のプリプロセッサ (POST /preproc) が展開した行を
// 全図種のパーサに読ませる。展開で生まれた行の行番号は呼んだ行に置く (src/core/preproc-expand.js)。
// fixtures/preproc/*.json は、目印を差し込んだ本文を plantuml 1.2026.8 の daemon に通した実際の応答。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

if (!global.window || !global.window.document) {
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
  var prevMA = global.window && global.window.MA;
  global.window = dom.window;
  if (prevMA) global.window.MA = prevMA;
  global.DOMParser = dom.window.DOMParser;
}
if (!global.document) global.document = global.window.document;
var document = global.window.document;

[
  'html-utils', 'dsl-utils', 'preproc-live', 'preproc-expand', 'note-edit', 'regex-parts', 'id-normalizer',
  'dsl-updater', 'text-updater', 'parser-utils', 'line-resolver',
  'overlay-builder', 'selection-router', 'sequence-participant-zone',
  'sequence-autonumber', 'sequence-activation-insert', 'outline',
].forEach(function(m) {
  try { delete require.cache[require.resolve('../src/core/' + m + '.js')]; } catch (e) {}
  try { require('../src/core/' + m + '.js'); } catch (e) {}
});
['sequence', 'class'].forEach(function(m) {
  try { delete require.cache[require.resolve('../src/modules/' + m + '.js')]; } catch (e) {}
  require('../src/modules/' + m + '.js');
});
try { delete require.cache[require.resolve('../src/ui/sequence-overlay.js')]; } catch (e) {}
require('../src/ui/sequence-overlay.js');

var window = global.window;
var PE = window.MA.preprocExpand;
var seq = window.MA.modules.plantumlSequence;
var cls = window.MA.modules.plantumlClass;
var overlay = window.MA.sequenceOverlay;

function read(dir, name, ext) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', dir, name + ext), 'utf8').replace(/\r\n/g, '\n');
}
function jarLines(name) { return JSON.parse(read('preproc', name, '.json')); }
function parseExpanded(mod, name) {
  var dsl = read('dsl', name, '.puml');
  PE.forget();
  PE.remember(dsl, jarLines(name));
  return { dsl: dsl, parsed: PE.parseWith(mod.parseSequence || mod.parse, dsl) };
}
function build(name, parsed, dsl) {
  var div = document.createElement('div');
  div.innerHTML = read('svg', name, '.svg');
  var overlayEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  var res = overlay.buildSequenceOverlay(div.querySelector('svg'), parsed, overlayEl, dsl);
  return { overlayEl: overlayEl, res: res };
}
function totalUnmatched(res) {
  var u = (res && res.unmatched) || {};
  return (u.participant || 0) + (u.message || 0) + (u.note || 0) + (u.activation || 0);
}
function msgLines(overlayEl) {
  return Array.prototype.map.call(overlayEl.querySelectorAll('rect[data-type="message"]'), function(r) {
    return r.getAttribute('data-line');
  }).filter(function(v, i, a) { return a.indexOf(v) === i; }).sort();
}

describe('BLK-migrator-20260929-1351 マクロは PlantUML の展開で読む', function() {
  test('目印: 元の行ごとに目印を差し込み、手続きの本体と行継ぎの次には差し込まない', function() {
    var t = ['@startuml', '!procedure $p($x)', '$x -> $x : m', '!endprocedure', 'A -> B : a \\', 'b', '$p(A)', '@enduml'].join('\n');
    var marked = PE.withMarks(t).split('\n');
    var marks = marked.filter(function(l) { return l.indexOf(PE.MARK) === 0; }).map(function(l) { return +l.split('§')[2]; });
    expect(marks).toEqual([1, 2, 5, 7, 8]);
  });

  test('目印から戻す: 展開後の各行は直前の目印の行 (呼んだ行) に付く', function() {
    var m = PE.mapBack(jarLines('seq-definelong-retry'));
    expect(m.map(function(x) { return x.line + ':' + x.text; })).toEqual([
      '0:@startuml', '5:participant A', '6:participant B', '7:A -> B : 送信', '8:B -> B : 再試行', '9:B --> A : 完了', '10:@enduml',
    ]);
  });

  test('展開を頼むのはマクロ・変数・include・%関数のある本文だけ', function() {
    expect(PE.needs(read('dsl', 'seq-definelong-retry', '.puml'))).toBe(true);
    expect(PE.needs('@startuml\n!$x = 1\nA -> B\n@enduml')).toBe(true);
    expect(PE.needs('@startuml\nA -> B : %upper("x")\n@enduml')).toBe(true);
    expect(PE.needs('@startuml\n!include foo.iuml\n@enduml')).toBe(true);
    expect(PE.needs('@startuml\nA -> B : hi\n@enduml')).toBe(false);
    expect(PE.needs('@startuml\n!ifdef X\nA -> B\n!endif\n@enduml')).toBe(false);
    expect(PE.needs("@startuml\n' !procedure in a comment\nA -> B\n@enduml")).toBe(false);
  });

  test('最小再現: RETRY(B) が描く自己メッセージは 8 行目、後ろの B --> A は 9 行目として読む', function() {
    var r = parseExpanded(seq, 'seq-definelong-retry');
    var msgs = r.parsed.relations.filter(function(x) { return x.kind === 'message'; });
    expect(msgs.map(function(x) { return x.from + '>' + x.to + ':' + x.label + '@' + x.line; })).toEqual([
      'A>B:送信@7', 'B>B:再試行@8', 'B>A:完了@9',
    ]);
    expect(msgs[1].expanded).toBe(true);
    expect(!!msgs[2].expanded).toBe(false);
  });

  test('最小再現: 枠は 7・8・9 行目のメッセージに付き、当て損ねの帯の元になる数は 0', function() {
    var r = parseExpanded(seq, 'seq-definelong-retry');
    var b = build('seq-definelong-retry', r.parsed, r.dsl);
    expect(totalUnmatched(b.res)).toBe(0);
    expect(msgLines(b.overlayEl)).toEqual(['7', '8', '9']);
  });

  test('展開が無ければ今の読み方のまま (RETRY(B) を矢印と読まない)', function() {
    PE.forget();
    var dsl = read('dsl', 'seq-definelong-retry', '.puml');
    var p = PE.parseWith(seq.parseSequence, dsl);
    expect(p.relations.filter(function(x) { return x.kind === 'message'; }).map(function(x) { return x.line; })).toEqual([7, 9]);
    expect(PE.has(dsl)).toBe(false);
  });

  test('seq-36: 変数・%関数・!definelong を展開して読み、枠なしが 0 (帯が出ない)', function() {
    var r = parseExpanded(seq, 'seq-36-definelong-variables-strfunc');
    var parts = r.parsed.elements.filter(function(e) { return e.kind === 'participant'; });
    expect(parts.map(function(e) { return e.id + '@' + e.line; })).toEqual(['A@8', 'B@9']);
    var msgs = r.parsed.relations.filter(function(x) { return x.kind === 'message'; });
    expect(msgs.map(function(x) { return x.line; })).toEqual([10, 12, 14, 15]);
    var b = build('seq-36-definelong-variables-strfunc', r.parsed, r.dsl);
    expect(totalUnmatched(b.res)).toBe(0);
    expect(msgLines(b.overlayEl)).toEqual(['10', '12', '14', '15']);
  });

  test('下端の件数: 差し替えた本文で数える (RETRY(B) の矢印も 1 本)', function() {
    var r = parseExpanded(seq, 'seq-definelong-retry');
    var sp = PE.splicedText(r.dsl);
    expect(sp.split('\n')).toContain('B -> B : 再試行');
    expect(window.MA.outline.build(sp).counts.relations).toBe(3);
  });

  test('行番号の戻し方: 差し替えで増えた行の後ろも元の行に戻り、描かれない枝 (deadLines) の行も戻る', function() {
    var dsl = ['@startuml', '!procedure $two($a)', '$a -> $a : one', '$a -> $a : two', '!endprocedure',
      '$two(A)', '!ifdef NOPE', 'A -> B : dead', '!endif', 'A -> B : tail', '@enduml'].join('\n');
    PE.forget();
    // 目印つき本文をプリプロセッサに通した形 (本体の 2 行は呼んだ 6 行目、!ifdef の枝は何も生まない)
    PE.remember(dsl, ['@startuml', PE.MARK + '2§', PE.MARK + '6§', 'A -> A : one', 'A -> A : two',
      PE.MARK + '7§', PE.MARK + '8§', PE.MARK + '9§', PE.MARK + '10§', 'A -> B : tail', PE.MARK + '11§', '@enduml']);
    var p = PE.parseWith(seq.parseSequence, dsl);
    var msgs = p.relations.filter(function(x) { return x.kind === 'message'; });
    expect(msgs.map(function(x) { return x.label + '@' + x.line; })).toEqual(['one@6', 'two@6', 'dead@8', 'tail@10']);
    expect(Object.keys(p.meta.deadLines || {})).toEqual(['8']);
  });

  test('1 行の !function ... !return は本体を開かない (後ろの行にも目印が付き、件数からも外れない)', function() {
    var t = ['@startuml', '!function $inc($a) !return $a + 1', 'A -> B : x', 'B -> A : y', '@enduml'].join('\n');
    var marks = PE.withMarks(t).split('\n').filter(function(l) { return l.indexOf(PE.MARK) === 0; });
    expect(marks.length).toBe(5);
    expect(window.MA.outline.build(t).counts.relations).toBe(2);
  });

  test('構造の件数: 手続きの本体の矢印は数えない (呼んだ行の展開だけが描かれる)', function() {
    var t = ['@startuml', '!procedure $p($x)', '$x -> $x : m', '!endprocedure', 'A -> B : a', '@enduml'].join('\n');
    expect(window.MA.outline.build(t).counts.relations).toBe(1);
  });

  test('server: POST /preproc の口があり、同梱 jar のプリプロセッサだけを使う (外へ送らない)', function() {
    var server = fs.readFileSync(path.join(__dirname, '..', 'server.py'), 'utf8');
    expect(server).toContain("if self.path == '/preproc':");
    expect(server).toContain("'-preproc', '-pipe'");
    expect(server.indexOf('def preproc_local(text')).toBeGreaterThan(-1);
    var body = server.slice(server.indexOf('def preproc_local(text'), server.indexOf('def _shutdown_daemon'));
    expect(/render_online|plantuml\.com|urlopen/.test(body)).toBe(false);
    var daemon = fs.readFileSync(path.join(__dirname, '..', 'lib', 'PlantUMLDaemon.java'), 'utf8');
    expect(daemon).toContain('PREPROC_MAGIC');
  });

  test('クラス図でも同じ: 手続きが宣言するクラスは呼んだ行のクラスとして読む', function() {
    var dsl = ['@startuml', '!procedure $drv($n)', 'class $n {', '  + Init()', '}', '!endprocedure',
      '$drv(SpiDrv)', 'class App', 'App --> SpiDrv', '@enduml'].join('\n');
    PE.forget();
    PE.remember(dsl, ['@startuml', PE.MARK + '2§', PE.MARK + '7§', 'class SpiDrv {', '  + Init()', '}',
      PE.MARK + '8§', 'class App', PE.MARK + '9§', 'App --> SpiDrv', PE.MARK + '10§', '@enduml']);
    var p = PE.parseWith(cls.parse, dsl);
    var spi = p.elements.filter(function(e) { return e.id === 'SpiDrv'; })[0];
    expect(!!spi).toBe(true);
    expect(spi.line).toBe(7);
    var app = p.elements.filter(function(e) { return e.id === 'App'; })[0];
    expect(app.line).toBe(8);
    expect(p.relations.map(function(r) { return r.line; })).toEqual([9]);
  });
  // 差し戻し 1 回目: `!while` の中の `participant "サービス$i" as S$i` を元の読み方が `S$i` 1 つと読み、展開後の
  // S1・S2 (・S3) に差し替えていなかった。描かれる参加者に枠が出ず「図の要素 4 個に選択枠を当てられません」の帯 (common-22)。
  test('!while で宣言した参加者: 展開で別の要素になる行は、元の読み方が読んでいても展開後の行を読む', function() {
    var r = parseExpanded(seq, 'seq-while-participants');
    var parts = r.parsed.elements.filter(function(e) { return e.kind === 'participant'; });
    expect(parts.map(function(e) { return e.id + ':' + e.label + '@' + e.line; })).toEqual(['S1:サービス1@4', 'S2:サービス2@4']);
    var b = build('seq-while-participants', r.parsed, r.dsl);
    expect(totalUnmatched(b.res)).toBe(0);
    var heads = Array.prototype.map.call(b.overlayEl.querySelectorAll('rect[data-type="participant"]'), function(x) {
      return x.getAttribute('data-id') + '@' + x.getAttribute('data-line');
    }).filter(function(v, i, a) { return a.indexOf(v) === i; }).sort();
    expect(heads).toEqual(['S1@4', 'S2@4']);
    expect(msgLines(b.overlayEl)).toEqual(['7']);
  });

  test('common-22: 変数・!if・!while・%関数の図で参加者 3 つとメッセージ 3 本に枠が出て、枠なしが 0', function() {
    var r = parseExpanded(seq, 'common-22-preproc-variables-conditions');
    var parts = r.parsed.elements.filter(function(e) { return e.kind === 'participant'; });
    expect(parts.map(function(e) { return e.id + '@' + e.line; })).toEqual(['S1@15', 'S2@15', 'S3@15']);
    var b = build('common-22-preproc-variables-conditions', r.parsed, r.dsl);
    expect(totalUnmatched(b.res)).toBe(0);
    expect(msgLines(b.overlayEl)).toEqual(['18', '19', '21']);
  });

  test('展開しても同じ要素になる行は元の書き方のまま読む (右パネルの名前は本文の書き方)', function() {
    var r = parseExpanded(seq, 'seq-36-definelong-variables-strfunc');
    var a = r.parsed.elements.filter(function(e) { return e.id === 'A'; })[0];
    expect(a.label).not.toBe('決済 画面');
    expect(!!a.expanded).toBe(false);
  });
});
