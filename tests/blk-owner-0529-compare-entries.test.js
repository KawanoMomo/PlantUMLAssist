'use strict';
// BLK-owner-20260918-0529-prune: 「2 枚を並べて見比べる」5 機能の入口を
// ツール ▾ →「レビュー」1 か所に揃え、呼び名を「…と見比べる」で統一する。
//
// 台帳の 5 機能は 参照ペインのタブ / 下端ステータスの「前回保存版 ＋a −b」/
// ツール ▾ / ▤ 変更サマリボードの中 に散り、「並べて見る」「比較」「差分」「見比べる」で
// 呼び名も割れていた。機能そのものと文脈内のショートカットは消さず、入口と名前だけを揃える。
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

// 台帳の 5 機能 (id → 揃えた呼び名)。
var FIVE = [
  ['btn-tab-compare', '別の図と見比べる'],
  ['status-livediff', '前回保存版と見比べる'],
  ['btn-tab-peek',    '他の保存フォルダの版と見比べる'],
  ['btn-tab-review',  '基準の図と見比べる'],
  ['dp-review',       '変更前後を見比べる'],
];

function reviewItems() {
  var g = TM.groups().filter(function(x) { return x.key === 'review'; })[0];
  return g ? g.items : [];
}

describe('見比べる 5 機能の入口は ツール ▾ の「レビュー」に揃う', function() {
  test('5 つとも「レビュー」に並ぶ', function() {
    var ids = reviewItems().map(function(it) { return it.id; });
    FIVE.forEach(function(pair) { expect(ids).toContain(pair[0]); });
  });

  test('呼び名は「…と見比べる」で揃い、5 つとも分類は review', function() {
    FIVE.forEach(function(pair) {
      expect(TM.labelOf(pair[0])).toBe(pair[1]);
      expect(TM.groupOf(pair[0])).toBe('review');
      expect(/見比べる$/.test(pair[1])).toBe(true);
    });
  });

  test('5 つは「レビュー」の先頭に、台帳の順で並ぶ', function() {
    var head = reviewItems().slice(0, FIVE.length).map(function(it) { return it.id; });
    expect(head).toEqual(FIVE.map(function(p) { return p[0]; }));
  });

  // 機能そのものは消さない。「探す」に残るのは探す道具だけで、見比べる道具は移した。
  test('「探す」には見比べる道具が残らず、見出しも「探す」になる', function() {
    var titles = TM.groups().map(function(g) { return g.title; });
    expect(titles).toContain('探す');
    expect(titles.indexOf('探す・見比べる')).toBe(-1);
    var find = TM.groups().filter(function(g) { return g.key === 'find'; })[0];
    var ids = find.items.map(function(it) { return it.id; });
    expect(ids).not.toContain('btn-tab-compare');
    expect(ids).not.toContain('btn-tab-peek');
    expect(ids.length).toBeGreaterThan(0);
  });
});

describe('タブ列に居ない入口', function() {
  // 下端ステータスの札とモーダルの中のボタンは、畳んでも画面から消えない。
  test('下端ステータス・モーダルの中のものは畳む対象に数えない', function() {
    expect(TM.isFoldable('status-livediff')).toBe(false);
    expect(TM.isFoldable('dp-review')).toBe(false);
    expect(TM.menuIds().indexOf('status-livediff')).toBe(-1);
    expect(TM.menuIds().indexOf('dp-review')).toBe(-1);
    // タブ列に居るものは今まで通り畳む
    expect(TM.isFoldable('btn-tab-compare')).toBe(true);
    expect(TM.isFoldable('btn-tab-peek')).toBe(true);
  });

  test('モーダルの中にしか無い入口は、先に開く画面を連れている', function() {
    expect(TM.openerOf('dp-review')).toBe('btn-tab-delivery');
    expect(TM.openerOf('btn-tab-compare')).toBe('');
    expect(TM.openerOf('btn-tab-nope')).toBe('');
  });

  test('メニューの HTML に opener が出る', function() {
    var out = TM.buildMenuHtml();
    expect(out).toContain('data-target="dp-review" data-opener="btn-tab-delivery"');
    expect(out).toContain('data-target="status-livediff"');
    // opener を持たない項目には付けない
    expect(out).toContain('data-target="btn-tab-compare"><span');
  });
});

describe('Ctrl+K は今まで通りの名前でも、揃えた名前でも引ける', function() {
  function items() {
    return CP.buildItems([
      { id: 'tab-compare', title: '並べて見る / Compare', hint: 'Tabs',
        keywords: ['compare', 'side', 'ならべて', 'みくらべ'],
        button: 'btn-tab-compare', run: function() {} },
      { id: 'livediff', title: '前回保存版との比較 / Compare with last save', hint: 'Status',
        keywords: ['diff', 'compare', 'ぜんかい', 'ほぞん', 'ひかく'],
        button: 'status-livediff', run: function() {} },
      { id: 'tab-peek', title: '他の保存フォルダを覗く / Peek folder', hint: 'Tabs',
        keywords: ['peek', 'folder', 'ほかの', 'ふぉるだ'],
        button: 'btn-tab-peek', run: function() {} },
      { id: 'tab-review', title: '基準の図と突き合わせる / Review desk', hint: 'Tabs',
        keywords: ['review', 'desk', 'きじゅん'],
        button: 'btn-tab-review', run: function() {} },
      { id: 'delivery-review', title: '変更前後を見比べる (提出前レビュー) / Before-after review',
        hint: 'Deliver', keywords: ['review', 'before', 'after', 'へんこうぜんご'],
        button: 'dp-review', run: function() {} },
    ], '');
  }

  test('5 つとも「レビュー」の分類チップで出る', function() {
    items().forEach(function(it) {
      expect(it.group).toBe('review');
      expect(it.badge).toBe('レビュー');
    });
  });

  test('揃えた名前が行の見出しになる', function() {
    var titles = items().map(function(it) { return it.title; });
    expect(titles).toEqual(FIVE.map(function(p) { return p[1]; }));
  });

  test('元の呼び名 (並べる / 比較 / 覗く / 突き合わせる) でも引ける', function() {
    var all = items();
    expect(CP.filter(all, '並べて見る').length).toBe(1);
    expect(CP.filter(all, '比較').length).toBeGreaterThan(0);
    expect(CP.filter(all, '覗く').length).toBe(1);
    expect(CP.filter(all, '突き合わせる').length).toBe(1);
    expect(CP.filter(all, 'compare').length).toBeGreaterThan(0);
  });

  test('揃えた名前「見比べる」では 5 つとも引ける', function() {
    expect(CP.filter(items(), '見比べる').length).toBe(5);
  });
});
