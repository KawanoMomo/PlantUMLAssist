'use strict';
// BLK-primary-20260909-0703-wish: 症状検索で 6 図が当たったあと、当たった図を
// 1 枚ずつ開いて「シーケンスの Spi_TransmitDma に対応する状態が状態遷移図に
// あるか」を目で突き合わせていた。ここでは当たった語をキーにした自動突合が、
// 矛盾のある図だけを浮かせ、対応済みの図を「開かなくてよい」と言えることを固定する。
const assert = require('assert');
if (!global.window) global.window = global;
['../src/core/impact-scan.js', '../src/core/symptom-search.js', '../src/core/symptom-flow.js']
  .forEach(function(p) {
    try { delete require.cache[require.resolve(p)]; } catch (e) {}
    require(p);
  });
var sf = global.window.MA.symptomFlow;

var SYMPTOM = 'DMA転送がSpi_TransmitDmaのメッセージ付近で止まる';

var DMA_SEQ = [
  '@startuml',
  'title dma_transfer_sequence',
  'participant Spi_Driver',
  'participant Dma_Ctrl',
  'Spi_Driver -> Dma_Ctrl : Spi_TransmitDma',
  'Dma_Ctrl -> Spi_Driver : Dma_FaultNotify',
  '@enduml',
].join('\n');

var DMA_STATE = [
  '@startuml',
  'title dma_state',
  'state Idle',
  'state Transmitting_Dma',
  'Idle --> Transmitting_Dma : Spi_TransmitDma',
  'Transmitting_Dma --> Idle : TransferComplete',
  '@enduml',
].join('\n');

var DMA_CLASS = [
  '@startuml',
  'class Dma_Ctrl',
  'class Spi_Driver',
  'Spi_Driver --> Dma_Ctrl',
  '@enduml',
].join('\n');

var DOCS = [
  { id: 1, name: 'dma_transfer_sequence', dsl: DMA_SEQ },
  { id: 2, name: 'dma_state', dsl: DMA_STATE },
  { id: 3, name: 'plantuml-class', dsl: DMA_CLASS },
];

function rowOf(x, name) {
  return x.rows.filter(function(r) { return r.name === name; })[0];
}

// --- 取り出し ---------------------------------------------------------------
(function messagesAndPoints() {
  var msgs = sf.messages(DMA_SEQ).map(function(m) { return m.name; });
  assert.deepStrictEqual(msgs, ['Spi_TransmitDma', 'Dma_FaultNotify']);

  var pts = sf.statePoints(DMA_STATE);
  var states = pts.filter(function(p) { return p.role === 'state'; }).map(function(p) { return p.name; });
  var trans = pts.filter(function(p) { return p.role === 'transition'; }).map(function(p) { return p.name; });
  assert.ok(states.indexOf('Idle') >= 0, '状態名 Idle を取れる');
  assert.ok(states.indexOf('Transmitting_Dma') >= 0, '状態名 Transmitting_Dma を取れる');
  assert.deepStrictEqual(trans, ['Spi_TransmitDma', 'TransferComplete']);
  // クラス図の矢印はメッセージではない (突合の材料にしない)
  assert.deepStrictEqual(sf.messages(DMA_CLASS).map(function(m) { return m.name; }), ['Dma_Ctrl']);
})();

// --- 名前の対応 -------------------------------------------------------------
(function sameName() {
  assert.ok(sf.same('Spi_TransmitDma', 'Spi_TransmitDma'), '完全一致');
  assert.ok(sf.same('Spi_TransmitDma', 'spi transmit dma'), '区切りと大小の違いは同じ名前');
  assert.ok(sf.same('Spi_TransmitDma', 'Await_TransmitDma'), '特徴語の共有で結ぶ');
  assert.ok(!sf.same('Dma_FaultNotify', 'TransferComplete'), '無関係な名前は結ばない');
  // 一般動詞だけの共有では結ばない (Init だけで全部が対応済みになるのを防ぐ)
  assert.ok(!sf.same('Spi_Init', 'Can_Init'), '一般動詞の共有だけでは結ばない');
  assert.ok(!sf.same('Spi_Complete', 'Adc_Complete'), 'Complete の共有だけでは結ばない');
})();

// --- 当たった語に絡む流れだけを見る -----------------------------------------
(function related() {
  var terms = global.window.MA.symptomSearch.terms(SYMPTOM);
  assert.ok(sf.relatedTerms('Spi_TransmitDma', terms).length > 0, '症状の語に絡む');
  assert.strictEqual(sf.relatedTerms('Watchdog_Reset', terms).length, 0, '症状と無関係な流れは見ない');
})();

// --- 突合 -------------------------------------------------------------------
(function crossGaps() {
  var x = sf.cross(DOCS, SYMPTOM);

  // 対応の無い流れを持つ図だけが浮く。先頭が gap であること (並びが「浮かせる」順)。
  assert.strictEqual(x.rows[0].status, 'gap');
  assert.strictEqual(x.gapDocs, 1);

  var seq = rowOf(x, 'dma_transfer_sequence');
  assert.strictEqual(seq.status, 'gap');
  assert.deepStrictEqual(seq.gaps.map(function(g) { return g.name; }), ['Dma_FaultNotify']);
  assert.strictEqual(seq.gaps[0].line, 6, '欠落した流れの行が分かる');
  // 対応が取れた分は相手の図まで名指しできる
  assert.strictEqual(seq.ok.length, 1);
  assert.strictEqual(seq.ok[0].name, 'Spi_TransmitDma');
  assert.strictEqual(seq.ok[0].toDoc, 'dma_state');

  // 対応が全部付いた図は「開かなくてよい」side に落ちる
  var st = rowOf(x, 'dma_state');
  assert.strictEqual(st.status, 'ok');
  assert.strictEqual(st.gapCount, 0);
  assert.ok(st.note.indexOf('開かなくてよい') >= 0);

  // 流れを持たない図は突合対象外と言い切る (黙って落とさない)
  var cls = rowOf(x, 'plantuml-class');
  assert.strictEqual(cls.status, 'skip');
  assert.ok(cls.note.indexOf('クラス図') >= 0);

  assert.strictEqual(sf.headline(x),
    '3 図中 1 図に対応の無い流れ / 1 図は対応済み (開かなくてよい) / 1 図は対象外');
})();

// --- 片側しか当たっていないときは、突合できないと言う -----------------------
(function crossOneSided() {
  var x = sf.cross([DOCS[0], DOCS[2]], SYMPTOM);
  assert.strictEqual(x.stateCount, 0);
  assert.strictEqual(x.gapDocs, 0, '相手がいないだけの図を欠落として叩かない');
  assert.ok(sf.headline(x).indexOf('突合できません') >= 0);
  var seq = rowOf(x, 'dma_transfer_sequence');
  assert.strictEqual(seq.status, 'skip');
  assert.ok(seq.note.indexOf('状態遷移図') >= 0);
})();

// --- 症状検索に当たらない図は突合にも出さない -------------------------------
(function crossOnlyHits() {
  var UNRELATED = ['@startuml', 'title can_state', 'state CanIdle',
    'CanIdle --> CanIdle : Can_Wakeup', '@enduml'].join('\n');
  var x = sf.cross(DOCS.concat([{ id: 4, name: 'can_state', dsl: UNRELATED }]), SYMPTOM);
  assert.strictEqual(rowOf(x, 'can_state'), undefined, '症状に当たらない図は列に出ない');
})();

// --- 症状文が空なら何も言わない ---------------------------------------------
(function crossEmpty() {
  var x = sf.cross(DOCS, '');
  assert.deepStrictEqual(x.rows, []);
  assert.ok(sf.headline(x).indexOf('症状を貼ると') >= 0);
})();

console.log('blk-primary-0703-wish-symptom-flow: ok');
