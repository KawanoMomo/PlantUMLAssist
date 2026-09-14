'use strict';
// BLK-reviewer-20260914-1306-wish: 指摘 1 件ごとに「対象ファイル・行 / 初出 tick /
// 解消 tick」を時系列で並べる台帳。手順1 (前回 BLK を再実行するか) と
// 手順8 (前回の指摘が反映されたか) が、audit.js を叩き直さずに読めることを固定する。
const assert = require('assert');
const TL = require('../src/core/audit-timeline');
const FL = require('../src/core/finding-ledger');

function ok(result) { return { status: 'ok', result: result }; }

function consistency(over) {
  return ok(Object.assign({
    naming: [], unused: [], methods: [], granularity: [], events: [], count: 0,
  }, over || {}));
}

// 同じ欠陥「Gpio_Driver.Gpio_Ack」が gpio_init_sequence.puml に出続け、
// 3 tick 目で消える。Spi 側は最後まで残る (未解消)。
const GPIO = { kind: 'no-method', owner: 'Gpio_Driver', method: 'Gpio_Ack', docs: ['gpio_init_sequence.puml'] };
const SPI = { kind: 'no-method', owner: 'Spi_Driver', method: 'Spi_Ack', docs: ['spi_init_sequence.puml'] };

const R1 = { method: ok({ issues: [GPIO, SPI] }), consistency: consistency({}) };
const R2 = { method: ok({ issues: [GPIO, SPI] }), consistency: consistency({}) };
const R3 = { method: ok({ issues: [SPI] }), consistency: consistency({}) };

const DOCS = [
  { name: 'gpio_init_sequence.puml', dsl: ['@startuml', 'participant Gpio_Driver', 'Gpio_Driver -> Gpio_Hw : Gpio_Ack', '@enduml'].join('\n') },
  { name: 'spi_init_sequence.puml', dsl: ['@startuml', 'participant Spi_Driver', 'Spi_Driver -> Spi_Hw : Spi_Ack', '@enduml'].join('\n') },
];

function view(runs, docs) {
  return FL.build({
    snapshots: runs.map((a, i) => TL.snapshot(a, { label: 'tick' + (i + 1) })),
    docs: docs === undefined ? DOCS : docs,
  });
}

describe('指摘の台帳', function() {
  test('指摘 1 件が 1 行になり、初出 tick を持つ', function() {
    const v = view([R1, R2, R3]);
    const gpio = v.rows.filter((r) => r.title.indexOf('Gpio_Ack') >= 0)[0];
    assert.ok(gpio, JSON.stringify(v.rows.map((r) => r.title)));
    assert.strictEqual(gpio.since, 'tick1');
  });

  test('解消した指摘は、消えた tick を解消 tick として持つ', function() {
    const v = view([R1, R2, R3]);
    const gpio = v.rows.filter((r) => r.title.indexOf('Gpio_Ack') >= 0)[0];
    assert.strictEqual(gpio.open, false);
    assert.strictEqual(gpio.resolvedAt, 'tick3');
    assert.strictEqual(gpio.ticks, 2);
  });

  test('最新 tick に出ている指摘は未解消のまま', function() {
    const v = view([R1, R2, R3]);
    const spi = v.rows.filter((r) => r.title.indexOf('Spi_Ack') >= 0)[0];
    assert.strictEqual(spi.open, true);
    assert.strictEqual(spi.resolvedAt, null);
    assert.strictEqual(spi.ticks, 3);
  });

  test('対象ファイルと、本文でその綴りが出る行が出る', function() {
    const v = view([R1, R2, R3]);
    const gpio = v.rows.filter((r) => r.title.indexOf('Gpio_Ack') >= 0)[0];
    assert.deepStrictEqual(gpio.where, [{ doc: 'gpio_init_sequence.puml', line: 3 }]);
    assert.strictEqual(FL.whereText(gpio), 'gpio_init_sequence.puml:3');
  });

  test('本文が手元に無ければ、行は 0 にして 1 行目と偽らない', function() {
    const v = view([R1], []);
    const gpio = v.rows.filter((r) => r.title.indexOf('Gpio_Ack') >= 0)[0];
    assert.strictEqual(gpio.where[0].line, 0);
    assert.strictEqual(FL.whereText(gpio), 'gpio_init_sequence.puml');
  });

  test('tick ごとの出欠が 1 本の記号列で読める', function() {
    const v = view([R1, R2, R3]);
    const gpio = v.rows.filter((r) => r.title.indexOf('Gpio_Ack') >= 0)[0];
    assert.strictEqual(gpio.spark, '●●○');
  });

  test('手順1 は「2 tick 以上続いている未解消」がそのまま答えになる', function() {
    const v = view([R1, R2, R3]);
    const carried = FL.carriedOver(v).map((r) => r.title);
    assert.strictEqual(carried.length, 1);
    assert.ok(carried[0].indexOf('Spi_Ack') >= 0, carried[0]);
  });

  test('要約は未解消 / 今回初出 / 解消済みを分けて言う', function() {
    const v = view([R1, R2, R3]);
    const line = FL.summaryLine(v);
    assert.ok(line.indexOf('未解消 1 件') >= 0, line);
    assert.ok(line.indexOf('解消済み 1 件') >= 0, line);
  });

  test('記録が無ければ、その旨を書いて空の表を出さない', function() {
    const v = view([]);
    assert.strictEqual(v.rows.length, 0);
    assert.ok(FL.summaryLine(v).indexOf('記録がありません') >= 0);
  });

  test('指摘.md に貼れる文面が、継続 / 今回初出 / 解消に分かれて出る', function() {
    const md = FL.markdown(view([R1, R2, R3]), '指摘の台帳');
    assert.ok(md.indexOf('## 継続（1 件）') >= 0, md);
    assert.ok(md.indexOf('## 解消（1 件）') >= 0, md);
    assert.ok(md.indexOf('spi_init_sequence.puml:3') >= 0, md);
    assert.ok(md.indexOf('解消 tick3') >= 0, md);
  });

  test('古い指摘が上に来る (時系列)', function() {
    const late = { method: ok({ issues: [SPI, { kind: 'no-method', owner: 'Can_Driver', method: 'Can_Ack', docs: ['can_init_sequence.puml'] }] }), consistency: consistency({}) };
    const v = view([R1, late]);
    assert.strictEqual(v.rows[v.rows.length - 1].title.indexOf('Can_Ack') >= 0, true,
      JSON.stringify(v.rows.map((r) => r.title)));
    assert.strictEqual(v.counts.fresh, 1);
  });
});
