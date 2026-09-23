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

describe('左列の 6 分類', function() {
  test('渡す を含む 6 分類がこの順で並ぶ (入口は Export ▾ のまま)', function() {
    expect(tm.panelGroups().map(function(g) { return g.title; }))
      .toEqual(['図をつくる', '書き換える', '探す', '確かめる', 'レビュー', '渡す']);
  });

  test('分類側に件数の合計が出る (確かめる 1 / レビュー 10)', function() {
    var counts = tm.groupCounts({
      'btn-tab-submit': '1',
      'btn-tab-pins': '3', 'btn-tab-inbox': '5', 'btn-tab-diff': '2',
    });
    expect(counts.check).toBe(1);
    expect(counts.review).toBe(10);
    // 0 件の分類は数字を持たない (常に場所を取る 0 を出さない)
    expect(counts.make).toBe(undefined);
    expect(counts.give).toBe(undefined);
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

  test('レビューは 見比べる / 指摘 / 変更の履歴 に分かれる', function() {
    var g = tm.panelGroups().filter(function(x) { return x.key === 'review'; })[0];
    var subs = [];
    g.items.forEach(function(it) {
      if (subs.indexOf(it.group) < 0) subs.push(it.group);
    });
    expect(subs).toEqual(['見比べる', '指摘', '変更の履歴']);
  });

  test('確かめるは 名前と系統 / まとめて点検 / 渡す前に に分かれる', function() {
    var g = tm.panelGroups().filter(function(x) { return x.key === 'check'; })[0];
    var subs = [];
    g.items.forEach(function(it) {
      if (subs.indexOf(it.group) < 0) subs.push(it.group);
    });
    expect(subs).toEqual(['名前と系統', 'まとめて点検', '渡す前に']);
  });

  test('項目名は tool-menu.js のラベルそのまま (言い換えない)', function() {
    expect(tm.labelOf('btn-tab-compare')).toBe('⇔ 並べて見る');
    expect(tm.labelOf('btn-tab-board')).toBe('変更サマリ');
  });
});

describe('パネルの HTML', function() {
  test('絞り込み欄と Ctrl+K の注記が上に出る', function() {
    var out = tm.buildMenuHtml();
    expect(out).toContain('id="tool-menu-filter"');
    expect(out).toContain('ツールを絞り込む');
    expect(out).toContain('Ctrl+K でも引けます');
  });

  test('左列は 6 つ、最初の分類だけが開いている', function() {
    var out = tm.buildMenuHtml();
    expect((out.match(/class="tool-menu-cat"/g) || []).length).toBe(6);
    expect((out.match(/aria-selected="true"/g) || []).length).toBe(1);
    // 6 分類のうち 5 つは畳んだ状態で出す (1 画面に収める)
    expect((out.match(/class="tool-menu-group" data-group="[a-z]+" hidden/g) || []).length).toBe(5);
  });

  test('分類の合計は項目の件数と別の印にする (件数の数え方を壊さない)', function() {
    var out = tm.buildMenuHtml({ 'btn-tab-pins': '3' });
    expect((out.match(/tool-menu-badge/g) || []).length).toBe(1);
    expect(out).toContain('<span class="tool-cat-count">3</span>');
  });

  test('小見出しは分類ごとに出て、同じ見出しを繰り返さない', function() {
    var out = tm.buildMenuHtml();
    expect((out.match(/class="tool-menu-sub">見比べる</g) || []).length).toBe(1);
    expect((out.match(/class="tool-menu-sub">指摘</g) || []).length).toBe(1);
  });
});

describe('絞り込み', function() {
  test('全分類を横断して当たる', function() {
    var hits = tm.filterItems('zip');
    expect(hits.length).toBe(2);
    expect(hits.map(function(h) { return h.groupKey; })).toEqual(['give', 'give']);
  });

  test('小見出し・分類名でも引ける', function() {
    expect(tm.filterItems('変更の履歴').length).toBe(4);
    expect(tm.filterItems('探す').length >= 3).toBe(true);
  });

  test('空の絞り込みは全件', function() {
    var all = 0;
    tm.panelGroups().forEach(function(g) { all += g.items.length; });
    expect(tm.filterItems('').length).toBe(all);
  });

  test('候補の HTML は分類名を添えて出し、当たりが無ければそう言う', function() {
    var out = tm.buildHitsHtml('zip', {});
    expect(out).toContain('data-target="btn-tab-handoff"');
    expect(out).toContain('渡す');
    expect(tm.buildHitsHtml('そんなものは無い', {})).toContain('該当なし');
  });

  test('絞り込みの文言もエスケープされる', function() {
    expect(tm.buildHitsHtml('', { 'btn-tab-pins': '<b>' })).toContain('&lt;b&gt;');
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
