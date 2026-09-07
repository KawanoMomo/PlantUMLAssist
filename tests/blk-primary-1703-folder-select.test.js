'use strict';
// BLK-primary-20260907-1703: 保存フォルダの一覧から複数の図を選び、
// まとめてタブで開く。14 枚を 1 枚ずつ開くと 28 クリックかかっていた。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/folder-select.js')]; } catch (e) {}
require('../src/core/folder-select.js');
var FS = global.window.MA.folderSelect;

// 横断作業で開く 14 枚 (一覧に並んでいる順)。
var NAMES = [
  'CanDrv_state', 'CanDrv_class', 'CanDrv_seq', 'SpiDrv_state', 'SpiDrv_class',
  'SpiDrv_seq', 'UartDrv_state', 'UartDrv_class', 'UartDrv_seq', 'Gpio_state',
  'Gpio_class', 'Adc_state', 'Adc_class', 'Pwm_state',
];

describe('folder-select — 印を付ける', () => {
  test('印は押すたびに付いたり外れたりする', () => {
    var p = FS.clear();
    expect(FS.has(p, 'Gpio_state')).toBe(false);
    p = FS.toggle(p, 'Gpio_state');
    expect(FS.has(p, 'Gpio_state')).toBe(true);
    p = FS.toggle(p, 'Gpio_state');
    expect(FS.has(p, 'Gpio_state')).toBe(false);
  });

  test('同じ名前を 2 度足しても 1 つにしかならない', () => {
    var p = FS.toggle(FS.toggle(FS.clear(), 'Adc_state'), 'Adc_class');
    p = FS.selectAll(['Adc_state', 'Adc_state', 'Adc_class']);
    expect(p).toEqual(['Adc_state', 'Adc_class']);
  });

  test('全部選ぶは一覧の並びのまま', () => {
    expect(FS.selectAll(NAMES)).toEqual(NAMES);
    expect(FS.selectAll(NAMES).length).toBe(14);
  });

  test('全部に印が付いているかを答える (ボタンの表示が変わる)', () => {
    expect(FS.allPicked(FS.selectAll(NAMES), NAMES)).toBe(true);
    expect(FS.allPicked(FS.toggle(FS.selectAll(NAMES), 'Pwm_state'), NAMES)).toBe(false);
    expect(FS.allPicked([], NAMES)).toBe(false);
    // 一覧が空のときは「全部選ぶ」側のまま (押しても何も起きない)
    expect(FS.allPicked([], [])).toBe(false);
  });

  test('一覧から消えた図の印は落とす', () => {
    var p = FS.selectAll(NAMES);
    var now = NAMES.filter(function(n) { return n !== 'Adc_class'; });
    var kept = FS.keepExisting(p, now);
    expect(kept.length).toBe(13);
    expect(FS.has(kept, 'Adc_class')).toBe(false);
  });
});

describe('folder-select — まとめて開く', () => {
  test('開くのは印の付いた図だけで、順は一覧のまま', () => {
    var p = FS.toggle(FS.toggle(FS.clear(), 'Pwm_state'), 'CanDrv_seq');
    expect(FS.toOpen(p, NAMES, [])).toEqual(['CanDrv_seq', 'Pwm_state']);
  });

  test('既に開いているタブは読み直さない (編集中の内容を潰さない)', () => {
    var p = FS.selectAll(NAMES);
    var open = ['CanDrv_state', 'SpiDrv_class'];
    var out = FS.toOpen(p, NAMES, open);
    expect(out.length).toBe(12);
    expect(out.indexOf('CanDrv_state')).toBe(-1);
    expect(out.indexOf('SpiDrv_class')).toBe(-1);
  });

  test('14 枚を全部選ぶと 14 枚が開く対象になる', () => {
    expect(FS.toOpen(FS.selectAll(NAMES), NAMES, []).length).toBe(14);
  });

  test('印が無ければ開く対象も無い', () => {
    expect(FS.toOpen([], NAMES, [])).toEqual([]);
  });

  test('ボタンの文言で、何枚が新しく開くのかが読める', () => {
    expect(FS.openLabel([], NAMES, [])).toBe('選んだ図をタブで開く');
    expect(FS.openLabel(FS.selectAll(NAMES), NAMES, [])).toBe('選んだ 14 枚をタブで開く');
    expect(FS.openLabel(FS.selectAll(NAMES), NAMES, ['CanDrv_state']))
      .toBe('選んだ 14 枚を開く（13 枚が新規）');
    expect(FS.openLabel(['Gpio_state'], NAMES, ['Gpio_state']))
      .toBe('1 枚とも既に開いています');
  });
});
