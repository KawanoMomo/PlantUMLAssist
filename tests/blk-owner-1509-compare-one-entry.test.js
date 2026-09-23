'use strict';
// BLK-owner-20260923-1509-prune: 「2 つを左右に置いて見比べる」入口が 5 つあり、
// うち 2 つ (並べて比較 / ⇔ 並べて見る) はタブ列で隣り合って名前では区別できなかった。
// 面を 1 つ (並べて比較の枠) にして、選ぶのは「誰と並べるか」だけにする。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/compare-entry.js')]; } catch (e) {}
require('../src/core/compare-entry.js');
var CE = global.window.MA.compareEntry;

describe('並べる相手は 3 つ、面は 1 つ', function() {
  test('相手は 別のフォルダ / 別タブ / 前回保存版 の 3 つ', function() {
    expect(CE.targets().map(function(t) { return t.id; }))
      .toEqual(['folder', 'tabs', 'before']);
  });

  test('札は「何と並べるか」を言う。使う人の立場 (先輩) を名乗らない', function() {
    expect(CE.labelOf('folder')).toBe('別のフォルダの図');
    expect(CE.labelOf('tabs')).toBe('別タブの図');
    expect(CE.labelOf('before')).toBe('この図の前回保存版');
    CE.targets().forEach(function(t) {
      expect(/先輩/.test(t.label)).toBe(false);
      expect(t.title.length).toBeGreaterThan(0);
    });
  });

  test('相手を決めずに開いたら、図の切り替えに追従する 別のフォルダ から見せる', function() {
    expect(CE.defaultTarget()).toBe('folder');
    expect(CE.isTarget(CE.defaultTarget())).toBe(true);
  });

  test('知らない相手は routeOf も labelOf も答えない', function() {
    expect(CE.isTarget('meeting')).toBe(false);
    expect(CE.routeOf('meeting')).toBe(null);
    expect(CE.labelOf('')).toBe('');
    expect(CE.titleOf(null)).toBe('');
  });
});

describe('どの相手も、鳴らす入口とモードが決まっている', function() {
  test('別のフォルダは 並べて比較 の枠そのもの', function() {
    expect(CE.routeOf('folder')).toEqual({ target: 'folder', button: 'btn-tab-senior', mode: 'ref' });
  });

  test('別タブと前回保存版は同じ面を、違うモードで開く', function() {
    var tabs = CE.routeOf('tabs');
    var before = CE.routeOf('before');
    expect(tabs.button).toBe(before.button);
    expect(tabs.mode).toBe('ref');
    expect(before.mode).toBe('diff');
  });
});

describe('入口が減っても、今までの名前で引ける', function() {
  test('旧称 (先輩 / 並べて見る / 変更前後) はどれかの相手に残っている', function() {
    var all = ['folder', 'tabs', 'before'].reduce(function(a, id) {
      return a.concat(CE.aliasesOf(id));
    }, []);
    ['先輩', '並べて見る', '変更前後を見比べる', '前回保存版', 'compare', 'ならべて']
      .forEach(function(word) { expect(all).toContain(word); });
  });

  test('aliasesOf は控えを返すので、呼び出し側が台帳を壊せない', function() {
    var a = CE.aliasesOf('tabs');
    a.push('壊す');
    expect(CE.aliasesOf('tabs')).not.toContain('壊す');
    expect(CE.aliasesOf('nope')).toEqual([]);
  });

  test('Ctrl+K は 3 つとも引け、どれも「並べて比較」の名で出る', function() {
    var items = CE.paletteItems();
    expect(items.length).toBe(3);
    items.forEach(function(it) {
      expect(it.title.indexOf('並べて比較')).toBe(0);
      expect(it.keywords).toContain('compare');
      expect(CE.isTarget(it.target)).toBe(true);
    });
    expect(items[1].keywords).toContain('並べて見る');
    expect(items[2].keywords).toContain('前回保存版');
  });
});

describe('たたんだ入口と、下端の札', function() {
  test('⇔ 並べて見る と 🔍 変更前後を見比べる は別の入口として並べない', function() {
    expect(CE.foldedInto('btn-tab-compare')).toBe('tabs');
    expect(CE.foldedInto('dp-review')).toBe('before');
    expect(CE.foldedIds().sort()).toEqual(['btn-tab-compare', 'dp-review']);
  });

  test('残す 並べて比較 は畳んだ側に居ない', function() {
    expect(CE.foldedInto('btn-tab-senior')).toBe('');
  });

  test('下端の札は名前のまま、押すと同じ枠がその相手で開く', function() {
    expect(CE.targetForBadge('status-senior')).toBe('folder');
    expect(CE.targetForBadge('status-livediff')).toBe('before');
    expect(CE.targetForBadge('status-pins')).toBe('');
  });
});
