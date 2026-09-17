'use strict';
// BLK-owner-20260918-0429-prune: 「確かめる(突合)」の入口を ツール ▾ →「確かめる」1 か所に揃える。
// 台帳の 6 機能のうち 引き継ぎチェックリスト だけが Ctrl+K からしか辿り着けず、
// メニューのどこにも出ていなかった。ここでは 6 つとも同じ分類に並ぶことを守る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/tool-menu.js')]; } catch (e) {}
require('../src/core/tool-menu.js');
try { delete require.cache[require.resolve('../src/core/command-palette.js')]; } catch (e) {}
require('../src/core/command-palette.js');
var TM = global.window.MA.toolMenu;
var CP = global.window.MA.commandPalette;

function checkItems() {
  var g = TM.groups().filter(function(x) { return x.key === 'check'; })[0];
  return g ? g.items.map(function(it) { return it.id; }) : [];
}

describe('確かめる(突合)の入口は ツール ▾ の「確かめる」に揃う', () => {
  test('台帳の 6 機能はすべて「確かめる」に並ぶ', () => {
    var ids = checkItems();
    // 突合ボード / 系統チェック / 名前突合 / トレース / 提出前チェック / 引き継ぎチェックリスト
    ['btn-tab-cross', 'btn-tab-family', 'btn-tab-audit', 'btn-tab-trace',
      'btn-tab-submit', 'btn-tab-handover'].forEach(function(id) {
      expect(ids).toContain(id);
    });
  });

  test('引き継ぎチェックリストは畳む対象で、分類は check', () => {
    expect(TM.isFoldable('btn-tab-handover')).toBe(true);
    expect(TM.groupOf('btn-tab-handover')).toBe('check');
    expect(TM.labelOf('btn-tab-handover')).toBe('引き継ぎチェックリスト');
  });

  test('メニューの言い換えでも元の題でも Ctrl+K から引ける', () => {
    var items = CP.buildItems([
      { id: 'handover-board', title: '引き継ぎチェックリスト（渡してよい図を数える）',
        hint: 'Handover', keywords: ['handover', 'ひきつぎ'],
        button: 'btn-tab-handover', run: function() {} },
    ], '');
    var it = items[0];
    expect(it.group).toBe('check');
    expect(it.badge).toBe('確かめる');
    expect(CP.filter(items, '引き継ぎ').length).toBe(1);
    expect(CP.filter(items, 'handover').length).toBe(1);
    expect(CP.filter(items, '渡してよい図').length).toBe(1);
  });
});
