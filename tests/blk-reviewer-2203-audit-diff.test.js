'use strict';
// BLK-reviewer-20260907-2203: 監査の件数表示は「前回と同じ 5 件」でも中身が
// 入れ替わっていることがあり、監査ツール側にカテゴリが新設されても件数だけでは
// 気付けない。気付くのに raw JSON の全文 grep が要らないよう、前回 JSON との
// 差分を要約に出す。ここでその読み方を固定する。
const assert = require('assert');
const diff = require('../tools/audit-diff');
const report = require('../tools/audit-report');

function ok(result) { return { status: 'ok', result: result }; }

function consistency(over) {
  return ok(Object.assign({
    naming: [], unused: [], methods: [], granularity: [], events: [], count: 0,
  }, over || {}));
}

const EV_ADC = { event: 'Adc_Ack', cls: 'Adc_Driver', owner: 'Adc', kind: 'no-method', docs: ['primary/adc_state.puml'] };
const EV_SPI = { event: 'Spi_Ack', cls: 'Spi_Driver', owner: 'Spi', kind: 'no-method', docs: ['primary/spi_state.puml'] };

describe('指摘 1 件の id', function() {
  test('同じ指摘は、図の並び順が変わっても同じ id になる', function() {
    const a = diff.itemId('consistency.events', EV_ADC);
    const b = diff.itemId('consistency.events', Object.assign({}, EV_ADC, { docs: ['x.puml', 'primary/adc_state.puml'] }));
    assert.strictEqual(a, b);
  });

  test('別の指摘は別の id になる', function() {
    assert.notStrictEqual(diff.itemId('consistency.events', EV_ADC), diff.itemId('consistency.events', EV_SPI));
  });
});

describe('前回との差分', function() {
  test('中身が同じなら「増減なし」', function() {
    const a = { consistency: consistency({ events: [EV_ADC] }) };
    const d = diff.diff(a, a);
    assert.strictEqual(d.changed, false);
    assert.ok(diff.formatDiff(d, '前回').join('\n').indexOf('増減なし') >= 0);
  });

  test('件数が同じでも中身が入れ替わったら、そう書く', function() {
    const prev = { consistency: consistency({ events: [EV_ADC] }) };
    const cur = { consistency: consistency({ events: [EV_SPI] }) };
    const d = diff.diff(prev, cur);
    assert.strictEqual(d.added.length, 1);
    assert.strictEqual(d.removed.length, 1);
    assert.strictEqual(d.sameCount, true);
    const text = diff.formatDiff(d, '2026-09-07T20:03').join('\n');
    assert.ok(text.indexOf('件数は同じだが中身が入れ替わった') >= 0, text);
    assert.ok(text.indexOf('Spi_Ack') >= 0, text);
    assert.ok(text.indexOf('Adc_Ack') >= 0, text);
  });

  test('カテゴリが新設されたら、件数ではなくカテゴリ名で出る', function() {
    // 「イベント」カテゴリが無かった run と、ある run。
    const prev = { consistency: ok({ naming: [], unused: [], methods: [], granularity: [], count: 0 }) };
    const cur = { consistency: consistency({ events: [EV_ADC] }) };
    const d = diff.diff(prev, cur);
    assert.deepStrictEqual(d.newCategories, ['整合/イベント']);
    const text = diff.formatDiff(d, '前回').join('\n');
    assert.ok(text.indexOf('監査カテゴリが増えた') >= 0, text);
    assert.ok(text.indexOf('整合/イベント') >= 0, text);
  });

  test('カテゴリが減ったら、それも出る (--only で絞った run と区別が付く)', function() {
    const prev = { consistency: consistency({ events: [EV_ADC] }) };
    const cur = { consistency: ok({ naming: [], unused: [], methods: [], granularity: [], count: 0 }) };
    const d = diff.diff(prev, cur);
    assert.deepStrictEqual(d.goneCategories, ['整合/イベント']);
  });

  test('失敗した監査は「見ていない」扱いで、指摘 0 件とは区別する', function() {
    const prev = { consistency: consistency({ events: [EV_ADC] }) };
    const cur = { consistency: { status: 'error', message: 'boom' } };
    const d = diff.diff(prev, cur);
    assert.ok(d.goneCategories.indexOf('整合/イベント') >= 0);
    assert.strictEqual(d.removed.length, 1);
  });

  test('前回が無ければ「次回から比較します」と書く', function() {
    const text = diff.formatDiff(null).join('\n');
    assert.ok(text.indexOf('前回の監査結果が無いため') >= 0, text);
  });
});

describe('--summary の出力', function() {
  const REP = {
    generatedAt: '2026-09-07T22:03:00.000Z',
    targets: ['persona-data'], docs: ['a.puml'],
    audits: { consistency: consistency({ events: [EV_SPI] }) },
    summary: { consistency: { naming: 0, unused: 0, methods: 0, methodReplies: 0, granularity: 0, events: 1, count: 1 } },
    totalIssues: 1,
  };

  test('prev を渡さなければ、これまでどおり件数だけ', function() {
    const text = report.formatSummary(REP);
    assert.ok(text.indexOf('前回') < 0, text);
  });

  test('prev を渡すと件数の後ろに差分が付く', function() {
    const prev = {
      generatedAt: '2026-09-07T20:03:00.000Z',
      audits: { consistency: consistency({ events: [EV_ADC] }) },
    };
    const text = report.formatSummary(REP, prev);
    assert.ok(text.indexOf('合計 1 件') >= 0, text);
    assert.ok(text.indexOf('2026-09-07T20:03') >= 0, text);
    assert.ok(text.indexOf('中身が入れ替わった') >= 0, text);
  });

  test('prev に null を渡すと「前回なし」が出る (件数だけを見て同じと読ませない)', function() {
    assert.ok(report.formatSummary(REP, null).indexOf('次回から比較します') >= 0);
  });
});

describe('CLI の引数', function() {
  const cli = require('../tools/audit');
  test('--since と --no-state を受ける', function() {
    const o = cli.parseArgs(['dir', '--summary', '--since', 'old.json', '--no-state']);
    assert.strictEqual(o.since, 'old.json');
    assert.strictEqual(o.state, false);
    assert.strictEqual(o.summary, true);
  });

  test('--since=FILE の形でも受ける', function() {
    assert.strictEqual(cli.parseArgs(['dir', '--since=old.json']).since, 'old.json');
  });

  test('既定では控えを読み書きする', function() {
    const o = cli.parseArgs(['dir', '--summary']);
    assert.strictEqual(o.state, true);
    assert.strictEqual(o.since, null);
  });

  test('使い方に --since が載る', function() {
    assert.ok(cli.USAGE.indexOf('--since') >= 0);
  });
});
