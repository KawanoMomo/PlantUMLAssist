'use strict';
// BLK-reviewer-20260907-2303-wish: DSL が無変更でも監査ツール側が育つと、
// 同じ欠陥が別カテゴリへ移って件数が動く。「解消した」のか「分類が変わっただけ」
// なのかを、raw JSON を開かずに読めるようにする。ここでその読み方を固定する。
const assert = require('assert');
const TL = require('../src/core/audit-timeline');
const diff = require('../tools/audit-diff');

function ok(result) { return { status: 'ok', result: result }; }

function consistency(over) {
  return ok(Object.assign({
    naming: [], unused: [], methods: [], granularity: [], events: [], count: 0,
  }, over || {}));
}

// 同じ欠陥「Adc 系統の Adc_Ack」が、run によってメソッド突合に出たり
// 粒度に出たりする。書かれ方 (Adc_Driver / adc) も揃っていない。
const AS_METHOD = { kind: 'no-method', owner: 'Adc_Driver', method: 'Adc_Ack' };
const AS_GRAIN = { family: 'adc', label: 'Adc_Ack', onlyIn: 'primary/adc_state.puml' };
const SPI_METHOD = { kind: 'no-method', owner: 'Spi_Driver', method: 'Spi_Ack' };

const RUN_METHOD = { method: ok({ issues: [AS_METHOD, SPI_METHOD] }), consistency: consistency({}) };
const RUN_GRAIN = { method: ok({ issues: [SPI_METHOD] }), consistency: consistency({ granularity: [AS_GRAIN] }) };
const RUN_FIXED = { method: ok({ issues: [SPI_METHOD] }), consistency: consistency({}) };

describe('欠陥の実体 id', function() {
  test('カテゴリが違っても、同じ欠陥なら同じ実体 id になる', function() {
    assert.strictEqual(
      TL.entityId('method.issues', AS_METHOD),
      TL.entityId('consistency.granularity', AS_GRAIN));
  });

  test('別の欠陥は別の実体 id になる', function() {
    assert.notStrictEqual(
      TL.entityId('method.issues', AS_METHOD),
      TL.entityId('method.issues', SPI_METHOD));
  });

  test('指摘 1 件の id (カテゴリ内) はこれまでどおり分かれている', function() {
    assert.notStrictEqual(
      TL.itemId('method.issues', AS_METHOD),
      TL.itemId('consistency.granularity', AS_GRAIN));
  });

  test('画面に出す見出しは元の綴りを残す', function() {
    assert.strictEqual(TL.entityTitle('method.issues', AS_METHOD), 'Adc_Driver.Adc_Ack');
  });
});

describe('タイムライン', function() {
  test('カテゴリが移っただけなら「再分類」で、解消には数えない', function() {
    const t = TL.build([TL.snapshot(RUN_METHOD, { label: 'run1' }), TL.snapshot(RUN_GRAIN, { label: 'run2' })]);
    const row = t.rows.filter((r) => r.title.indexOf('Adc_Ack') >= 0)[0];
    assert.ok(row, '実体の行が無い');
    assert.strictEqual(row.status, '再分類');
    assert.strictEqual(row.cells[0].text, 'メソッド');
    assert.strictEqual(row.cells[1].text, '整合/粒度');
    assert.strictEqual(t.counts['解消'], 0);
    assert.strictEqual(t.counts['再分類'], 1);
  });

  test('本当に出なくなったら「解消」', function() {
    const t = TL.build([TL.snapshot(RUN_GRAIN, { label: 'run2' }), TL.snapshot(RUN_FIXED, { label: 'run3' })]);
    const row = t.rows.filter((r) => r.title.indexOf('Adc_Ack') >= 0)[0];
    assert.strictEqual(row.status, '解消');
    assert.strictEqual(row.cells[1], null);
    assert.strictEqual(t.counts['解消'], 1);
  });

  test('ずっと同じカテゴリなら「継続」', function() {
    const t = TL.build([TL.snapshot(RUN_METHOD, { label: 'run1' }), TL.snapshot(RUN_METHOD, { label: 'run2' })]);
    const row = t.rows.filter((r) => r.title.indexOf('Spi_Ack') >= 0)[0];
    assert.strictEqual(row.status, '継続');
    assert.strictEqual(row.moves, 0);
  });

  test('最後の run で初めて出たら「新規」', function() {
    const t = TL.build([TL.snapshot(RUN_FIXED, { label: 'run1' }), TL.snapshot(RUN_GRAIN, { label: 'run2' })]);
    const row = t.rows.filter((r) => r.title.indexOf('Adc_Ack') >= 0)[0];
    assert.strictEqual(row.status, '新規');
  });

  test('3 run 並べると、移った回数が数えられる', function() {
    const t = TL.build([RUN_METHOD, RUN_GRAIN, RUN_METHOD].map((a, i) => TL.snapshot(a, { label: 'run' + i })));
    const row = t.rows.filter((r) => r.title.indexOf('Adc_Ack') >= 0)[0];
    assert.strictEqual(row.moves, 2);
    assert.strictEqual(t.runs.length, 3);
  });

  test('要約は「解消 0 件 / 再分類 1 件」の形で、件数だけを見せない', function() {
    const t = TL.build([TL.snapshot(RUN_METHOD, { label: 'run1' }), TL.snapshot(RUN_GRAIN, { label: 'run2' })]);
    const line = TL.summaryLine(t);
    assert.ok(line.indexOf('解消 0 件') >= 0, line);
    assert.ok(line.indexOf('再分類 1 件') >= 0, line);
  });

  test('記録が 1 回だけなら、区別できないとはっきり書く', function() {
    const t = TL.build([TL.snapshot(RUN_METHOD, { label: 'run1' })]);
    assert.ok(TL.summaryLine(t).indexOf('2 回目から') >= 0);
  });

  test('監査カテゴリの増減も出る (DSL 無変更でも動く方)', function() {
    const before = { consistency: ok({ naming: [], unused: [], methods: [], granularity: [], count: 0 }) };
    const t = TL.build([TL.snapshot(before, { label: 'a' }), TL.snapshot(RUN_GRAIN, { label: 'b' })]);
    assert.ok(t.newCategories.indexOf('整合/イベント') >= 0, JSON.stringify(t.newCategories));
  });
});

describe('主語の取れない指摘', function() {
  // トレース漏れは系統名が空のことがあり、実体 id が `/adc_ack` の形になる。
  // 同じ目的語の主語付きが 1 つだけなら、同じ行に畳んで 1 つの欠陥として読む。
  const TRACE_NO_FAMILY = { trace: ok([{ family: '', missing: [{ from: 'Busy', to: 'Idle', label: 'Adc_Ack' }] }]) };

  test('主語なしの指摘は、同じ目的語の主語付きと同じ行に畳む', function() {
    const t = TL.build([TL.snapshot(RUN_METHOD, { label: 'r1' }), TL.snapshot(TRACE_NO_FAMILY, { label: 'r2' })]);
    const hit = t.rows.filter((r) => r.title.indexOf('Adc_Ack') >= 0);
    assert.strictEqual(hit.length, 1, JSON.stringify(t.rows.map((r) => r.title)));
    assert.strictEqual(hit[0].title, 'Adc_Driver.Adc_Ack');
    assert.strictEqual(hit[0].status, '再分類');
  });

  test('寄せ先の候補が 2 つ以上あれば畳まない (どちらに寄せても嘘になる)', function() {
    const two = {
      method: ok({ issues: [{ kind: 'no-method', owner: 'Adc', method: 'Ack' }, { kind: 'no-method', owner: 'Spi', method: 'Ack' }] }),
      trace: ok([{ family: '', missing: [{ from: 'A', to: 'B', label: 'Ack' }] }]),
    };
    const t = TL.build([TL.snapshot(two, { label: 'r1' })]);
    assert.strictEqual(t.rows.length, 3);
  });
});

describe('記録の積み方', function() {
  test('同じラベルの run は上書きして、行が 2 本に割れない', function() {
    let snaps = [];
    snaps = TL.push(snaps, TL.snapshot(RUN_METHOD, { label: 'run1' }));
    snaps = TL.push(snaps, TL.snapshot(RUN_GRAIN, { label: 'run1' }));
    assert.strictEqual(snaps.length, 1);
    assert.strictEqual(TL.build(snaps).runs.length, 1);
  });

  test('古い run は上限で落ちる', function() {
    let snaps = [];
    for (let i = 0; i < TL.MAX_SNAPSHOTS + 5; i++) snaps = TL.push(snaps, TL.snapshot(RUN_METHOD, { label: 'r' + i }));
    assert.strictEqual(snaps.length, TL.MAX_SNAPSHOTS);
    assert.strictEqual(snaps[0].label, 'r5');
  });
});

describe('CLI の --summary', function() {
  test('カテゴリが移っただけなら「解消」ではなく「再分類」と書く', function() {
    const d = diff.diff(RUN_METHOD, RUN_GRAIN);
    assert.strictEqual(d.moved.length, 1);
    assert.strictEqual(d.removed.length, 0);
    assert.strictEqual(d.added.length, 0);
    const text = diff.formatDiff(d, '前回').join('\n');
    assert.ok(text.indexOf('分類が変わっただけ') >= 0, text);
    assert.ok(text.indexOf('メソッド→整合/粒度') >= 0, text);
  });

  test('本当に消えた指摘は今までどおり「解消」に出る', function() {
    const d = diff.diff(RUN_GRAIN, RUN_FIXED);
    assert.strictEqual(d.removed.length, 1);
    assert.strictEqual(d.moved.length, 0);
    assert.ok(diff.formatDiff(d, '前回').join('\n').indexOf('解消') >= 0);
  });
});
