'use strict';
// BLK-owner-20260923-1307-prune: 「2 つの版・2 枚の図を並べて違いを見る」入口を絞る。
//
// この回は 5 つの入口を 2 つ (⇔ 並べて見る / 🔍 変更前後を見比べる) に絞った。
// BLK-owner-20260923-1509-prune で、その 2 つも「並べて比較」の枠 1 つに畳まれ、
// 選ぶのは「誰と並べるか」だけになった (面が 2 つ残っている限り、どちらを開けば
// よいかを選ばせる問題は消えていなかった)。ここに残すのは、畳んだあとも生きている
// 決め事だけ — 覗く・指摘は「並べる」入口として名乗らない、という呼び名の規律。
// 「入口が 2 つ」を確かめていた 3 件は、1 つに畳んだ今は成り立たないので
// blk-owner-1509-compare-one-entry.test.js が引き継いでいる。
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

function reviewItems() {
  var g = TM.groups().filter(function(x) { return x.key === 'review'; })[0];
  return g ? g.items : [];
}

describe('並べる入口は「レビュー」に別項目として並ばない', function() {
  // 寄せたもの: 前回保存版 (下端の札) / 他フォルダの版 / 基準の図 /
  // ⇔ 並べて見る / 🔍 変更前後を見比べる。
  test('前回保存版との比較は、独立した入口としてメニューに並ばない', function() {
    var ids = reviewItems().map(function(it) { return it.id; });
    expect(ids).not.toContain('status-livediff');
    expect(TM.menuIds().indexOf('status-livediff')).toBe(-1);
  });

  test('並べる面の入口は「レビュー」から外れている', function() {
    var ids = reviewItems().map(function(it) { return it.id; });
    expect(ids).not.toContain('btn-tab-compare');
    expect(ids).not.toContain('dp-review');
  });

  test('覗く・基準の図の指摘は残るが、呼び名から「見比べる」が外れる', function() {
    // BLK-owner-20260924-1836-prune: 覗く窓の入口は FILES「読むだけ」の右クリックへ移し、ツール ▾ からは案内 1 行に落とした。
    expect(TM.labelOf('btn-tab-peek')).toBe('このフォルダの図を調べる…');
    expect(TM.labelOf('btn-tab-review')).toBe('基準の図との指摘');
    ['btn-tab-peek', 'btn-tab-review'].forEach(function(id) {
      expect(/見比べる/.test(TM.labelOf(id))).toBe(false);
      // タブ列のボタンなので、今まで通り畳める (入口が消えてはいない)。
      expect(TM.isFoldable(id)).toBe(true);
    });
  });

  test('「レビュー」に「見比べる / 並べて見る」を名乗る項目は残らない', function() {
    var named = reviewItems().filter(function(it) {
      return /見比べる|並べて見る/.test(it.label);
    });
    expect(named).toEqual([]);
  });
});

describe('メニューに載らない id は、畳む数にも入らない', function() {
  test('メニューから外れた入口は menuIds に出ない', function() {
    expect(TM.menuIds().indexOf('dp-review')).toBe(-1);
    expect(TM.menuIds().indexOf('btn-tab-compare')).toBe(-1);
  });

  test('モーダルの中のものは畳む対象に数えない', function() {
    expect(TM.isFoldable('dp-review')).toBe(false);
  });

  test('知らない id は opener を連れていない', function() {
    expect(TM.openerOf('btn-tab-nope')).toBe('');
    expect(TM.openerOf('dp-review')).toBe('');
  });
});

describe('Ctrl+K は今まで通りの呼び名でも引ける', function() {
  function items() {
    return CP.buildItems([
      { id: 'tab-compare', title: '並べて比較 (別タブの図) / Compare', hint: 'Compare',
        keywords: ['compare', 'side', 'ならべて', 'みくらべ'], run: function() {} },
      { id: 'compare-before', title: '並べて比較 (この図の前回保存版) / Compare with last save',
        hint: 'Compare', keywords: ['compare', 'before', 'ぜんかいほぞん', 'へんこうぜんご'], run: function() {} },
      { id: 'livediff', title: '前回保存版との比較 / Compare with last save', hint: 'Status',
        keywords: ['diff', 'compare', 'ぜんかい', 'ほぞん', 'ひかく'],
        button: 'status-livediff', run: function() {} },
    ], '');
  }

  // 入口を畳んでも、使う人の頭の中の名前は変わらない。
  test('前回保存版との比較は Ctrl+K から今まで通り引ける', function() {
    var all = items();
    expect(CP.filter(all, '前回保存版').length).toBeGreaterThan(0);
    expect(CP.filter(all, '比較').length).toBeGreaterThan(0);
    expect(CP.filter(all, 'compare').length).toBeGreaterThan(0);
  });
});
