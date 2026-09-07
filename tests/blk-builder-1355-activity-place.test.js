'use strict';
// BLK-builder-20260907-1355-3 (design 4b の右ペイン「位置」):
// 選んでいるアクションの居場所を行番号ではなく構造で示す
// (例: 条件分岐「有効?」の yes 側、1 番目)。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/selection-reorder.js')]; } catch (e) {}
try { delete require.cache[require.resolve('../src/core/activity-insert.js')]; } catch (e) {}
require('../src/core/selection-reorder.js');
require('../src/core/activity-insert.js');
var AI = global.window.MA.activityInsert;

var SAMPLE = [
  '@startuml',                 // 1
  'title Sample Activity',     // 2
  'start',                     // 3
  ':入力を受け取る;',           // 4
  'if (有効?) then (yes)',     // 5
  '  :保存する;',              // 6
  '  :通知する;',              // 7
  'else (no)',                 // 8
  '  :エラーを返す;',           // 9
  'endif',                     // 10
  ':後始末;',                  // 11
  'stop',                      // 12
  '@enduml',                   // 13
].join('\n');

describe('BLK-builder-1355 位置を構造で示す', function() {
  test('フローの直下は「フローの N 番目」', function() {
    expect(AI.describeStructure(SAMPLE, 4)).toBe('フローの 1 番目');
    // if ブロック全体もフローの 1 つとして数える
    expect(AI.describeStructure(SAMPLE, 11)).toBe('フローの 3 番目');
  });

  test('then 側は「条件分岐「有効?」の yes 側、N 番目」', function() {
    expect(AI.describeStructure(SAMPLE, 6)).toBe('条件分岐「有効?」の yes 側、1 番目');
    expect(AI.describeStructure(SAMPLE, 7)).toBe('条件分岐「有効?」の yes 側、2 番目');
  });

  test('else 側は枝のラベルが no に変わり、番号は数え直す', function() {
    expect(AI.describeStructure(SAMPLE, 9)).toBe('条件分岐「有効?」の no 側、1 番目');
  });

  test('if の行そのものはフローの位置として示す', function() {
    expect(AI.describeStructure(SAMPLE, 5)).toBe('フローの 2 番目');
  });

  test('else / endif / start / stop / @startuml には位置を出さない', function() {
    ['8', '10', '3', '12', '1'].forEach(function(n) {
      expect(AI.describeStructure(SAMPLE, Number(n))).toBe('');
    });
  });

  test('範囲外の行では空文字を返す', function() {
    expect(AI.describeStructure(SAMPLE, 0)).toBe('');
    expect(AI.describeStructure(SAMPLE, 99)).toBe('');
  });
});

describe('BLK-builder-1355 ブロックの種類ごとの言い方', function() {
  test('while は「繰り返し「条件」の中」', function() {
    var dsl = '@startuml\nstart\nwhile (残りあり?) is (yes)\n  :1 件処理する;\nendwhile\nstop\n@enduml';
    expect(AI.describeStructure(dsl, 4)).toBe('繰り返し「残りあり?」の中、1 番目');
  });

  test('fork は何本目かを示す', function() {
    var dsl = ['@startuml', 'start', 'fork', '  :A;', 'fork again', '  :B;', '  :C;',
      'end fork', 'stop', '@enduml'].join('\n');
    expect(AI.describeStructure(dsl, 4)).toBe('並行処理の 1 本目、1 番目');
    expect(AI.describeStructure(dsl, 7)).toBe('並行処理の 2 本目、2 番目');
  });

  test('入れ子の内側は、いちばん内側のブロックで示す', function() {
    var dsl = ['@startuml', 'start', 'if (外?) then (yes)', '  if (内?) then (ok)',
      '    :X;', '  endif', 'endif', 'stop', '@enduml'].join('\n');
    expect(AI.describeStructure(dsl, 5)).toBe('条件分岐「内?」の ok 側、1 番目');
  });
});
