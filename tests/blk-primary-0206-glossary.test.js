'use strict';
// BLK-primary-20260913-0206-wish: 顧客向け資料化のための社内略語辞書。
// 14 枚横断で「略語 → 正式名称」の表を 1 画面で作り、確定すると全図に当たり、
// 当てたあとは「残存略語 0」が表で言える、を固定する。
const assert = require('assert');
if (!global.window) global.window = global;
['../src/core/bulk-rename.js', '../src/core/glossary.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
});
require('../src/core/bulk-rename.js');
require('../src/core/glossary.js');
var BR = window.MA.bulkRename;
var G = window.MA.glossary;

// primary の 14 枚のうちの 3 枚 (社内略語が混ざった状態)。
var DOCS = [
  { id: 'd1', name: 'spi_init_sequence', dsl: [
    '@startuml', 'title SPI 初期化', 'participant SpiDrv', 'participant IRQCtrl',
    'SpiDrv -> IRQCtrl : enable', 'IRQCtrl --> SpiDrv : ack', '@enduml'].join('\n') },
  { id: 'd2', name: 'dma_init_sequence', dsl: [
    '@startuml', 'participant DmaCtrl', 'participant SpiDrv',
    'DmaCtrl -> SpiDrv : ready', '@enduml'].join('\n') },
  { id: 'd3', name: 'driver_common_class', dsl: [
    '@startuml', 'class Spi_Driver', 'class Hal', 'Spi_Driver --> Hal', '@enduml'].join('\n') },
];

// --- 洗い出し: 何が社内略語かを機械が決める -----------------------------------
(function scan() {
  var rows = G.scan(DOCS);
  var terms = rows.map(function(r) { return r.term; });
  assert.ok(terms.indexOf('SpiDrv') >= 0, terms.join(','));
  assert.ok(terms.indexOf('IRQCtrl') >= 0, terms.join(','));
  assert.ok(terms.indexOf('DmaCtrl') >= 0, terms.join(','));
  // 既に正式名称になっている語と、略語でない語は表に出さない
  // (表が長くなると「洗い出し」がまた目視になる)。
  assert.strictEqual(terms.indexOf('Spi_Driver'), -1, terms.join(','));
  assert.strictEqual(terms.indexOf('Hal'), -1, terms.join(','));

  // 出現の多い順。SpiDrv は 3 枚中 2 枚に 5 回。
  assert.strictEqual(rows[0].term, 'SpiDrv');
  assert.strictEqual(rows[0].count, 5);
  assert.strictEqual(rows[0].docs, 2);
})();

// --- 正式名称の既定値: 打鍵そのものを消す -------------------------------------
(function suggestion() {
  assert.strictEqual(G.suggest('SpiDrv'), 'Spi_Driver');
  assert.strictEqual(G.suggest('IRQCtrl'), 'IRQ_Controller');
  assert.strictEqual(G.suggest('DmaCtrl'), 'Dma_Controller');
  assert.strictEqual(G.suggest('TimerCfg'), 'Timer_Config');
  // 頭字語だけの略語は機械で言い換えを決められない。当てずっぽうを入れない。
  assert.strictEqual(G.suggest('DMA'), '');
  assert.ok(G.abbrevOf('DMA'));
  assert.strictEqual(G.abbrevOf('Spi_Driver'), null);
  assert.strictEqual(G.abbrevOf(''), null);
  assert.strictEqual(G.abbrevOf(null), null);
})();

// --- 確定: 表の行がそのまま置換の組になる -------------------------------------
(function pairs() {
  var p = G.pairs([
    { term: 'SpiDrv', to: 'Spi_Driver' },
    { term: 'IRQCtrl', to: '  IRQ_Controller  ' },   // 前後の空白は落とす
    { term: 'DmaCtrl', to: '' },                     // 未設定は当てない
    { term: 'AdcDrv', to: 'AdcDrv' },                // 同じ綴りは当てない
    { term: 'PwmDrv', to: 'Pwm Driver' },            // DSL が壊れる綴りは当てない
  ]);
  assert.deepStrictEqual(p, [
    { from: 'SpiDrv', to: 'Spi_Driver' },
    { from: 'IRQCtrl', to: 'IRQ_Controller' },
  ]);
  assert.deepStrictEqual(G.unset([
    { term: 'SpiDrv', to: 'Spi_Driver' }, { term: 'DmaCtrl', to: '' },
  ]), ['DmaCtrl']);
})();

// --- 保証: 当てたあと「残っていない」を目視ではなく表で言う -------------------
(function guarantee() {
  var entries = G.scan(DOCS).map(function(r) { return { term: r.term, to: r.suggestion }; });
  // 頭字語以外は既定値が入るので、この表は打鍵 0 で確定できる。
  assert.deepStrictEqual(G.unset(entries), []);

  var applied = DOCS.map(function(d) {
    var dsl = d.dsl;
    G.pairs(entries).forEach(function(p) { dsl = BR.replaceIn(dsl, p.from, p.to); });
    return { id: d.id, name: d.name, dsl: dsl };
  });

  var terms = entries.map(function(e) { return e.term; });
  assert.deepStrictEqual(G.remaining(applied, terms), []);
  assert.strictEqual(G.verdict({ remaining: [], unset: [] }),
    '残存略語 0 件。顧客向けに出せます');

  // 当てる前は残っている (判定が常に 0 を言うわけではない)。
  var before = G.remaining(DOCS, terms);
  assert.ok(before.length === 3, JSON.stringify(before));
  assert.ok(/残存略語 \d+ 件/.test(G.verdict({ remaining: before, unset: [] })));

  // 表に入れなかった略語は「0 件」に混ぜず、未設定として名指しする。
  assert.strictEqual(G.verdict({ remaining: [], unset: ['DMA'] }),
    '残存略語 0 件。正式名称が未設定の略語が 1 件あります (DMA)');

  // 未設定のまま図に残っている略語は、残存として数えたうえで理由も名指しする
  // (残っているものを 0 件と言わない)。
  assert.strictEqual(
    G.verdict({ remaining: [{ term: 'DMA', count: 2, docs: 1 }], unset: ['DMA'] }),
    '残存略語 2 件 (DMA)。うち正式名称が未設定の略語が 1 件あります (DMA)');

  // 置換後の本文に正式名称が入っている。
  assert.ok(applied[0].dsl.indexOf('participant Spi_Driver') >= 0, applied[0].dsl);
  assert.ok(applied[0].dsl.indexOf('IRQ_Controller') >= 0, applied[0].dsl);
  assert.strictEqual(applied[1].dsl.indexOf('DmaCtrl'), -1, applied[1].dsl);
})();

console.log('blk-primary-0206-glossary: ok');
