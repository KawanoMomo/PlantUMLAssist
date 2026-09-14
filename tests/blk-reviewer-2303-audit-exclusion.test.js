'use strict';
// BLK-reviewer-20260907-2303: --summary は「解消 / 再分類」を分けるようになったが
// (BLK-2303-wish)、除外バケツ (整合/メソッドの「応答として除外」・トレースの
// 「粒度違い / 宣言により対象外」) を 1 件も数えていないので、そこへ移った指摘は
// 今も「解消」に見える。手順 7 の「メソッド 5 → 0 (応答除外 7)」がまさにそれで、
// 区別するには JSON を書き出して consistency.methods / granularity /
// trace.outOfScope を個別に読む往復が要った。除外も数え、理由まで出す。
const assert = require('assert');
const diff = require('../tools/audit-diff');
const timeline = require('../src/core/audit-timeline');

function ok(result) { return { status: 'ok', result: result }; }

function consistency(over) {
  return ok(Object.assign({
    naming: [], unused: [], methods: [], methodReplies: [],
    granularity: [], events: [], count: 0,
  }, over || {}));
}

function traceFamily(over) {
  return Object.assign({
    family: 'spi', rows: [], missing: [], partial: [], outOfScope: [],
    comparable: true, seqDocs: [],
  }, over || {});
}

// 同じ欠陥。突合の対象だったものが「応答なので除外」へ移る。
const M_SPI = { doc: 'primary/spi_seq.puml', target: 'Spi_Driver', method: 'Spi_Ack' };
const M_ADC = { doc: 'primary/adc_seq.puml', target: 'Adc_Driver', method: 'Adc_Ack' };

describe('除外バケツも指摘として数える', function() {
  test('応答として除外した分が差分の対象になる', function() {
    const items = timeline.itemsOf({ consistency: consistency({ methodReplies: [M_SPI] }) });
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].category, '整合/メソッド(応答として除外)');
    assert.strictEqual(items[0].excluded, true);
  });

  test('粒度違いで外した遷移も差分の対象になり、理由を持つ', function() {
    const items = timeline.itemsOf({
      trace: ok([traceFamily({ outOfScope: [{ from: 'Idle', to: 'Busy', label: 'Spi_StartConv', reason: 'grain' }] })]),
    });
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].category, 'トレース/除外');
    assert.strictEqual(items[0].excluded, true);
    assert.strictEqual(items[0].reason, 'grain');
  });

  test('除外バケツを見た run と見ていない run が区別できる', function() {
    const seen = timeline.categoriesOf({ consistency: consistency({ methodReplies: [] }) });
    assert.ok(seen.indexOf('整合/メソッド(応答として除外)') >= 0);
    const old = timeline.categoriesOf({
      consistency: ok({ naming: [], unused: [], methods: [], granularity: [], events: [] }),
    });
    assert.ok(old.indexOf('整合/メソッド(応答として除外)') < 0);
  });

  test('突合対象と除外先は同じ実体 id になる (別物として並ばない)', function() {
    assert.strictEqual(
      timeline.entityId('consistency.methods', M_SPI),
      timeline.entityId('consistency.methodReplies', M_SPI));
    assert.strictEqual(
      timeline.entityId('trace.missing', { family: 'spi', label: 'Spi_StartConv' }),
      timeline.entityId('trace.outOfScope', { family: 'spi', label: 'Spi_StartConv' }));
  });

  test('別のメソッドなら実体 id も別', function() {
    assert.notStrictEqual(
      timeline.entityId('consistency.methods', M_SPI),
      timeline.entityId('consistency.methodReplies', M_ADC));
  });
});

describe('整合/メソッドの指摘 id', function() {
  test('対象クラスと図まで見る (全件が同じ id に潰れない)', function() {
    const a = timeline.itemId('consistency.methods', M_SPI);
    const b = timeline.itemId('consistency.methods',
      { doc: 'primary/gpio_seq.puml', target: 'Gpio_Driver', method: 'Spi_Ack' });
    assert.notStrictEqual(a, b);
    assert.strictEqual(a, timeline.itemId('consistency.methods', Object.assign({}, M_SPI)));
  });

  test('同じメソッド名でも図が違えば別の指摘として数える', function() {
    const p = { consistency: consistency({ methods: [M_SPI], count: 1 }) };
    const c = { consistency: consistency({
      methods: [M_SPI, { doc: 'primary/gpio_seq.puml', target: 'Spi_Driver', method: 'Spi_Ack' }], count: 2 }) };
    assert.strictEqual(diff.diff(p, c).added.length, 1);
  });
});

describe('除外先への移動', function() {
  const prev = { consistency: consistency({ methods: [M_SPI, M_ADC], count: 2 }) };
  const cur = { consistency: consistency({ methods: [], methodReplies: [M_SPI, M_ADC], count: 0 }) };

  test('突合対象 → 除外 は「解消」ではなく「再分類」として出る', function() {
    const d = diff.diff(prev, cur);
    assert.strictEqual(d.moved.length, 2);
    assert.strictEqual(d.added.length, 0);
    assert.strictEqual(d.removed.length, 0);
    assert.strictEqual(d.moved[0].toExcluded, true);
    assert.strictEqual(d.moved[0].to, '整合/メソッド(応答として除外)');
  });

  test('実体の増減が 0 の run は、件数表が動いた理由を先に言う', function() {
    const d = diff.diff(prev, cur);
    assert.strictEqual(d.onlyMoved, true);
    const text = diff.formatDiff(d, '2026-09-07T22:03').join('\n');
    assert.ok(text.indexOf('指摘の実体に増減なし') >= 0, text);
    assert.ok(text.indexOf('解消 2 件') < 0, text);
  });

  test('除外先のカテゴリ名に「除外」が二重に付かない', function() {
    const text = diff.formatDiff(diff.diff(prev, cur)).join('\n');
    assert.ok(text.indexOf('(応答として除外)(除外)') < 0, text);
    assert.ok(text.indexOf('整合/メソッド→整合/メソッド(応答として除外)') >= 0, text);
  });

  test('トレースの漏れ → 粒度違いで除外 は、理由まで出る', function() {
    const row = { from: 'Idle', to: 'Busy', label: 'Spi_StartConv' };
    const p = { trace: ok([traceFamily({ missing: [row] })]) };
    const c = { trace: ok([traceFamily({ outOfScope: [Object.assign({ reason: 'grain' }, row)] })]) };
    const d = diff.diff(p, c);
    assert.strictEqual(d.moved.length, 1);
    assert.strictEqual(d.moved[0].reason, 'grain');
    assert.ok(diff.formatDiff(d).join('\n').indexOf('トレース/除外(粒度違い)') >= 0);
  });

  test('宣言で対象外になった場合は理由がそう出る', function() {
    const row = { from: 'Idle', to: 'Busy', label: 'Spi_StartConv' };
    const p = { trace: ok([traceFamily({ missing: [row] })]) };
    const c = { trace: ok([traceFamily({ outOfScope: [Object.assign({ reason: 'declared' }, row)] })]) };
    assert.ok(diff.formatDiff(diff.diff(p, c)).join('\n').indexOf('トレース/除外(宣言により対象外)') >= 0);
  });

  test('本当に解消した指摘は今までどおり「解消」で、実体増減なしとは言わない', function() {
    const p = { consistency: consistency({ methods: [M_SPI, M_ADC], count: 2 }) };
    const c = { consistency: consistency({ methods: [M_SPI], count: 1 }) };
    const d = diff.diff(p, c);
    assert.strictEqual(d.moved.length, 0);
    assert.strictEqual(d.removed.length, 1);
    assert.strictEqual(d.onlyMoved, false);
    const text = diff.formatDiff(d).join('\n');
    assert.ok(text.indexOf('解消 1 件') >= 0, text);
    assert.ok(text.indexOf('指摘の実体に増減なし') < 0, text);
  });

  test('再分類と本当の新規が混ざったら、実体増減なしとは言わない', function() {
    const p = { consistency: consistency({ methods: [M_SPI, M_ADC], count: 2 }) };
    const c = { consistency: consistency({
      methods: [], methodReplies: [M_SPI, M_ADC],
      events: [{ event: 'Can_Ack', cls: 'Can_Driver' }], count: 1,
    }) };
    const d = diff.diff(p, c);
    assert.strictEqual(d.moved.length, 2);
    assert.strictEqual(d.added.length, 1);
    assert.strictEqual(d.onlyMoved, false);
    const text = diff.formatDiff(d).join('\n');
    assert.ok(text.indexOf('新規 1 件') >= 0, text);
    assert.ok(text.indexOf('分類が変わっただけ') >= 0, text);
  });
});
