'use strict';
// BLK-builder-20260924-1341-4 (design 9b): ツール ▾ の右列で小見出しが 2 度出ない。
// 同じ小見出しの項目はまとまって並ぶ。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/tool-menu.js')]; } catch (e) {}
require('../src/core/tool-menu.js');
var TM = global.window.MA.toolMenu;

// DOM に頼らず HTML 文字列から小見出しを拾う (runner の window は DOM を持たないことがある)。
function subsIn(html) {
  var out = [];
  var re = /<div class="tool-menu-sub">([^<]*)<\/div>/g;
  var m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

// TICKET-roadmap-20261115-2114-2: パネルは 1 段の一覧 (分類ごとの面は無い)。一覧の小見出しを拾う。
function subsOfList() {
  var html = TM.buildMenuHtml({});
  var start = html.indexOf('<div class="tool-menu-list">');
  var end = html.indexOf('<div class="tool-menu-hits"', start);
  return subsIn(html.slice(start, end));
}

function labelsOf(key) {
  var g = TM.panelGroups().filter(function(x) { return x.key === key; })[0];
  return g.items.map(function(it) { return it.label; });
}

describe('右列の小見出しは各 1 回 (design 9b)', () => {
  test('一覧で小見出しが 2 度出ない', () => {
    var subs = subsOfList();
    var uniq = subs.filter(function(s, i) { return subs.indexOf(s) === i; });
    expect(subs).toEqual(uniq);
  });

  // 「渡す前に」(提出前チェック・引き継ぎチェックリスト) は TICKET-owner-20261115-1828-prune で外した。
  // 「確かめる」分類 (系統チェック・系統マップ・トレース漏れ・突合ボード・観点一括) と
  // 「表記を揃える」(🔤 表記統一) は TICKET-owner-20261115-1841-prune で外した。
  test('確かめる の分類は無い', () => {
    expect(TM.panelGroups().map(function(g) { return g.key; })).not.toContain('check');
  });

  test('書き換える は まとめて直す だけ (1 回)', () => {
    expect(subsOfList()).toEqual(['まとめて直す']);
  });

  test('小見出しを 1 行と数えた行数は 14 行以内のまま', () => {
    expect(TM.rowCount()).toBeLessThanOrEqual(14);
  });

  test('絞り込みの横断結果でも分類の見出しは各 1 回', () => {
    // 「レビュー」分類は TICKET-owner-20261115-2141-prune、「図をつくる」は TICKET-owner-20261116-0321-prune で外した。
    // 残る「書き換える」の 3 行 (同じ小見出し) に当たる語で、小見出しが 1 回だけ出ることを確かめる。
    var subs = subsIn(TM.buildHitsHtml('す', {}));
    expect(subs.length).toBeGreaterThan(0);
    var uniq = subs.filter(function(s, i) { return subs.indexOf(s) === i; });
    expect(subs).toEqual(uniq);
  });
});
