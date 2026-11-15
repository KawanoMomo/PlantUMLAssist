'use strict';
// BLK-human-20260923-1601 (design 9b): ツール ▾ を左 6 分類・右小見出しの 2 段パネルにする。
//
// 縦 1 列に 40 件近く並んでいたため「確かめる」「レビュー」が画面の下にはみ出し、
// 何があるかを見るのにパネル内スクロールが要った。左に 6 分類 (件数の合計つき)、
// 右にその分類の項目を小見出しで区切って出し、どの分類も 14 行以内に収める。

const fs = require('fs');
const path = require('path');

var W = (typeof window !== 'undefined' && window) || global.window;
var tm = W.MA.toolMenu;

const html = fs.readFileSync(path.resolve(__dirname, '..', 'plantuml-assist.html'), 'utf8');

// 「渡す」(引き継ぎ zip・納品パッケージ) は TICKET-owner-20261115-1828-prune で外し、左列は 5 分類になった。
describe('左列の分類', function() {
  // TICKET-owner-20261115-1841-prune: 「確かめる」(図をまたぐ監査) を外し、左列は 4 分類になった。
  // TICKET-owner-20261115-2140-prune: 「探す」(図をまたぐ調べ物) を外し、左列は 3 分類になった。
  test('3 分類がこの順で並ぶ', function() {
    expect(tm.panelGroups().map(function(g) { return g.title; }))
      .toEqual(['図をつくる', '書き換える', 'レビュー']);
  });

  test('探す の分類は無い', function() {
    expect(tm.panelGroups().filter(function(x) { return x.key === 'find'; }).length).toBe(0);
  });

  // TICKET-owner-20261115-1840-prune: ピン留めと指摘箱を外した。2141-prune で基準の図の指摘も外したので、レビューの件数は差分の分だけ。
  test('分類側に件数の合計が出る (書き換える 1 / レビュー 2)', function() {
    var counts = tm.groupCounts({
      'btn-tab-rename': '1',
      'btn-tab-review': '4', 'btn-tab-diff': '2',
    });
    expect(counts.edit).toBe(1);
    expect(counts.review).toBe(2);
    // 0 件の分類は数字を持たない (常に場所を取る 0 を出さない)
    expect(counts.make).toBe(undefined);
  });

  test('どの分類も 14 行以内 (小見出しを 1 行と数える)', function() {
    tm.panelGroups().forEach(function(g) {
      var n = tm.rowCount(g.key);
      expect(n > 0 && n <= 14).toBe(true);
    });
  });
});

describe('右列の小見出し', function() {
  test('すべての項目が小見出しを持つ', function() {
    tm.panelGroups().forEach(function(g) {
      g.items.forEach(function(it) {
        expect(typeof it.group === 'string' && it.group.length > 0).toBe(true);
      });
    });
  });

  // BLK-owner-20260924-1836-prune: 覗く窓の入口は FILES「読むだけ」の右クリックへ移し、ツール ▾ からは案内 1 行に落とした。
  // TICKET-owner-20261115-2141-prune: 「指摘」(基準の図との指摘) を外したので 変更の履歴 だけ。
  test('レビューは 変更の履歴 だけになる', function() {
    var g = tm.panelGroups().filter(function(x) { return x.key === 'review'; })[0];
    var subs = [];
    g.items.forEach(function(it) {
      if (subs.indexOf(it.group) < 0) subs.push(it.group);
    });
    expect(subs).toEqual(['変更の履歴']);
  });

  test('確かめる の分類は無い', function() {
    expect(tm.panelGroups().filter(function(x) { return x.key === 'check'; }).length).toBe(0);
  });

  test('項目名は tool-menu.js のラベルそのまま (言い換えない)', function() {
    // BLK-owner-20260923-1509-prune: ⇔ 並べて見る は「並べて比較」の相手に畳まり、
    // メニューの項目ではなくなった。他の項目で同じ規則を見る。
    expect(tm.labelOf('btn-tab-peek')).toBe('このフォルダの図を調べる…');
    expect(tm.labelOf('btn-tab-diff')).toBe('前回保存からの差分');
  });
});

describe('パネルの HTML', function() {
  test('絞り込み欄と Ctrl+K の注記が上に出る', function() {
    var out = tm.buildMenuHtml();
    expect(out).toContain('id="tool-menu-filter"');
    expect(out).toContain('ツールを絞り込む');
    expect(out).toContain('Ctrl+K でも引けます');
  });

  test('左列は 3 つ、最初の分類だけが開いている', function() {
    var out = tm.buildMenuHtml();
    expect((out.match(/class="tool-menu-cat"/g) || []).length).toBe(3);
    expect((out.match(/aria-selected="true"/g) || []).length).toBe(1);
    // 3 分類のうち 2 つは畳んだ状態で出す (1 画面に収める)
    expect((out.match(/class="tool-menu-group" data-group="[a-z]+" hidden/g) || []).length).toBe(2);
  });

  test('分類の合計は項目の件数と別の印にする (件数の数え方を壊さない)', function() {
    var out = tm.buildMenuHtml({ 'btn-tab-diff': '3' });
    expect((out.match(/tool-menu-badge/g) || []).length).toBe(1);
    expect(out).toContain('<span class="tool-cat-count">3</span>');
  });

  test('小見出しは分類ごとに出て、同じ見出しを繰り返さない', function() {
    var out = tm.buildMenuHtml();
    expect((out.match(/class="tool-menu-sub">変更の履歴</g) || []).length).toBe(1);
    // 「指摘」の小見出しは 2141-prune で外した (基準の図との指摘が無くなった)。
    expect((out.match(/class="tool-menu-sub">指摘</g) || []).length).toBe(0);
    expect((out.match(/class="tool-menu-sub">起こす</g) || []).length).toBe(1);
  });
});

describe('絞り込み', function() {
  test('全分類を横断して当たる', function() {
    // 「図」は 図をつくる、「差分」は レビュー (基準の図との指摘 は 2141-prune で外した)。
    var hits = tm.filterItems('図').concat(tm.filterItems('差分'));
    expect(hits.map(function(h) { return h.groupKey; })).toEqual(['make', 'review']);
  });

  test('小見出し・分類名でも引ける', function() {
    // BLK-human-20260923-1701 (design 10b): 「この図の変遷」は FILES の右クリックへ移したので 4 → 3。
    // TICKET-owner-20261115-1828-prune: 変更サマリを外したので 3 → 2。
    // TICKET-owner-20261115-2140-prune: この図の継承元を外したので 2 → 1。
    expect(tm.filterItems('変更の履歴').length).toBe(1);
    expect(tm.filterItems('書き換える').length).toBe(3);
  });

  test('空の絞り込みは全件', function() {
    var all = 0;
    tm.panelGroups().forEach(function(g) { all += g.items.length; });
    expect(tm.filterItems('').length).toBe(all);
  });

  test('候補の HTML は分類名を添えて出し、当たりが無ければそう言う', function() {
    var out = tm.buildHitsHtml('部品名', {});
    expect(out).toContain('data-target="btn-tab-rename"');
    expect(out).toContain('書き換える');
    expect(tm.buildHitsHtml('そんなものは無い', {})).toContain('該当なし');
  });

  test('絞り込みの文言もエスケープされる', function() {
    expect(tm.buildHitsHtml('', { 'btn-tab-diff': '<b>' })).toContain('&lt;b&gt;');
  });
});

describe('画面側の受け皿', function() {
  test('2 段パネルの CSS が plantuml-assist.html にある', function() {
    expect(html).toContain('.tool-menu-cats');
    expect(html).toContain('.tool-menu-sub');
    expect(html).toContain('.tool-menu-filter');
  });

  test('パネルの中をスクロールさせない', function() {
    var block = html.slice(html.indexOf('#tool-menu {'), html.indexOf('#tool-menu[hidden]'));
    expect(block).toContain('overflow: hidden');
    expect(block).not.toContain('overflow-y: auto');
  });
});
