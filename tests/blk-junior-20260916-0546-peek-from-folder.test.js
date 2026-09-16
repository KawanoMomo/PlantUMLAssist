'use strict';
// BLK-junior-20260916-0546: 📂 一覧は保存先フォルダだけを見せるので、先輩の図を
// ここで探した人には「無い」としか見えず、見るには保存先ごと切り替える (＝次の保存が
// 先輩のフォルダに行く) しかなかった。読むだけの入口を探しているその場で言い、
// 打った名前を覗きへ持ち越す。ここはその文言と絞り込みの規則を固定する。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/folder-filter.js')]; } catch (e) {}
require('../src/core/folder-filter.js');
var FF = global.window.MA.folderFilter;

describe('peekHintText — 一覧が何を見せているかを、探している場で言う', function() {
  test('何も打っていなければ「保存先フォルダだけ」と読むだけの入口を知らせる', function() {
    var t = FF.peekHintText(12, '');
    expect(t).toContain('保存先フォルダだけ');
    expect(t).toContain('読むだけ');
  });

  test('打った名前が当たっているうちは黙る (邪魔をしない)', function() {
    expect(FF.peekHintText(3, 'gpio')).toBe('');
  });

  test('0 枚になったら、打った名前を引いて他フォルダを名指しする', function() {
    var t = FF.peekHintText(0, 'driver_common_class');
    expect(t).toContain('driver_common_class');
    expect(t).toContain('保存先にありません');
    // 保存先が動かないことを、押す前に言う (これが怖くて諦めた手順なので)。
    expect(t).toContain('保存先は変わりません');
  });

  test('空白だけの入力は「探していない」と同じ', function() {
    expect(FF.peekHintText(0, '   ')).toContain('保存先フォルダだけ');
  });
});

describe('peekUrged — 入口を強く出す場面', function() {
  test('探していて 0 枚のときだけ強く出す', function() {
    expect(FF.peekUrged(0, 'driver_common')).toBe(true);
    expect(FF.peekUrged(2, 'driver_common')).toBe(false);
    expect(FF.peekUrged(0, '')).toBe(false);
  });
});

describe('peekSummaryText — 覗きへ持ち越した名前', function() {
  test('持ち越した名前で絞れていることを言う', function() {
    expect(FF.peekSummaryText(1, 24, 'driver_common'))
      .toBe('「driver_common」で絞り込み中 1 / 24 枚');
  });

  test('向こうにも無ければ、そう言う (1 枚も無いと読み違えさせない)', function() {
    expect(FF.peekSummaryText(0, 24, 'zzz'))
      .toBe('「zzz」に当たる図はこのフォルダにもありません (24 枚中)');
  });

  test('持ち越しが無ければ何も言わない', function() {
    expect(FF.peekSummaryText(24, 24, '')).toBe('');
  });
});

describe('filter — 持ち越した名前は一覧と同じ規則で当たる', function() {
  var NAMES = [
    'driver_common_class.puml', 'gpio_state.puml', 'gpio_init_sequence.puml',
  ];

  test('一覧で当たる打ち方は覗きでも当たる', function() {
    expect(FF.filter(NAMES, 'driver_common')).toEqual(['driver_common_class.puml']);
    expect(FF.filter(NAMES, 'seq gpio')).toEqual(['gpio_init_sequence.puml']);
  });

  test('当たらなければ 0 枚 (呼ぶ側が全枚に戻す判断をする)', function() {
    expect(FF.filter(NAMES, 'zzz')).toEqual([]);
  });
});
