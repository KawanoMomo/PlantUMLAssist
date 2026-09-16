'use strict';
// BLK-primary-20260917-0123-wish: 不具合対応の入口で、◈依存グラフは「今どの図が
// 絡むか」までは出すが「いつこの記述に変わったか」を答えない。影響 6 図を 1 枚ずつ
// 開いて中身を目で追うしかなかった。ここでは、影響一覧の版履歴を 1 本の時系列に
// 混ぜ、症状の語で絞り、「ここで書き換わった」版を名指しできることを固定する。

var W = (typeof window !== 'undefined' && window) || global.window;
var DVS = W.MA.depVersionSearch;
var assert = require('assert');

function uml(lines) { return ['@startuml'].concat(lines, ['@enduml']).join('\n'); }

// spi_init_sequence の変遷。
//  版1: Spi_Driver を Hal 経由で初期化 (この語はここで生まれる)
//  版2: 関係ない行が増えるだけ (Spi_Driver の行は動かない)
//  版3: 初期化の呼び先が Hal から PowerCtrl に変わる ← 症状に効く書き換え
var SPI_V1 = uml(['participant Spi_Driver', 'participant Hal', 'Spi_Driver -> Hal : init']);
var SPI_V2 = uml(['participant Spi_Driver', 'participant Hal', 'Spi_Driver -> Hal : init',
                  "note over Hal : 見出し"]);
var SPI_V3 = uml(['participant Spi_Driver', 'participant PowerCtrl',
                  'Spi_Driver -> PowerCtrl : init', "note over PowerCtrl : 見出し"]);

// adc_state: Spi_Driver は一度も出ない図 (絞り込みで落ちるべき)。
var ADC_V1 = uml(['[*] --> Idle', 'Idle --> Busy : AdcDrv.start']);

// dma_class: 途中の版で Spi_Driver が消える図 (いつ消えたかが答えになる)。
var DMA_V1 = uml(['class DmaCtrl', 'DmaCtrl --> Spi_Driver : notify']);
var DMA_V2 = uml(['class DmaCtrl', 'DmaCtrl --> EventBus : notify']);

// version-timeline.rows() と同じ形 (新しい順)。at は ISO 文字列。
function ver(rev, at, dsl, added, removed) {
  return {
    rev: rev, at: at, label: '', dsl: dsl,
    lines: dsl.split('\n').length, added: added, removed: removed,
  };
}

var HISTORY = {
  spi_init_sequence: [
    ver(3, '2026-09-16T10:00:00.000Z', SPI_V3, 2, 2),
    ver(2, '2026-09-15T10:00:00.000Z', SPI_V2, 1, 0),
    ver(1, '2026-09-14T10:00:00.000Z', SPI_V1, 5, 0),
  ],
  adc_state: [ver(1, '2026-09-15T12:00:00.000Z', ADC_V1, 4, 0)],
  dma_class: [
    ver(2, '2026-09-16T08:00:00.000Z', DMA_V2, 1, 1),
    ver(1, '2026-09-13T08:00:00.000Z', DMA_V1, 4, 0),
  ],
};

function historyOf(name) { return HISTORY[name] || []; }

// dep-graph.impactDocs() の戻りと同じ形。
var IMPACT = [
  { doc: 'spi_init_sequence', hop: 0, via: ['Spi_Driver'] },
  { doc: 'dma_class', hop: 1, via: ['DmaCtrl'] },
  { doc: 'adc_state', hop: 2, via: ['Hal'] },
];

describe('BLK-primary-20260917-0123 影響先の版履歴を症状の語で絞る', function() {

  test('語に当たらない図は一覧から落ちる', function() {
    var rows = DVS.search(IMPACT, historyOf, 'Spi_Driver');
    var docs = rows.map(function(r) { return r.doc; });
    assert.ok(docs.indexOf('adc_state') < 0, 'Spi_Driver が一度も出ない図が残っている');
    assert.ok(docs.indexOf('spi_init_sequence') >= 0);
  });

  test('当たった版だけが残り、当たり行が行番号つきで付く', function() {
    var rows = DVS.search([IMPACT[0]], historyOf, 'Spi_Driver');
    assert.strictEqual(rows.length, 3, '3 版すべてに Spi_Driver がある');
    rows.forEach(function(r) {
      assert.ok(r.hitCount > 0, '当たり 0 行の版が残っている');
      r.hits.forEach(function(h) {
        assert.ok(h.line >= 1);
        assert.ok(h.text.toLowerCase().indexOf('spi_driver') >= 0);
      });
    });
  });

  test('大文字小文字は無視する（spi_driver で Spi_Driver を拾う）', function() {
    var rows = DVS.search([IMPACT[0]], historyOf, 'spi_driver');
    assert.strictEqual(rows.length, 3);
  });

  test('並びは新しい順（直近の変化から遡って読む）', function() {
    var rows = DVS.search(IMPACT, historyOf, 'Spi_Driver');
    for (var i = 1; i < rows.length; i++) {
      assert.ok(rows[i - 1].at >= rows[i].at, '新しい順になっていない');
    }
  });

  test('当たり行が書き換わった版だけ changed になる（増減 0 でも拾う）', function() {
    var rows = DVS.search([IMPACT[0]], historyOf, 'Spi_Driver');
    var byRev = {};
    rows.forEach(function(r) { byRev[r.rev] = r; });
    // 版2 は note が 1 行増えただけで Spi_Driver の行は動いていない。
    assert.strictEqual(byRev[2].changed, false, '関係ない行の増減を変化と読んでいる');
    // 版3 は呼び先が Hal → PowerCtrl に変わった = 症状に効く書き換え。
    assert.strictEqual(byRev[3].changed, true, '当たり行の書き換えを見落としている');
    // 版1 は語が生まれた版。
    assert.strictEqual(byRev[1].changed, true);
    assert.strictEqual(byRev[1].appeared, true);
    assert.strictEqual(byRev[1].first, true);
  });

  test('「今の形になった版」を 1 つだけ名指しする', function() {
    var rows = DVS.search([IMPACT[0]], historyOf, 'Spi_Driver');
    var marked = rows.filter(function(r) { return r.becameCurrent; });
    assert.strictEqual(marked.length, 1, 'becameCurrent が 1 版に決まらない');
    assert.strictEqual(marked[0].rev, 3, '一番新しい書き換えが選ばれていない');
  });

  test('語が消えた版は「ここで消えた」として残す', function() {
    var rows = DVS.search([IMPACT[1]], historyOf, 'Spi_Driver');
    var v2 = rows.filter(function(r) { return r.rev === 2; })[0];
    assert.ok(v2, '消えた版が一覧から落ちている');
    assert.strictEqual(v2.vanished, true);
    assert.strictEqual(v2.changed, true);
    assert.strictEqual(v2.hitCount, 0);
  });

  test('changedOnly で、変化の無い版を畳める', function() {
    var all = DVS.search([IMPACT[0]], historyOf, 'Spi_Driver');
    var only = DVS.search([IMPACT[0]], historyOf, 'Spi_Driver', { changedOnly: true });
    assert.strictEqual(all.length, 3);
    assert.strictEqual(only.length, 2, '変化の無い版が畳まれていない');
    only.forEach(function(r) { assert.strictEqual(r.changed, true); });
  });

  test('語が空なら絞り込まず、全図の版が時系列で並ぶ', function() {
    var rows = DVS.search(IMPACT, historyOf, '');
    assert.strictEqual(rows.length, 6, '全 6 版が並ばない');
    rows.forEach(function(r) { assert.strictEqual(r.hitCount, 0); });
  });

  test('最初に開く 1 枚は、いちばん最近その語が書き換わった図', function() {
    var rows = DVS.search(IMPACT, historyOf, 'Spi_Driver');
    var first = DVS.firstToOpen(rows);
    assert.ok(first);
    // dma_class 版2 (09/16 08:00) より spi_init_sequence 版3 (09/16 10:00) が新しい。
    assert.strictEqual(first.doc, 'spi_init_sequence');
    assert.strictEqual(first.rev, 3);
  });

  test('図ごとのまとめは、最後に書き換わった図から並ぶ', function() {
    var rows = DVS.search(IMPACT, historyOf, 'Spi_Driver');
    var docs = DVS.byDoc(rows);
    assert.deepStrictEqual(docs.map(function(d) { return d.doc; }),
      ['spi_init_sequence', 'dma_class']);
    assert.strictEqual(docs[0].versions, 3);
    assert.strictEqual(docs[0].changed, 2);
    assert.strictEqual(docs[0].hop, 0);
  });

  test('影響一覧が持つ hop と経由した名前を、版の行まで運ぶ', function() {
    var rows = DVS.search(IMPACT, historyOf, 'Spi_Driver');
    var dma = rows.filter(function(r) { return r.doc === 'dma_class'; })[0];
    assert.strictEqual(dma.hop, 1);
    assert.deepStrictEqual(dma.via, ['DmaCtrl']);
  });

  test('1 件も当たらない語では、次の手が言われる', function() {
    var rows = DVS.search(IMPACT, historyOf, 'NoSuchName');
    assert.strictEqual(rows.length, 0);
    var t = DVS.summaryText(rows, 'NoSuchName', 3);
    assert.ok(t.indexOf('NoSuchName') >= 0);
    assert.ok(t.indexOf('ありません') >= 0);
  });

  test('見出しは、図数・版数と最新の変化の在り処を言う', function() {
    var rows = DVS.search(IMPACT, historyOf, 'Spi_Driver');
    var t = DVS.summaryText(rows, 'Spi_Driver', 3);
    assert.ok(t.indexOf('2 図') >= 0, t);
    // spi 3 版 + dma 2 版 (消えた版も「いつ消えたか」の答えなので残る)。
    assert.ok(t.indexOf('5 版') >= 0, t);
    assert.ok(t.indexOf('spi_init_sequence') >= 0, t);
  });

  test('行の説明は、その版が並ぶ理由を言い切る', function() {
    var rows = DVS.search([IMPACT[0]], historyOf, 'Spi_Driver');
    var byRev = {};
    rows.forEach(function(r) { byRev[r.rev] = r; });
    assert.ok(DVS.rowText(byRev[1]).indexOf('ここで現れた') >= 0);
    assert.ok(DVS.rowText(byRev[2]).indexOf('変化なし') >= 0);
    assert.ok(DVS.rowText(byRev[3]).indexOf('ここで書き換わった') >= 0);
    var dma = DVS.search([IMPACT[1]], historyOf, 'Spi_Driver');
    var v2 = dma.filter(function(r) { return r.rev === 2; })[0];
    assert.ok(DVS.rowText(v2).indexOf('ここで消えた') >= 0);
  });

  test('履歴がまだ無い図が混ざっても落ちない', function() {
    var rows = DVS.search([{ doc: 'unknown_doc', hop: 0, via: [] }], historyOf, 'Spi_Driver');
    assert.deepStrictEqual(rows, []);
    var broken = DVS.search(IMPACT, function() { throw new Error('読めない'); }, 'Spi_Driver');
    assert.deepStrictEqual(broken, []);
  });

  test('時刻の見出しは MM/DD HH:MM に畳む', function() {
    assert.ok(/^\d{2}\/\d{2} \d{2}:\d{2}$/.test(DVS.atLabel('2026-09-16T10:00:00.000Z')));
    assert.strictEqual(DVS.atLabel(''), '');
  });
});
