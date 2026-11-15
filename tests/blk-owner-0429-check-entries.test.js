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
  test('台帳の確かめる機能はすべて「確かめる」に並ぶ', () => {
    var ids = checkItems();
    // 突合ボード / 系統チェック / トレース
    // (名前突合は BLK-owner-20260924-1332-prune で突合ボードの「名前/表記揺れ」に畳んだ。
    //  提出前チェック・引き継ぎチェックリストは TICKET-owner-20261115-1828-prune で外した)
    ['btn-tab-cross', 'btn-tab-family', 'btn-tab-trace'].forEach(function(id) {
      expect(ids).toContain(id);
    });
    expect(ids).not.toContain('btn-tab-submit');
    expect(ids).not.toContain('btn-tab-handover');
  });

  test('系統チェックは畳む対象で、分類は check', () => {
    expect(TM.isFoldable('btn-tab-family')).toBe(true);
    expect(TM.groupOf('btn-tab-family')).toBe('check');
    expect(TM.labelOf('btn-tab-family')).toBe('系統内の動作名のずれ');
  });

  test('メニューの言い換えでも元の題でも Ctrl+K から引ける', () => {
    var items = CP.buildItems([
      { id: 'tab-family', title: '系統チェックを開く / Family check',
        hint: 'Tabs', keywords: ['family', 'けいとう'],
        button: 'btn-tab-family', run: function() {} },
    ], '');
    var it = items[0];
    expect(it.group).toBe('check');
    expect(it.badge).toBe('確かめる');
    expect(CP.filter(items, '系統').length).toBe(1);
    expect(CP.filter(items, 'family').length).toBe(1);
    expect(CP.filter(items, '動作名のずれ').length).toBe(1);
  });
});
