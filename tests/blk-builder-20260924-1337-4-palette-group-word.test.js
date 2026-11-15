'use strict';
// BLK-builder-20260924-1337-4 (design 7b): Ctrl+K に分類の語 (「書き換え」「図をつくる」「Edit」) を
// 打つと、その分類の道具が並ぶ。題で名指しした行は、分類の語で拾った行より前に出る。
// TICKET-owner-20261115-1841-prune: 「確かめる」分類は外したので、分類の代表は「書き換える」の ⇄ 一括置換。
// TICKET-owner-20261115-2141-prune: 「レビュー」分類も外したので、もう 1 つの分類は「図をつくる」。
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
  { id: 'tab-rename', title: '部品名の一括置換 / Bulk rename', hint: 'Tabs', keywords: ['rename', 'ちかん'], button: 'btn-tab-rename', run: noop },
  { id: 'tab-template', title: 'テンプレートから新しい図を作る / Template', hint: 'Tabs', button: 'btn-tab-template', run: noop },
  { id: 'save', title: 'ファイルを保存 / Save', hint: 'File', run: noop },
  { id: 'add-rewrite', title: '書き換える手順を書き足す', group: 'add', run: noop },
];
var DSL = '@startuml\nparticipant Writer\nWriter -> Writer : 書き換え\n@enduml';

function ids(q) { return CP.filter(CP.buildItems(COMMANDS, DSL), q).map(function(i) { return i.id; }); }

describe('分類の語で道具を引ける (design 7b)', () => {
  test('「書き換え」で書き換えるの道具が出る', () => {
    expect(ids('書き換え')).toContain('edit:tab-rename');
  });

  test('「図をつくる」でもその分類の道具が出る', () => {
    expect(ids('図をつくる')).toContain('make:tab-template');
  });

  test('英語の分類名でも引ける', () => {
    expect(ids('Make')).toContain('make:tab-template');
  });

  test('分類の語は別の分類の道具を拾わない', () => {
    var got = ids('書き換え');
    expect(got).not.toContain('make:tab-template');
    expect(got).not.toContain('command:save');
  });

  test('題で名指しした行は、分類の語で拾った行より近い (点が小さい)', () => {
    var items = CP.buildItems(COMMANDS, DSL);
    var tool = items.filter(function(i) { return i.id === 'edit:tab-rename'; })[0];
    var add = items.filter(function(i) { return i.id === 'add:add-rewrite'; })[0];
    expect(CP.score(tool, '書き換え')).toBeGreaterThan(CP.score(add, '書き換え'));
  });

  test('図に足す・図の要素 は分類の語では拾わない (図の中身は名前で引く)', () => {
    expect(ids('要素へ移動')).not.toContain('element:2');
    expect(ids('図に足す')).toEqual([]);
  });

  test('1 文字では分類の語を引かない (ほぼ全部が出てしまう)', () => {
    var items = CP.buildItems(COMMANDS, DSL);
    var make = items.filter(function(i) { return i.id === 'make:tab-template'; })[0];
    // 「く」は題にも呼び名にも無く、分類の語「図をつくる」にだけある。
    expect(CP.score(make, 'く')).toBe(null);
  });

  test('名指しで当たる行の点は変わらない', () => {
    var items = CP.buildItems(COMMANDS, DSL);
    var tool = items.filter(function(i) { return i.id === 'edit:tab-rename'; })[0];
    expect(CP.score(tool, '一括置換')).toBeLessThan(1000);
    expect(ids('一括置換')[0]).toBe('edit:tab-rename');
  });
});
