'use strict';
// BLK-builder-20260907-2041-4 (design 2a): パレットの「選択中の要素に対して」は
// 2d と同じ流儀で「何が起きるか」を先に書き、記法を右に小さく置く。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/command-palette.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var cp = global.window.MA.commandPalette;

describe('describeAction (design 2a)', () => {
  test('ライフライン推論のボタンは「何が起きるか」+ 記法になる', () => {
    var d = cp.describeAction('⚡ ライフライン推論 (activate/deactivate)');
    expect(d.title).toBe('呼び出しの開始・終了を自動で入れる');
    expect(d.hint).toBe('activate');
  });

  test('alt/loop のボタンも同じ形になる', () => {
    var d = cp.describeAction('⌗ alt/loop で囲む…');
    expect(d.title).toBe('条件分岐・繰り返しの枠で囲む');
    expect(d.hint).toBe('alt / loop');
  });

  test('挿入・移動・削除も記号ではなく起きることで出る', () => {
    expect(cp.describeAction('↑ この前にメッセージ追加').title).toBe('選んだ行の前に足す');
    expect(cp.describeAction('↓ この後にメッセージ追加').title).toBe('選んだ行の後に足す');
    expect(cp.describeAction('↓ この後に注釈追加').title).toBe('選んだ行に説明を書き添える');
    expect(cp.describeAction('↑ 上へ').hint).toBe('Alt+↑');
    expect(cp.describeAction('✕ 削除').title).toBe('選んだ要素を消す');
    expect(cp.describeAction('⇄').title).toBe('From と To を入れ替える');
  });

  test('言い換えの無いボタンは、先頭の記号と末尾の「…」だけ落とす', () => {
    expect(cp.describeAction('⧉ 他の図から取り込む…').title).toBe('他の図から取り込む');
    expect(cp.describeAction('⧉ 他の図から取り込む…').hint).toBe('');
  });

  test('記号の無い日本語のボタンはそのまま残る', () => {
    expect(cp.describeAction('選択解除').title).toBe('選択解除');
  });

  test('元のボタンの文字は label として残る (検索に使える)', () => {
    var d = cp.describeAction('⚡ ライフライン推論 (activate/deactivate)');
    expect(d.label).toBe('⚡ ライフライン推論 (activate/deactivate)');
  });

  test('空のボタンでも落ちない', () => {
    expect(cp.describeAction('').title).toBe('');
    expect(cp.describeAction(null).title).toBe('');
  });

  test('言い換えた候補も、元のボタンの文字で絞り込める', () => {
    var raw = '⚡ ライフライン推論 (activate/deactivate)';
    var d = cp.describeAction(raw);
    var items = cp.buildItems([{
      id: 'sel-0', group: 'selected', title: d.title, hint: d.hint,
      keywords: ['selected', raw, d.title, d.hint], run: function() {},
    }], '');
    expect(cp.filter(items, 'ライフライン').length).toBe(1);
    expect(cp.filter(items, 'activate').length).toBe(1);
    expect(cp.filter(items, '呼び出し').length).toBe(1);
  });
});
