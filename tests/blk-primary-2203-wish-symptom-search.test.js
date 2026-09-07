'use strict';
// BLK-primary-20260907-2203-wish: 症状文からの関連図サジェスト。
// 「DMA 転送の Fault 通知でリトライが動かない」を貼るだけで、部品名を自分で
// 思い付かなくても関連図にたどり着けることをここで固定する。
const assert = require('assert');
if (!global.window) global.window = global;
try { delete require.cache[require.resolve('../src/core/impact-scan.js')]; } catch (e) {}
require('../src/core/impact-scan.js');
try { delete require.cache[require.resolve('../src/core/symptom-search.js')]; } catch (e) {}
require('../src/core/symptom-search.js');
var ss = global.window.MA.symptomSearch;

var SYMPTOM = 'DMA転送のFault通知でリトライが動かない';

var SEQ_DMA = [
  '@startuml',
  'title SPI DMA 転送',
  'participant Spi_Driver',
  'participant Dma_Ctrl',
  'Spi_Driver -> Dma_Ctrl : Spi_TransmitDma',
  'Dma_Ctrl -> Spi_Driver : Fault',
  'Spi_Driver -> Spi_Driver : Notify',
  '@enduml',
].join('\n');

var STATE_RETRY = [
  '@startuml',
  '[*] --> Idle',
  'state Retrying',
  'Idle --> Retrying : Fault',
  'Retrying --> Idle : TransferComplete',
  '@enduml',
].join('\n');

var CLS_OTHER = [
  '@startuml',
  'class Adc_Driver',
  'class Adc_Buffer',
  'Adc_Driver --> Adc_Buffer',
  '@enduml',
].join('\n');

var DOCS = [
  { id: 'd1', name: 'seq_dma.puml', dsl: SEQ_DMA },
  { id: 'd2', name: 'state_retry.puml', dsl: STATE_RETRY },
  { id: 'd3', name: 'cls_adc.puml', dsl: CLS_OTHER },
];

function run(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { console.log('  FAIL - ' + name + ': ' + e.message); process.exitCode = 1; }
}

console.log('BLK-primary-2203-wish symptom-search');

run('症状文から語を取る。助詞・活用のひらがなは語にしない', function() {
  var t = ss.terms(SYMPTOM);
  assert.ok(t.indexOf('DMA') >= 0, 'DMA: ' + t.join(','));
  assert.ok(t.indexOf('Fault') >= 0);
  assert.ok(t.indexOf('転送') >= 0);
  assert.ok(t.indexOf('通知') >= 0);
  assert.ok(t.indexOf('リトライ') >= 0);
  t.forEach(function(x) { assert.ok(!/^[ぁ-ん]+$/.test(x), 'ひらがな語が混じった: ' + x); });
});

run('同じ語は 1 度だけ。大小文字違いも 1 語', function() {
  var t = ss.terms('Fault fault FAULT の Fault');
  assert.strictEqual(t.length, 1, t.join(','));
});

run('1 文字の語は取らない', function() {
  assert.deepStrictEqual(ss.terms('図が出ない'), []);
});

run('識別子を照合できる粒に割る', function() {
  var p = ss.parts('Spi_TransmitDma').map(function(x) { return x.toLowerCase(); });
  assert.ok(p.indexOf('spi') >= 0, p.join(','));
  assert.ok(p.indexOf('transmit') >= 0, p.join(','));
  assert.ok(p.indexOf('dma') >= 0, p.join(','));
});

run('DSL から宣言名・矢印ラベル・title を拾う', function() {
  var ix = ss.index(SEQ_DMA);
  var texts = ix.map(function(e) { return e.text; });
  assert.ok(texts.indexOf('Spi_Driver') >= 0, texts.join(','));
  assert.ok(texts.indexOf('Spi_TransmitDma') >= 0, texts.join(','));
  assert.ok(texts.indexOf('SPI DMA 転送') >= 0, texts.join(','));
  var title = ix.filter(function(e) { return e.role === 'title'; })[0];
  assert.strictEqual(title.line, 2);
});

run('コメント行と @startuml は照合対象にしない', function() {
  var ix = ss.index(['@startuml', "' Fault の説明", 'class A', '@enduml'].join('\n'));
  assert.deepStrictEqual(ix.map(function(e) { return e.text; }), ['A']);
});

run('症状文を貼るだけで関連図が関連度順に並ぶ', function() {
  var rows = ss.search(DOCS, SYMPTOM);
  assert.strictEqual(rows.length, 2, '無関係な図が混じった: ' + rows.map(function(r) { return r.name; }).join(','));
  assert.strictEqual(rows[0].name, 'seq_dma.puml');
  assert.strictEqual(rows[1].name, 'state_retry.puml');
  assert.ok(rows[0].score > rows[1].score);
});

run('当たった語と行番号が出る (その行へ運べる)', function() {
  var top = ss.search(DOCS, SYMPTOM)[0];
  var terms = top.hits.map(function(h) { return h.term; });
  assert.ok(terms.indexOf('DMA') >= 0, terms.join(','));
  assert.ok(terms.indexOf('Fault') >= 0, terms.join(','));
  top.hits.forEach(function(h) {
    assert.ok(h.line >= 1, '行番号が無い: ' + h.term);
    assert.ok(h.label, '役割の表示名が無い: ' + h.term);
  });
});

run('宣言はラベルより重い', function() {
  var decl = ss.scoreDoc(['@startuml', 'class Retry', '@enduml'].join('\n'), ['Retry']);
  var lab = ss.scoreDoc(['@startuml', 'A -> B : Retry', '@enduml'].join('\n'), ['Retry']);
  assert.ok(decl.score > lab.score, decl.score + ' vs ' + lab.score);
});

run('図種が出る (シーケンス図か状態遷移図か)', function() {
  var rows = ss.search(DOCS, SYMPTOM);
  assert.strictEqual(rows[0].kindLabel, 'シーケンス図');
  assert.strictEqual(rows[1].kindLabel, '状態遷移図');
});

run('当たらなかった語を出す (症状文の語を足す手掛かり)', function() {
  var ov = ss.overview(DOCS, 'DMA転送のWatchdogリセット');
  assert.strictEqual(ov.docs, 1);
  assert.ok(ov.missed.indexOf('Watchdog') >= 0, ov.missed.join(','));
});

run('症状文が空なら 0 件 (打ち込み前に候補を出さない)', function() {
  assert.deepStrictEqual(ss.search(DOCS, ''), []);
  assert.deepStrictEqual(ss.search(DOCS, '   '), []);
});

run('部分一致は 3 文字以上の語だけ', function() {
  var d = [{ id: 'x', name: 'x.puml', dsl: ['@startuml', 'class TransferComplete', '@enduml'].join('\n') }];
  assert.strictEqual(ss.search(d, 'Transfer が終わらない').length, 1);
  // 2 文字の語で部分一致させると無関係な図が大量に当たる
  assert.strictEqual(ss.search(d, 'Tr が終わらない').length, 0);
});
