'use strict';
// BLK-reviewer-20260908-0003 「手書き指摘の根拠を毎回確かめ直す」。
//
// 手で書いた指摘は audit.js のどの監査にも当たらないので、根拠が消えても
// 「DSL 無変更 → 前回のまま」で引き継がれ続ける。根拠を 1 行の決まった書き方で
// 残せば、受信箱を開くたびに崩れた根拠だけが名指しで出る。
var assert = require('assert');
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

['../src/core/claim-check.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var CC = global.window.MA.claimCheck;

var SEQ_WITHOUT = [
  '@startuml', 'participant Spi_Driver', 'participant DmaCtrl',
  'Spi_Driver -> DmaCtrl : Spi_Transmit()', '@enduml',
].join('\n');
var SEQ_WITH = [
  '@startuml', 'participant Spi_Driver', 'participant DmaCtrl',
  'Spi_Driver -> DmaCtrl : Spi_Transmit()',
  'Spi_Driver -> DmaCtrl : Spi_Reset()', '@enduml',
].join('\n');
var STATE = [
  '@startuml',
  "' @pin 1|open|reviewer|2026-09-08T00:03|Error --> Idle : Spi_Reset|" +
    '対応するリセットフローが無い / 根拠: dma_transfer_sequence に Spi_Reset が無い',
  '[*] --> Idle', 'Idle --> Busy : Spi_Start', 'Error --> Idle : Spi_Reset',
  '@enduml',
].join('\n');

var ITEM = {
  doc: 'dma_state', id: '1', author: 'reviewer', state: 'open', line: 5,
  text: '対応するリセットフローが無い / 根拠: dma_transfer_sequence に Spi_Reset が無い',
};

var tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

test('本文の末尾に書いた「根拠: X に Y が無い」を拾う', function() {
  var c = CC.parse(ITEM.text);
  assert.strictEqual(c.doc, 'dma_transfer_sequence');
  assert.strictEqual(c.token, 'Spi_Reset');
  assert.strictEqual(c.expect, 'absent');
});

test('「ある」も拾い、全角コロンでも書ける', function() {
  var c = CC.parse('遷移が二重定義されている / 根拠：dma_state に Error --> Idle がある');
  assert.strictEqual(c.doc, 'dma_state');
  assert.strictEqual(c.token, 'Error --> Idle');
  assert.strictEqual(c.expect, 'present');
});

test('根拠を書いていない指摘は対象外 (今までどおり手で読む)', function() {
  assert.strictEqual(CC.parse('粒度がそろっていない'), null);
  assert.strictEqual(CC.parse(''), null);
  assert.strictEqual(CC.parse(null), null);
});

test('根拠が立っていれば ok', function() {
  var docs = [
    { name: 'dma_state', dsl: STATE },
    { name: 'dma_transfer_sequence', dsl: SEQ_WITHOUT },
  ];
  var r = CC.check(docs, CC.parse(ITEM.text));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.actual, 'absent');
});

test('根拠の図に語が書かれたら崩れたと言う (今回の見落としそのもの)', function() {
  var docs = [
    { name: 'dma_state', dsl: STATE },
    { name: 'dma_transfer_sequence', dsl: SEQ_WITH },
  ];
  var res = CC.scan([ITEM], docs);
  assert.strictEqual(res.claims.length, 1);
  assert.strictEqual(res.broken.length, 1);
  assert.strictEqual(res.broken[0].result.line, 5);
  assert.ok(CC.describe(res.broken[0]).indexOf('L5') >= 0);
  assert.ok(CC.describe(res.broken[0]).indexOf('無いことが根拠だった') >= 0);
  assert.ok(CC.headText(res).indexOf('根拠が崩れた 1 件') >= 0);
});

test('指摘ピンのコメント行は根拠に数えない', function() {
  // dma_state 自身に Spi_Reset の指摘ピンがあるが、根拠は本文の行だけを見る。
  var docs = [{ name: 'dma_state', dsl: ["@startuml",
    "' @pin 1|open|reviewer|t|a|Spi_Reset が無い", '@enduml'].join('\n') }];
  var claim = CC.parse('根拠: dma_state に Spi_Reset が無い');
  assert.strictEqual(CC.check(docs, claim).ok, true);
});

test('根拠の図が保存フォルダに無ければ「確かめられない」と言う', function() {
  var res = CC.scan([ITEM], [{ name: 'dma_state', dsl: STATE }]);
  assert.strictEqual(res.broken.length, 1);
  assert.strictEqual(res.broken[0].result.missing, true);
  assert.ok(CC.describe(res.broken[0]).indexOf('保存フォルダに無い') >= 0);
});

test('根拠を持つ指摘が 0 件なら、その旨を言う', function() {
  var res = CC.scan([{ doc: 'a', id: '1', text: '粒度がそろっていない' }], []);
  assert.strictEqual(res.claims.length, 0);
  assert.strictEqual(res.broken.length, 0);
  assert.strictEqual(CC.headText(res), '根拠付きの指摘はありません');
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
