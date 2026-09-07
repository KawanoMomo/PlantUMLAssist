'use strict';
// BLK-primary-20260908-0003-wish 「参照関係グラフ」。
//
// 願望: 14 枚 + 新規 1 枚を 1 プロジェクトとして渡し、部品名を選ぶと
// その名前で繋がっている他の図が出る。ここでは束から「図をまたぐ部品名」と
// 「図と図の繋がり」を組み立てる純関数側を検証する。
var assert = require('assert');
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

[
  '../src/core/regex-parts.js',
  '../src/core/dsl-utils.js',
  '../src/core/name-audit.js',
  '../src/core/xref-graph.js',
].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var XG = global.window.MA.xrefGraph;

var SPI = [
  '@startuml',
  'participant Spi_Driver',
  'participant DmaCtrl',
  'Spi_Driver -> DmaCtrl : Spi_TransmitDma',
  '@enduml',
].join('\n');
var CAN = [
  '@startuml',
  'participant Can_Driver',
  'participant DmaCtrl',
  'Can_Driver -> DmaCtrl : Can_Write',
  '@enduml',
].join('\n');
var CLS = [
  '@startuml',
  'class Spi_Driver',
  'class Can_Driver',
  'Spi_Driver --> DmaCtrl',
  '@enduml',
].join('\n');

var DOCS = [
  { id: 'd1', name: 'spi', diagramType: 'plantuml-sequence', dsl: SPI },
  { id: 'd2', name: 'can', diagramType: 'plantuml-sequence', dsl: CAN },
  { id: 'd3', name: 'driver_common_class', diagramType: 'plantuml-class', dsl: CLS },
];

var tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

test('図をまたぐ部品名だけが shared に並び、多く跨ぐものが先', function() {
  var g = XG.build(DOCS);
  var names = g.shared.map(function(n) { return n.name; });
  // DmaCtrl は 3 枚、Can_Driver と Spi_Driver は 2 枚。枚数の多い順、同数は名前順。
  assert.deepStrictEqual(names, ['DmaCtrl', 'Can_Driver', 'Spi_Driver']);
  assert.strictEqual(g.counts.docs, 3);
  // Spi_TransmitDma のような 1 枚にしか出ない語は辿る手掛かりにならない。
  assert.strictEqual(names.indexOf('Spi_TransmitDma'), -1);
});

test('名前ごとに、どの図の何行目に出るかと宣言の有無が付く', function() {
  var g = XG.build(DOCS);
  var e = XG.forName(g, 'DmaCtrl');
  assert.strictEqual(e.docCount, 3);
  var spi = e.docs.filter(function(d) { return d.name === 'spi'; })[0];
  assert.strictEqual(spi.id, 'd1');
  assert.strictEqual(spi.line, 3);          // participant DmaCtrl
  assert.strictEqual(spi.declared, true);
  var cls = e.docs.filter(function(d) { return d.name === 'driver_common_class'; })[0];
  assert.strictEqual(cls.declared, false);  // 矢印にだけ出てくる
  assert.strictEqual(cls.line, 4);
});

test('othersOf は今開いている図を除いた行き先を返す', function() {
  var g = XG.build(DOCS);
  var others = XG.othersOf(g, 'DmaCtrl', 'spi').map(function(d) { return d.name; });
  assert.deepStrictEqual(others.sort(), ['can', 'driver_common_class']);
  assert.deepStrictEqual(XG.othersOf(g, '存在しない名前', 'spi'), []);
});

test('図と図の繋がりは、共有している名前をまとめて 1 本になる', function() {
  var g = XG.build(DOCS);
  var link = g.links.filter(function(l) {
    return l.a === 'driver_common_class' && l.b === 'spi';
  })[0];
  assert.ok(link, '2 枚の間に辺がある');
  assert.deepStrictEqual(link.names.sort(), ['DmaCtrl', 'Spi_Driver']);
  // 3 枚それぞれの組で辺が立つ。
  assert.strictEqual(g.links.length, 3);
});

test('部分一致では繋がらない (Spi_Driver と Spi_Driver_Ex は別)', function() {
  var docs = [
    { id: 'a', name: 'a', diagramType: 'plantuml-sequence', dsl: SPI },
    {
      id: 'b', name: 'b', diagramType: 'plantuml-class',
      dsl: '@startuml\nclass Spi_Driver_Ex\n@enduml',
    },
  ];
  var g = XG.build(docs);
  assert.strictEqual(XG.forName(g, 'Spi_Driver').docCount, 1);
  assert.strictEqual(g.shared.length, 0);
});

test('toText は図一覧・またぐ名前・繋がりを 1 枚のテキストにする', function() {
  var txt = XG.toText(XG.build(DOCS));
  assert.ok(txt.indexOf('## 図をまたぐ部品名') >= 0);
  assert.ok(txt.indexOf('- DmaCtrl (3 枚):') >= 0);
  assert.ok(txt.indexOf('driver_common_class*') >= 0, '宣言なしには * が付く');
  assert.ok(txt.indexOf('⇄') >= 0);
  assert.ok(txt.indexOf('- spi (sequence)') >= 0);
});

test('図が 0 枚でも壊れない', function() {
  var g = XG.build([]);
  assert.strictEqual(g.counts.docs, 0);
  assert.strictEqual(XG.summaryLine(g), '図がありません');
  assert.ok(XG.toText(g).indexOf('- なし') >= 0);
});

var failed = 0;
tests.forEach(function(t) {
  try {
    t.fn();
    console.log('  ok - ' + t.name);
  } catch (e) {
    failed++;
    console.log('  FAIL - ' + t.name + ': ' + e.message);
  }
});
global.window = prevWindow;
global.document = prevDocument;
console.log((tests.length - failed) + '/' + tests.length + ' passed');
if (failed) process.exit(1);
