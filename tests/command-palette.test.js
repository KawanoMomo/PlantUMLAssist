'use strict';
// BLK-builder-20260907-0803-1: Ctrl+K コマンドパレットの絞り込みと候補作り。
// design「リデザイン案」1a の「コマンド・要素を検索 / Run anything」。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/command-palette.js')]; } catch (e) {}
require('../src/core/command-palette.js');
var CP = global.window.MA.commandPalette;

var DSL = [
  '@startuml',
  'title Sample Sequence',
  'actor User',
  'participant "注文サービス" as OrderSvc',
  'database DB',
  'User -> OrderSvc : Request',
  '@enduml',
].join('\n');

var COMMANDS = [
  { id: 'open', title: 'ファイルを開く / Open', hint: 'File', keywords: ['open', 'file'], run: function() {} },
  { id: 'export-svg', title: 'SVG として保存 / Export SVG', hint: 'Export', keywords: ['export', 'svg'], run: function() {} },
  { id: 'zoom-fit', title: '幅に合わせる / Fit', hint: 'View', keywords: ['zoom', 'fit'], run: function() {} },
];

describe('elementItems', function() {
  test('宣言行だけを候補にする (矢印行や title は拾わない)', function() {
    var items = CP.elementItems(DSL);
    expect(items.length).toBe(3);
    expect(items.map(function(i) { return i.title; })).toEqual(
      ['User', '注文サービス (OrderSvc)', 'DB']);
  });

  test('行番号は 1 始まりでエディタの行番号と一致する', function() {
    var items = CP.elementItems(DSL);
    expect(items[0].line).toBe(3);
    expect(items[2].line).toBe(5);
    expect(items[0].hint).toBe('actor · L3');
  });

  test('空の DSL でも落ちない', function() {
    expect(CP.elementItems('').length).toBe(0);
    expect(CP.elementItems(null).length).toBe(0);
  });
});

describe('buildItems', function() {
  test('コマンドと要素が 1 つの一覧になる', function() {
    var items = CP.buildItems(COMMANDS, DSL);
    expect(items.length).toBe(6);
    expect(items[0].kind).toBe('command');
    expect(items[3].kind).toBe('element');
  });

  test('run はそのまま持ち回される', function() {
    var called = 0;
    var items = CP.buildItems([{ id: 'x', title: 'X', run: function() { called++; } }], '');
    items[0].run();
    expect(called).toBe(1);
  });
});

describe('filter', function() {
  var items = CP.buildItems(COMMANDS, DSL);

  test('空クエリなら全件をそのままの順で返す', function() {
    expect(CP.filter(items, '').length).toBe(items.length);
    expect(CP.filter(items, '   ')[0].title).toBe('ファイルを開く / Open');
  });

  test('英語コマンド名で引ける', function() {
    var r = CP.filter(items, 'export');
    expect(r.length).toBe(1);
    expect(r[0].id).toBe('command:export-svg');
  });

  test('日本語でも引ける', function() {
    var r = CP.filter(items, '幅に');
    expect(r[0].id).toBe('command:zoom-fit');
  });

  test('要素名で引ける (要素もコマンドと同じ窓で探せる)', function() {
    var r = CP.filter(items, '注文');
    expect(r.length).toBe(1);
    expect(r[0].kind).toBe('element');
    expect(r[0].line).toBe(4);
  });

  test('大小を無視する', function() {
    expect(CP.filter(items, 'SVG')[0].id).toBe('command:export-svg');
    expect(CP.filter(items, 'db')[0].title).toBe('DB');
  });

  test('該当なしなら 0 件', function() {
    expect(CP.filter(items, 'zzzz').length).toBe(0);
  });

  test('title 一致がキーワード一致より前に並ぶ', function() {
    var r = CP.filter(items, 'open');
    expect(r[0].id).toBe('command:open');
  });
});

describe('score', function() {
  var item = CP.buildItems(COMMANDS, '')[1];

  test('一致しなければ null', function() {
    expect(CP.score(item, 'zzz')).toBeNull();
  });

  test('飛ばし打ち (部分列) も拾うが、連続一致より弱い', function() {
    var loose = CP.score(item, 'et');   // export の e...t。連続では現れない
    var tight = CP.score(item, 'ex');   // export の頭。連続一致
    expect(loose).toBeGreaterThan(tight);
  });

  test('空クエリは 0', function() {
    expect(CP.score(item, '')).toBe(0);
  });
});

describe('moveIndex', function() {
  test('↓ で次へ', function() {
    expect(CP.moveIndex(0, 1, 3)).toBe(1);
  });

  test('末尾から ↓ で先頭へ折り返す', function() {
    expect(CP.moveIndex(2, 1, 3)).toBe(0);
  });

  test('先頭から ↑ で末尾へ折り返す', function() {
    expect(CP.moveIndex(0, -1, 3)).toBe(2);
  });

  test('候補 0 件なら -1', function() {
    expect(CP.moveIndex(0, 1, 0)).toBe(-1);
  });
});
