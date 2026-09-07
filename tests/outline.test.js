'use strict';
// ランナーは全テストを 1 プロセスで動かす。global.window を差し替えると
// 先に読み込まれたモジュールが載っている window ごと消えるので、既にあれば使う。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/dsl-utils.js')]; } catch (e) {}
require('../src/core/dsl-utils.js');
try { delete require.cache[require.resolve('../src/core/outline.js')]; } catch (e) {}
require('../src/core/outline.js');
var ol = global.window.MA.outline;

var assert = require('assert');

// design「リデザイン案」1a の構造タブに出ているサンプルそのもの。
var SAMPLE_SEQ = [
  '@startuml',
  'title Sample Sequence',
  'actor User',
  'participant System',
  'database DB',
  'User -> System : Request',
  'System -> DB : Query',
  'DB --> System : Result',
  'System --> User : Response',
  '@enduml',
].join('\n');

function kinds(res) { return res.nodes.map(function(n) { return n.kind; }); }
function labels(res) { return res.nodes.map(function(n) { return n.label; }); }

describe('MA.outline', () => {
  test('サンプルの数え方が design の 3 elements · 4 relations と一致する', () => {
    var r = ol.build(SAMPLE_SEQ);
    assert.strictEqual(r.counts.elements, 3);
    assert.strictEqual(r.counts.relations, 4);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(ol.summary(r), 'パース OK · 3 elements · 4 relations');
  });


  test('title は要素にも関係にも数えないが行としては出る', () => {
    var r = ol.build(SAMPLE_SEQ);
    assert.strictEqual(r.nodes[0].kind, 'title');
    assert.strictEqual(r.nodes[0].label, 'Sample Sequence');
    assert.strictEqual(r.nodes[0].line, 1);
  });


  test('宣言の種別を actor / participant / database の別なく拾う', () => {
    var r = ol.build(SAMPLE_SEQ);
    assert.deepStrictEqual(kinds(r).slice(0, 5),
      ['title', 'actor', 'participant', 'participant', 'relation']);
  });


  test('関係の行番号は DSL 上の実位置 (0 始まり)', () => {
    var r = ol.build(SAMPLE_SEQ);
    var rels = r.nodes.filter(function(n) { return n.kind === 'relation'; });
    assert.deepStrictEqual(rels.map(function(n) { return n.line; }), [5, 6, 7, 8]);
    assert.strictEqual(rels[0].detail, 'Request');
  });


  test('"表示名" as Alias は表示名をラベル、別名を detail に出す', () => {
    var r = ol.build('@startuml\nparticipant "GPIO ドライバ" as GpioDrv\n@enduml');
    assert.strictEqual(r.nodes[0].label, 'GPIO ドライバ');
    assert.strictEqual(r.nodes[0].detail, 'GpioDrv');
  });


  test('alt / else / end の入れ子で depth が上下する', () => {
    var r = ol.build([
      '@startuml',
      'A -> B : ping',
      'alt ok',
      '  B --> A : pong',
      'else ng',
      '  B --> A : err',
      'end',
      'A -> B : bye',
      '@enduml',
    ].join('\n'));
    var d = r.nodes.map(function(n) { return n.depth; });
    // ping(0) alt(0) pong(1) else(0) err(1) bye(0)
    assert.deepStrictEqual(d, [0, 0, 1, 0, 1, 0]);
    assert.strictEqual(r.ok, true);
  });


  test('閉じられていないブロックはパースエラーとして出る', () => {
    var r = ol.build('@startuml\nalt ok\nA -> B : x\n@enduml');
    assert.strictEqual(r.ok, false);
    assert.ok(/alt/.test(r.errors[0].message));
    assert.ok(/パース NG/.test(ol.summary(r)));
  });


  test('対応する開始のない end もエラーにする', () => {
    var r = ol.build('@startuml\nA -> B : x\nend\n@enduml');
    assert.strictEqual(r.ok, false);
    assert.ok(/対応する開始のない/.test(r.errors[0].message));
  });


  test('@startuml / @enduml が無ければエラーにする', () => {
    var r = ol.build('A -> B : x');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.errors.length, 2);
  });


  test('skinparam などの見た目指定は構造に出さない', () => {
    var r = ol.build('@startuml\nskinparam monochrome true\nhide footbox\nA -> B : x\n@enduml');
    assert.deepStrictEqual(kinds(r), ['relation']);
  });


  test('コメント行は無視する', () => {
    var r = ol.build("@startuml\n' actor Ghost\nactor User\n@enduml");
    assert.deepStrictEqual(labels(r), ['User']);
  });


  test('状態遷移図: state 宣言と [*] からの遷移を拾う', () => {
    var r = ol.build([
      '@startuml',
      'state Idle',
      'state "実行中" as Running',
      '[*] --> Idle',
      'Idle --> Running : start [ready] / init()',
      '@enduml',
    ].join('\n'));
    assert.deepStrictEqual(kinds(r), ['state', 'state', 'relation', 'relation']);
    assert.strictEqual(r.nodes[1].label, '実行中');
    assert.strictEqual(r.counts.elements, 2);
    assert.strictEqual(r.counts.relations, 2);
  });


  test('クラス図: class 宣言と継承・関連を拾う', () => {
    var r = ol.build([
      '@startuml',
      'abstract class Driver',
      'class SpiDrv',
      'interface ICan',
      'Driver <|-- SpiDrv',
      'SpiDrv ..> ICan : uses',
      '@enduml',
    ].join('\n'));
    assert.strictEqual(r.counts.elements, 3);
    assert.strictEqual(r.counts.relations, 2);
  });


  test('コンポーネント図: component と -() のインタフェース記法を拾う', () => {
    var r = ol.build([
      '@startuml',
      'component CanDrv',
      'interface ICan',
      'CanDrv -- ICan : provide',
      '@enduml',
    ].join('\n'));
    assert.strictEqual(r.counts.elements, 2);
    assert.strictEqual(r.counts.relations, 1);
  });


  test('ユースケース図: (UC) と :Actor: の記法をラベルにほどく', () => {
    var r = ol.build([
      '@startuml',
      ':Tester: --> (CanInit)',
      '@enduml',
    ].join('\n'));
    assert.strictEqual(r.nodes[0].kind, 'relation');
    assert.ok(r.nodes[0].label.indexOf('Tester') === 0);
    assert.ok(/CanInit/.test(r.nodes[0].label));
  });


  test('アクティビティ図: :処理; と if/endif を拾う', () => {
    var r = ol.build([
      '@startuml',
      'start',
      ':初期化;',
      'if (成功?) then (yes)',
      '  :送信;',
      'endif',
      'stop',
      '@enduml',
    ].join('\n'));
    // `:処理;` は状態ではなくアクション (design 4b は actions と数える)
    assert.deepStrictEqual(kinds(r), ['lifeline', 'action', 'block', 'action', 'lifeline']);
    assert.strictEqual(r.nodes[2].detail, '成功?');
    assert.strictEqual(r.nodes[3].depth, 1);
    assert.strictEqual(r.ok, true);
  });


  test('note の 1 行形式は閉じ扱いにしない', () => {
    var r = ol.build([
      '@startuml',
      'A -> B : x',
      'note right : 備考',
      '@enduml',
    ].join('\n'));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.nodes[1].kind, 'note');
    assert.strictEqual(r.nodes[1].detail, '備考');
  });


  test('note ... end note の複数行形式は end note で閉じる', () => {
    var r = ol.build([
      '@startuml',
      'A -> B : x',
      'note right of B',
      '  備考',
      'end note',
      '@enduml',
    ].join('\n'));
    assert.strictEqual(r.ok, true);
  });


  test('activate / deactivate は lifeline として出し要素には数えない', () => {
    var r = ol.build([
      '@startuml',
      'A -> B : x',
      'activate B',
      'deactivate B',
      '@enduml',
    ].join('\n'));
    assert.strictEqual(r.counts.elements, 0);
    assert.strictEqual(r.counts.relations, 1);
    assert.strictEqual(r.nodes[1].kind, 'lifeline');
    assert.strictEqual(r.nodes[1].detail, 'B');
  });


  test('filter はラベルと detail の部分一致で絞る (大小無視)', () => {
    var r = ol.build(SAMPLE_SEQ);
    var hit = ol.filter(r.nodes, 'query');
    assert.strictEqual(hit.length, 1);
    assert.strictEqual(hit[0].line, 6);
    assert.strictEqual(ol.filter(r.nodes, 'USER').length, 3);
  });


  test('filter は空文字なら全件返す', () => {
    var r = ol.build(SAMPLE_SEQ);
    assert.strictEqual(ol.filter(r.nodes, '').length, r.nodes.length);
    assert.strictEqual(ol.filter(r.nodes, '   ').length, r.nodes.length);
  });


  test('filter はヒットした行を囲むブロック行を文脈として残す', () => {
    var r = ol.build([
      '@startuml',
      'alt ok',
      '  A --> B : pong',
      'end',
      '@enduml',
    ].join('\n'));
    var hit = ol.filter(r.nodes, 'pong');
    assert.deepStrictEqual(hit.map(function(n) { return n.label; }), ['alt', 'A --> B']);
  });


  test('空の DSL でも落ちない', () => {
    var r = ol.build('');
    assert.strictEqual(r.nodes.length, 0);
    assert.strictEqual(r.counts.elements, 0);
    assert.strictEqual(ol.build(null).nodes.length, 0);
    assert.strictEqual(ol.build(undefined).counts.relations, 0);
  });


  test('CRLF の DSL でもラベルに \\r が混ざらない', () => {
    var r = ol.build('@startuml\r\nactor User\r\n@enduml\r\n');
    assert.strictEqual(r.nodes[0].label, 'User');
    assert.strictEqual(r.ok, true);
  });

});
