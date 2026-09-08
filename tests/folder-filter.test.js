'use strict';
// BLK-junior-20260908-1103: 📂 一覧は 20 枚超の行が縦に並び、行ごとに印・役割・差分の
// ボタンが付く。目的の 1 枚を名前だけを頼りに 1 回で正確に押すのが難しい。
// 名前で絞り込む部分の判断だけを純関数として持つ (描画は app.js)。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/folder-filter.js')]; } catch (e) {}
require('../src/core/folder-filter.js');
var ff = global.window.MA.folderFilter;

var NAMES = [
  'gpio_state.puml', 'gpio_init_sequence.puml', 'gpio_driver_class.puml',
  'adc_state.puml', 'spi_init_sequence.puml',
];

describe('folderFilter.match', () => {
  test('空の絞り込みは全部に当たる', () => {
    expect(ff.match('gpio_state.puml', '')).toBe(true);
    expect(ff.match('gpio_state.puml', '   ')).toBe(true);
    expect(ff.match('gpio_state.puml', null)).toBe(true);
  });

  test('部分一致で当たる (大文字小文字は問わない)', () => {
    expect(ff.match('GPIO_State.puml', 'gpio')).toBe(true);
    expect(ff.match('GPIO_State.puml', 'STATE')).toBe(true);
    expect(ff.match('gpio_state.puml', 'adc')).toBe(false);
  });

  test('空白で区切った語は全部を含むものだけ (順序は問わない)', () => {
    expect(ff.match('gpio_init_sequence.puml', 'gpio seq')).toBe(true);
    expect(ff.match('gpio_init_sequence.puml', 'seq gpio')).toBe(true);
    expect(ff.match('gpio_state.puml', 'gpio seq')).toBe(false);
  });

  test('名前が無くても例外を投げない', () => {
    expect(ff.match(null, 'a')).toBe(false);
    expect(ff.match(undefined, '')).toBe(true);
  });
});

describe('folderFilter.filter', () => {
  test('当たった名前だけを元の並びで返す', () => {
    expect(ff.filter(NAMES, 'gpio')).toEqual([
      'gpio_state.puml', 'gpio_init_sequence.puml', 'gpio_driver_class.puml',
    ]);
    expect(ff.filter(NAMES, 'state')).toEqual(['gpio_state.puml', 'adc_state.puml']);
  });

  test('空の絞り込みは全部返す / 当たらなければ空', () => {
    expect(ff.filter(NAMES, '').length).toBe(5);
    expect(ff.filter(NAMES, 'zzz')).toEqual([]);
  });

  test('配列でなくても空で返す', () => {
    expect(ff.filter(null, 'a')).toEqual([]);
  });
});

describe('folderFilter.soleMatch — Enter で開ける 1 枚', () => {
  test('1 枚だけ当たったらその名前を返す', () => {
    expect(ff.soleMatch(NAMES, 'gpio_state')).toBe('gpio_state.puml');
  });

  test('2 枚以上・0 枚のときは空 (誤って別の図を開かない)', () => {
    expect(ff.soleMatch(NAMES, 'gpio')).toBe('');
    expect(ff.soleMatch(NAMES, 'zzz')).toBe('');
    expect(ff.soleMatch(NAMES, '')).toBe('');
  });

  test('完全一致が 1 つあれば、部分一致が他にあってもそれを返す', () => {
    // gpio_state.puml は gpio_state_ext.puml の一部でもある
    var names = ['gpio_state.puml', 'gpio_state_ext.puml'];
    expect(ff.soleMatch(names, 'gpio_state.puml')).toBe('gpio_state.puml');
    expect(ff.soleMatch(names, 'gpio_state')).toBe('');
  });
});

describe('folderFilter.summaryText', () => {
  test('絞り込み中は「N / M 枚」を出す', () => {
    expect(ff.summaryText(3, 22, 'gpio')).toBe('gpio に当たる図 3 / 22 枚');
  });

  test('当たらなければその旨 / 絞り込んでいなければ空', () => {
    expect(ff.summaryText(0, 22, 'zzz')).toBe('zzz に当たる図はありません (22 枚中)');
    expect(ff.summaryText(22, 22, '')).toBe('');
  });
});
