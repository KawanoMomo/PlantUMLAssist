'use strict';
// BLK-junior-20260916-0046-wish: 揃える先は登録簿 (_names.json) に決まっているのに、
// 「その揺れがどのファイルに残っているか」は人が 1 枚ずつ開いて探していた。
// ここで固定するのは、登録簿 × ファイル一覧から「残っている組と在処」が出せること、
// 当てた結果が canonical に寄ること、そして揃っている出現を数えないこと。
const assert = require('assert');

if (!global.window) {
  const jsdom = require('jsdom');
  const dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/bulk-rename.js')]; } catch (e) {}
try { delete require.cache[require.resolve('../src/core/name-registry.js')]; } catch (e) {}
try { delete require.cache[require.resolve('../src/core/name-unify.js')]; } catch (e) {}
require('../src/core/bulk-rename.js');
require('../src/core/name-registry.js');
require('../src/core/name-unify.js');
const NU = global.window.MA.nameUnify;
const NR = global.window.MA.nameRegistry;

const REG = NR.parse({
  entries: [
    { canonical: 'IRQCtrl', variants: ['IrqCtrl', 'Irq_Ctrl'] },
    { canonical: 'Clock_Ctrl', variants: ['ClockCtrl'] },
    { canonical: 'Timer_Driver', variants: ['TimerDrv'] },
  ],
});

const seq = (a) => ['@startuml', 'participant ' + a, a + ' -> Hal : Init()', '@enduml'].join('\n');

const FILES = [
  { name: 'gpio_init_sequence', dsl: seq('IrqCtrl') },
  { name: 'spi_sequence', dsl: seq('Irq_Ctrl') + '\n' },
  { name: 'timer_state', dsl: seq('ClockCtrl') },
  // 既に揃っている図。当てる先にも一覧にも出てはいけない
  { name: 'already_ok', dsl: seq('IRQCtrl') },
];

describe('BLK-junior-20260916-0046-wish 表記統一の一括反映', function() {
  test('登録簿の組ごとに、揺れが残っているファイルだけを挙げる', function() {
    const groups = NU.scan(REG, FILES);
    // Timer_Driver はどのファイルにも残っていないので組ごと出ない
    assert.deepStrictEqual(groups.map((g) => g.canonical), ['Clock_Ctrl', 'IRQCtrl']);

    const irq = groups.find((g) => g.canonical === 'IRQCtrl');
    assert.deepStrictEqual(irq.files.map((f) => f.name), ['gpio_init_sequence', 'spi_sequence']);
    // 1 ファイルに participant 行と矢印行の 2 件
    assert.strictEqual(irq.files[0].count, 2);
    assert.strictEqual(irq.total, 4);
    assert.strictEqual(irq.docs, 2);
  });

  test('揃っている出現は数えない (already_ok は在処に出ない)', function() {
    const groups = NU.scan(REG, FILES);
    const names = groups.reduce((a, g) => a.concat(g.files.map((f) => f.name)), []);
    assert.ok(names.indexOf('already_ok') === -1, '揃っている図を対象にしている');
  });

  test('内訳はどの綴りが何件かまで出す', function() {
    const groups = NU.scan(REG, FILES);
    const irq = groups.find((g) => g.canonical === 'IRQCtrl');
    assert.deepStrictEqual(irq.files[1].hits, [{ from: 'Irq_Ctrl', count: 2 }]);
  });

  test('当てると canonical に寄り、件数を返す', function() {
    const e = NR.find(REG, 'IRQCtrl');
    const r = NU.applyTo(seq('IrqCtrl'), e);
    assert.strictEqual(r.count, 2);
    assert.strictEqual(r.dsl, seq('IRQCtrl'));
  });

  test('識別子単位なので、部分一致は巻き込まない', function() {
    const e = NR.find(REG, 'IRQCtrl');
    const dsl = ['@startuml', 'participant IrqCtrlTest', 'participant IrqCtrl', '@enduml'].join('\n');
    const r = NU.applyTo(dsl, e);
    assert.strictEqual(r.count, 1);
    assert.ok(r.dsl.indexOf('IrqCtrlTest') !== -1, '前方一致の別名を書き換えている');
  });

  test('plan はチェックしたファイルだけを前後で返す', function() {
    const groups = NU.scan(REG, FILES);
    const irq = groups.find((g) => g.canonical === 'IRQCtrl');
    const texts = {};
    FILES.forEach((f) => { texts[f.name] = f.dsl; });
    const rows = NU.plan(irq, texts, ['spi_sequence']);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].name, 'spi_sequence');
    assert.strictEqual(rows[0].count, 2);
    assert.ok(rows[0].after.indexOf('IRQCtrl') !== -1);
    assert.ok(rows[0].after.indexOf('Irq_Ctrl') === -1);
    assert.ok(rows[0].before.indexOf('Irq_Ctrl') !== -1, '前が控えられていない');
  });

  test('同じ名前が 2 度来ても 1 枚と数える (タブとフォルダの重複)', function() {
    const dup = FILES.concat([{ name: 'gpio_init_sequence', dsl: seq('IrqCtrl') }]);
    const irq = NU.scan(REG, dup).find((g) => g.canonical === 'IRQCtrl');
    assert.strictEqual(irq.docs, 2);
  });

  test('札と 1 行は、読む人の言葉で組と件数を言う', function() {
    const groups = NU.scan(REG, FILES);
    const irq = groups.find((g) => g.canonical === 'IRQCtrl');
    assert.strictEqual(NU.label(irq), 'IRQCtrl ← IrqCtrl / Irq_Ctrl (2 ファイル 4 件)');
    assert.strictEqual(NU.summaryLine(groups), '2 組 / 6 件が揃っていません');
    assert.strictEqual(NU.summaryLine([]), '登録簿の表記はすべて揃っています');
    // 登録簿そのものが読めないことは「揃っている」と別の意味
    assert.strictEqual(NU.summaryLine(null), '登録簿を読めていません');
  });

  test('登録簿が空なら何も言わない (新語を邪魔しない)', function() {
    assert.deepStrictEqual(NU.scan(NR.parse({ entries: [] }), FILES), []);
    assert.deepStrictEqual(NU.scan(null, FILES), []);
  });
});
