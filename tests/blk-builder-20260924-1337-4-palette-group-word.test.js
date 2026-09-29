'use strict';
// BLK-builder-20260924-1337-4 (design 7b): Ctrl+K に分類の語 (「確かめ」「渡す」「Check」) を
// 打つと、その分類の道具が並ぶ。題で名指しした行は、分類の語で拾った行より前に出る。
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
var CP = global.window.MA.commandPalette;

function noop() {}

var COMMANDS = [
  // BLK-owner-20260924-1332-prune: 🔍 名前突合は ▦ 突合ボードの行に畳んだ (旧名は語に残る)。
  { id: 'tab-cross', title: '突合ボード / Cross-check board', hint: 'Tabs', keywords: ['名前突合', 'name audit'], button: 'btn-tab-cross', run: noop },
  { id: 'tab-board', title: '変更サマリを開く / Change board', hint: 'Tabs', button: 'btn-tab-board', run: noop },
  { id: 'tab-handoff', title: '引き継ぎパッケージを作る / Handoff package', hint: 'Tabs', button: 'btn-tab-handoff', run: noop },
  { id: 'tab-template', title: 'テンプレートから新しい図を作る / Template', hint: 'Tabs', button: 'btn-tab-template', run: noop },
  { id: 'save', title: 'ファイルを保存 / Save', hint: 'File', run: noop },
  { id: 'add-check', title: '確かめる手順を書き足す', group: 'add', run: noop },
];
var DSL = '@startuml\nparticipant Checker\nChecker -> Checker : 確かめ\n@enduml';

function ids(q) { return CP.filter(CP.buildItems(COMMANDS, DSL), q).map(function(i) { return i.id; }); }

describe('分類の語で道具を引ける (design 7b)', () => {
  test('「確かめ」で確かめるの道具が出る', () => {
    expect(ids('確かめ')).toContain('check:tab-cross');
  });

  test('「渡す」「レビュー」でもその分類の道具が出る', () => {
    expect(ids('渡す')).toContain('give:tab-handoff');
    expect(ids('レビュー')).toContain('review:tab-board');
    expect(ids('図をつくる')).toContain('make:tab-template');
  });

  test('英語の分類名でも引ける', () => {
    expect(ids('check')).toContain('check:tab-cross');
    expect(ids('Deliver')).toContain('give:tab-handoff');
  });

  test('分類の語は別の分類の道具を拾わない', () => {
    var got = ids('確かめ');
    expect(got).not.toContain('give:tab-handoff');
    expect(got).not.toContain('review:tab-board');
    expect(got).not.toContain('command:save');
  });

  test('題で名指しした行は、分類の語で拾った行より近い (点が小さい)', () => {
    var items = CP.buildItems(COMMANDS, DSL);
    var audit = items.filter(function(i) { return i.id === 'check:tab-cross'; })[0];
    var add = items.filter(function(i) { return i.id === 'add:add-check'; })[0];
    expect(CP.score(audit, '確かめ')).toBeGreaterThan(CP.score(add, '確かめ'));
  });

  test('図に足す・図の要素 は分類の語では拾わない (図の中身は名前で引く)', () => {
    expect(ids('要素へ移動')).not.toContain('element:2');
    expect(ids('図に足す')).toEqual([]);
  });

  test('1 文字では分類の語を引かない (ほぼ全部が出てしまう)', () => {
    var items = CP.buildItems(COMMANDS, DSL);
    var handoff = items.filter(function(i) { return i.id === 'give:tab-handoff'; })[0];
    // 「渡」は題にも呼び名にも無く、分類の語「渡す」にだけある。
    expect(CP.score(handoff, '渡')).toBe(null);
  });

  test('名指しで当たる行の点は変わらない', () => {
    var items = CP.buildItems(COMMANDS, DSL);
    var audit = items.filter(function(i) { return i.id === 'check:tab-cross'; })[0];
    expect(CP.score(audit, '表記揺れ')).toBeLessThan(1000);
    expect(ids('名前突合')[0]).toBe('check:tab-cross');
  });
});
