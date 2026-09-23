'use strict';
// BLK-owner-20260923-1307-prune: 「2 つの版・2 枚の図を並べて違いを見る」入口を 2 つに絞る。
//
// 前の回 (BLK-owner-20260918-0529-prune) は 5 つの入口を ツール ▾ →「レビュー」に集めて
// 名前を揃えたが、目的が同じ項目が 5 つ並ぶこと自体が「どれを開けばよいか」を選ばせていた。
// 残す入口は ⇔ 並べて見る (版どうし・図どうしを並べる正面) と
// 🔍 変更前後を見比べる (資料・会議で見せる) の 2 つ。前回保存版との比較は
// ⇔ 並べて見る の ± 差分タブが引き受け、下端の札はそこを開くだけになる。
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

// 残す 2 つ (id → 呼び名)。
var TWO = [
  ['btn-tab-compare', '⇔ 並べて見る'],
  ['dp-review',       '🔍 変更前後を見比べる'],
];

function reviewItems() {
  var g = TM.groups().filter(function(x) { return x.key === 'review'; })[0];
  return g ? g.items : [];
}

describe('並べて違いを見る入口は 2 つだけ', function() {
  test('「レビュー」の先頭は ⇔ 並べて見る と 🔍 変更前後を見比べる', function() {
    var head = reviewItems().slice(0, 2).map(function(it) { return it.id; });
    expect(head).toEqual(TWO.map(function(p) { return p[0]; }));
    TWO.forEach(function(pair) {
      expect(TM.labelOf(pair[0])).toBe(pair[1]);
      expect(TM.groupOf(pair[0])).toBe('review');
    });
  });

  // 寄せた 3 つ: 前回保存版 (下端の札) / 他フォルダの版 / 基準の図。
  // 札はメニューから消え、覗く・指摘の 2 つは「並べる」入口としては名乗らない。
  test('前回保存版との比較は、独立した入口としてメニューに並ばない', function() {
    var ids = reviewItems().map(function(it) { return it.id; });
    expect(ids).not.toContain('status-livediff');
    expect(TM.menuIds().indexOf('status-livediff')).toBe(-1);
  });

  test('覗く・基準の図の指摘は残るが、呼び名から「見比べる」が外れる', function() {
    expect(TM.labelOf('btn-tab-peek')).toBe('他の保存フォルダを覗く');
    expect(TM.labelOf('btn-tab-review')).toBe('基準の図との指摘');
    ['btn-tab-peek', 'btn-tab-review'].forEach(function(id) {
      expect(/見比べる/.test(TM.labelOf(id))).toBe(false);
      // タブ列のボタンなので、今まで通り畳める (入口が消えてはいない)。
      expect(TM.isFoldable(id)).toBe(true);
    });
  });

  test('「レビュー」に残る見比べる呼び名は 2 つだけ', function() {
    var named = reviewItems().filter(function(it) {
      return /見比べる|並べて見る/.test(it.label);
    }).map(function(it) { return it.id; });
    expect(named).toEqual(TWO.map(function(p) { return p[0]; }));
  });
});

describe('タブ列に居ない入口', function() {
  test('モーダルの中のものは畳む対象に数えない', function() {
    expect(TM.isFoldable('dp-review')).toBe(false);
    expect(TM.menuIds().indexOf('dp-review')).toBe(-1);
    expect(TM.isFoldable('btn-tab-compare')).toBe(true);
  });

  test('モーダルの中にしか無い入口は、先に開く画面を連れている', function() {
    expect(TM.openerOf('dp-review')).toBe('btn-tab-delivery');
    expect(TM.openerOf('btn-tab-compare')).toBe('');
    expect(TM.openerOf('btn-tab-nope')).toBe('');
  });

  test('メニューの HTML に opener が出る', function() {
    var out = TM.buildMenuHtml();
    expect(out).toContain('data-target="dp-review" data-opener="btn-tab-delivery"');
    expect(out).toContain('data-target="btn-tab-compare"><span');
  });
});

describe('Ctrl+K は今まで通りの呼び名でも引ける', function() {
  function items() {
    return CP.buildItems([
      { id: 'tab-compare', title: '並べて見る / Compare', hint: 'Tabs',
        keywords: ['compare', 'side', 'ならべて', 'みくらべ'],
        button: 'btn-tab-compare', run: function() {} },
      { id: 'livediff', title: '前回保存版との比較 / Compare with last save', hint: 'Status',
        keywords: ['diff', 'compare', 'ぜんかい', 'ほぞん', 'ひかく'],
        button: 'status-livediff', run: function() {} },
      { id: 'delivery-review', title: '変更前後を見比べる (提出前レビュー) / Before-after review',
        hint: 'Deliver', keywords: ['review', 'before', 'after', 'へんこうぜんご'],
        button: 'dp-review', run: function() {} },
    ], '');
  }

  // 下端の札は ⇔ 並べて見る を開くだけになったが、Ctrl+K から引けること自体は変えない
  // (今まで「前回保存版との比較」で引いていた人の手を止めない)。
  test('前回保存版との比較は Ctrl+K から今まで通り引ける', function() {
    var all = items();
    expect(CP.filter(all, '前回保存版').length).toBe(1);
    expect(CP.filter(all, '比較').length).toBeGreaterThan(0);
    expect(CP.filter(all, 'compare').length).toBeGreaterThan(0);
  });

  test('残した 2 つは揃えた呼び名で行の見出しになる', function() {
    var byId = {};
    items().forEach(function(it) { byId[it.id] = it; });
    [['review:tab-compare', '⇔ 並べて見る'], ['review:delivery-review', '🔍 変更前後を見比べる']]
      .forEach(function(pair) {
        expect(byId[pair[0]].title).toBe(pair[1]);
        expect(byId[pair[0]].group).toBe('review');
      });
  });
});
