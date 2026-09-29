'use strict';
// BLK-junior-20260908-2203-wish: 画像を書き出した瞬間の図を「提出物庫」へ積み、
// あとの周が同じファイル名で上書きしても前回分が消えないことを固定する。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/component-pack.js', '../src/core/version-history.js',
 '../src/core/vault.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var V = global.window.MA.vault;

var STATE_DSL = ['@startuml', 'title GPIOドライバ状態遷移(資料用)',
  '[*] --> Uninit', 'Uninit --> Ready : Gpio_Init', '@enduml'].join('\n');
var SEQ_DSL = ['@startuml', 'title GPIOドライバ初期化シーケンス',
  'participant Gpio_Driver', 'Gpio_Driver -> Port_Ctrl : Gpio_Init', '@enduml'].join('\n');

// server が返す形。刻印は UTC、新しいものほど大きい。
var PAYLOAD = { entries: [
  { stamp: '20260908-100000', at: '2026-09-08T10:00:00Z', subject: 'GPIOドライバ',
    kind: '状態遷移図', title: 'GPIOドライバ状態遷移(資料用)', name: 'diagram1', format: 'SVG', lines: 5 },
  { stamp: '20260907-090000', at: '2026-09-07T09:00:00Z', subject: 'GPIOドライバ',
    kind: '状態遷移図', title: 'GPIOドライバ状態遷移', name: 'diagram1', format: 'SVG', lines: 4 },
  { stamp: '20260906-080000', at: '2026-09-06T08:00:00Z', subject: 'GPIOドライバ',
    kind: 'シーケンス図', title: 'GPIOドライバ初期化シーケンス', name: 'diagram1',
    format: 'PNG（透過背景）', lines: 4 },
] };

describe('vault.entryFor', function() {
  test('図種は DSL の構造から決める (題名が「(資料用)」でも状態遷移図)', function() {
    var e = V.entryFor({ dsl: STATE_DSL, title: 'GPIOドライバ状態遷移(資料用)', name: 'diagram1', format: 'SVG' });
    expect(e.kind).toBe('状態遷移図');
    expect(e.subject).toBe('GPIOドライバ');
    expect(e.format).toBe('SVG');
  });

  test('ファイル名が diagram1 のままでも、題名から部品名が決まる', function() {
    var e = V.entryFor({ dsl: SEQ_DSL, title: 'GPIOドライバ初期化シーケンス', name: 'diagram1' });
    expect(e.subject).toBe('GPIOドライバ初期化');
    expect(e.kind).toBe('シーケンス図');
  });

  test('題名が無ければファイル名で決める', function() {
    var e = V.entryFor({ dsl: SEQ_DSL, title: '', name: 'gpio_sequence' });
    expect(e.subject).toBe('gpio');
  });

  test('title / skinparam / コメントは図種の判定に使わない', function() {
    expect(V.headLine(STATE_DSL)).toBe('[*] --> Uninit');
  });
});

describe('vault.rows / pick', function() {
  var rows = V.rows(PAYLOAD);

  test('新しい順に並ぶ', function() {
    expect(rows[0].stamp).toBe('20260908-100000');
    expect(rows[2].stamp).toBe('20260906-080000');
  });

  test('部品 × 図種 × 前回分を 1 回で取れる (手順1 の入口)', function() {
    var prev = V.pick(rows, 'GPIOドライバ', '状態遷移図', 1);
    expect(prev.stamp).toBe('20260907-090000');
    var latest = V.pick(rows, 'GPIOドライバ', '状態遷移図', 0);
    expect(latest.stamp).toBe('20260908-100000');
  });

  test('無い組み合わせは null (別の図をそれらしく出さない)', function() {
    expect(V.pick(rows, 'GPIOドライバ', 'クラス図', 0)).toBeNull();
    expect(V.pick(rows, 'UARTドライバ', '状態遷移図', 0)).toBeNull();
  });

  test('部品と図種の一覧が出る', function() {
    var subs = V.subjects(rows);
    expect(subs.length).toBe(1);
    expect(subs[0].count).toBe(3);
    expect(subs[0].kinds.length).toBe(2);
  });

  test('見出しに件数と最新の日時が出る', function() {
    var t = V.summaryText(rows, 'GPIOドライバ');
    expect(t).toContain('3 件');
    expect(t).toContain('2 図種');
  });

  test('空の庫でも黙らない', function() {
    expect(V.summaryText([], '')).toContain('提出物庫は空です');
  });
});

