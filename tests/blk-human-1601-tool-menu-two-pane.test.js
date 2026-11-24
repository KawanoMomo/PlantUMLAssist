'use strict';
// BLK-human-20260923-1601 (design 9b): ツール ▾ のパネルを 14 行以内に収め、中をスクロールさせない。
//
// 縦 1 列に 40 件近く並んでいたため「確かめる」「レビュー」が画面の下にはみ出し、
// 何があるかを見るのにパネル内スクロールが要った。design 9b は左に分類・右に小見出しの 2 段にした。
// TICKET-roadmap-20261115-2114-2 (整理表 #4): 束で分類の中身が外れて残りは 1 分類 3 行になったので、
// 左の分類の列を外し、残った道具だけの 1 段の一覧にした (小見出しと絞り込みは残す)。

const fs = require('fs');
const path = require('path');

var W = (typeof window !== 'undefined' && window) || global.window;
var tm = W.MA.toolMenu;

const html = fs.readFileSync(path.resolve(__dirname, '..', 'plantuml-assist.html'), 'utf8');

// 「渡す」は TICKET-owner-20261115-1828-prune、「確かめる」は 1841-prune、「探す」は 2140-prune、
// 「レビュー」は 2141-prune、「図をつくる」は 0321-prune で外し、残る分類は 1 つになった。
describe('残る分類', function() {
  test('1 分類 (書き換える) だけ', function() {
    expect(tm.panelGroups().map(function(g) { return g.title; }))
      .toEqual(['書き換える']);
  });

  test('探す の分類は無い', function() {
    expect(tm.panelGroups().filter(function(x) { return x.key === 'find'; }).length).toBe(0);
  });

  test('分類ごとの件数の合計は持たない (左の分類の列が無い)', function() {
    expect(tm.groupCounts).toBe(undefined);
  });

  test('一覧は 14 行以内 (小見出しを 1 行と数える)', function() {
    var n = tm.rowCount();
    expect(n > 0 && n <= 14).toBe(true);
  });
});

describe('一覧の小見出し', function() {
  test('すべての項目が小見出しを持つ', function() {
    tm.panelGroups().forEach(function(g) {
      g.items.forEach(function(it) {
        expect(typeof it.group === 'string' && it.group.length > 0).toBe(true);
      });
    });
  });

  // BLK-owner-20260924-1836-prune: 覗く窓の入口は FILES「読むだけ」の右クリックへ移し、ツール ▾ からは案内 1 行に落とした。
  // TICKET-owner-20261115-2141-prune: 「指摘」と「変更の履歴」(前回保存からの差分) を外し、レビューの分類は無い。
  test('レビュー の分類は無い', function() {
    expect(tm.panelGroups().filter(function(x) { return x.key === 'review'; }).length).toBe(0);
  });

  test('確かめる の分類は無い', function() {
    expect(tm.panelGroups().filter(function(x) { return x.key === 'check'; }).length).toBe(0);
  });

  test('項目名は tool-menu.js のラベルそのまま (言い換えない)', function() {
    expect(tm.labelOf('tool-versions')).toBe('この図の履歴を表示'); // 右クリックと同じ語 (TICKET-owner-20261123-1242-1)
    expect(tm.labelOf('tool-lines')).toBe('行を書き換える');
    expect(tm.labelOf('btn-tab-diff')).toBe(null);
  });
});

describe('パネルの HTML', function() {
  test('絞り込み欄と Ctrl+K の注記が上に出る', function() {
    var out = tm.buildMenuHtml();
    expect(out).toContain('id="tool-menu-filter"');
    expect(out).toContain('ツールを絞り込む');
    expect(out).toContain('Ctrl+K でも引けます');
  });

  test('左の分類の列は無く、残った道具が 1 段の一覧に並ぶ', function() {
    var out = tm.buildMenuHtml();
    expect(out).not.toContain('tool-menu-cat');
    expect(out).not.toContain('tool-cat-name');
    expect(out).not.toContain('tool-menu-group');
    expect((out.match(/<div class="tool-menu-list">/g) || []).length).toBe(1);
    var list = out.slice(out.indexOf('<div class="tool-menu-list">'), out.indexOf('<div class="tool-menu-hits"'));
    // 「複数クラスに一括適用する」は TICKET-owner-20261122-1023-prune で外し、残りは 2 行。
    expect((list.match(/class="tool-menu-item"/g) || []).length).toBe(2);
    ['tool-lines', 'tool-rename'].forEach(function(id) {
      expect(list).toContain('data-target="' + id + '"');
    });
    expect(list).not.toContain('btn-tab-apply');
  });

  test('項目の件数は項目の印にだけ出る', function() {
    var out = tm.buildMenuHtml({ 'tool-lines': '3' });
    expect((out.match(/tool-menu-badge/g) || []).length).toBe(1);
    expect(out).toContain('<span class="tool-menu-badge">3</span>');
  });

  test('小見出しは 1 回ずつ出て、外した分類の小見出しは無い', function() {
    var out = tm.buildMenuHtml();
    expect((out.match(/class="tool-menu-sub">まとめて直す</g) || []).length).toBe(1);
    expect((out.match(/class="tool-menu-sub">指摘</g) || []).length).toBe(0);
    expect((out.match(/class="tool-menu-sub">変更の履歴</g) || []).length).toBe(0);
    expect((out.match(/class="tool-menu-sub">起こす</g) || []).length).toBe(0);
  });
});

describe('絞り込み', function() {
  test('一覧の全項目から当たる', function() {
    var hits = tm.filterItems('一括置換').concat(tm.filterItems('行を'));
    expect(hits.map(function(h) { return h.id; })).toEqual(['tool-rename', 'tool-lines']);
  });

  test('小見出し・分類名でも引ける', function() {
    expect(tm.filterItems('変更の履歴').length).toBe(0);
    // 一括適用 は TICKET-owner-20261122-1023-prune で外し、まとめて直す は 2 行。
    expect(tm.filterItems('まとめて直す').length).toBe(2);
    expect(tm.filterItems('書き換える').length).toBe(2);
  });

  test('空の絞り込みは全件', function() {
    var all = 0;
    tm.panelGroups().forEach(function(g) { all += g.items.length; });
    expect(tm.filterItems('').length).toBe(all);
  });

  test('候補の HTML は小見出しを添えて出し、当たりが無ければそう言う', function() {
    var out = tm.buildHitsHtml('部品名', {});
    expect(out).toContain('data-target="tool-rename"');
    expect(out).toContain('まとめて直す');
    expect(tm.buildHitsHtml('そんなものは無い', {})).toContain('該当なし');
  });

  test('絞り込みの文言もエスケープされる', function() {
    expect(tm.buildHitsHtml('', { 'tool-lines': '<b>' })).toContain('&lt;b&gt;');
  });
});

describe('画面側の受け皿', function() {
  test('1 段の一覧の CSS が plantuml-assist.html にあり、分類の列の CSS は無い', function() {
    expect(html).toContain('.tool-menu-list');
    expect(html).toContain('.tool-menu-sub');
    expect(html).toContain('.tool-menu-filter');
    expect(html).not.toContain('.tool-menu-cats');
    expect(html).not.toContain('.tool-menu-cat ');
  });

  test('パネルの中をスクロールさせない', function() {
    var block = html.slice(html.indexOf('#tool-menu {'), html.indexOf('#tool-menu[hidden]'));
    expect(block).toContain('overflow: hidden');
    expect(block).not.toContain('overflow-y: auto');
  });
});
