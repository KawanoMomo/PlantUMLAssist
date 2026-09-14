'use strict';
// BLK-builder-20260907-1425-1: design 4a/4b/4c — 構造タブ下部の一行は
// 図種ごとに数える対象の名前が変わる (classes / actions·branch / states·transitions)。
const assert = require('assert');
if (!global.window) global.window = global;
require('../src/core/dsl-utils.js');
try { delete require.cache[require.resolve('../src/core/outline.js')]; } catch (e) {}
require('../src/core/outline.js');
var ol = global.window.MA.outline;

var CLASS_DSL = [
  '@startuml',
  'title Sample Class',
  'abstract class Shape',
  'class Circle',
  'interface Drawable',
  'Shape <|-- Circle',
  'Circle ..> Drawable',
  '@enduml',
].join('\n');

var ACTIVITY_DSL = [
  '@startuml',
  'start',
  ':入力を受け取る;',
  'if (有効?) then (yes)',
  '  :保存する;',
  'else (no)',
  '  :エラーを返す;',
  'endif',
  'stop',
  '@enduml',
].join('\n');

var STATE_DSL = [
  '@startuml',
  '[*] --> Idle',
  'Idle --> Running : start',
  'Running --> Idle : stop',
  'Running --> [*] : done',
  '@enduml',
].join('\n');

var SEQ_DSL = [
  '@startuml',
  'actor User',
  'participant System',
  'database DB',
  'User -> System : Request',
  'System -> DB : Query',
  '@enduml',
].join('\n');

describe('図種ごとの数え方 (design 4a/4b/4c)', function() {
  test('Class: N classes · M relations', function() {
    var r = ol.build(CLASS_DSL);
    assert.strictEqual(r.counts.classes, 3);
    assert.strictEqual(r.counts.relations, 2);
    assert.strictEqual(ol.summary(r, 'plantuml-class'), 'パース OK · 3 classes · 2 relations');
  });

  test('Activity: N actions · M branch。:処理; は action として数える', function() {
    var r = ol.build(ACTIVITY_DSL);
    assert.strictEqual(r.counts.actions, 3);
    assert.strictEqual(r.counts.branches, 1);
    assert.strictEqual(ol.summary(r, 'plantuml-activity'), 'パース OK · 3 actions · 1 branch');
  });

  test('Activity: else は同じ分岐の 2 本目なので枝を増やさない', function() {
    var one = ol.build(ACTIVITY_DSL).counts.branches;
    var two = ol.build([
      '@startuml', 'start', 'if (a?) then (yes)', ':x;', 'endif',
      'while (b?)', ':y;', 'endwhile', 'stop', '@enduml',
    ].join('\n')).counts.branches;
    assert.strictEqual(one, 1);
    assert.strictEqual(two, 2);
  });

  test('State: N states · M transitions。宣言が無くても遷移の端から状態を数える', function() {
    var r = ol.build(STATE_DSL);
    assert.strictEqual(r.counts.states, 2);       // Idle / Running ([*] は数えない)
    assert.strictEqual(r.counts.relations, 4);
    assert.strictEqual(ol.summary(r, 'plantuml-state'), 'パース OK · 2 states · 4 transitions');
  });

  test('State: state 宣言と遷移の端が重なっても二重に数えない', function() {
    var r = ol.build([
      '@startuml', 'state Idle', 'state Running', '[*] --> Idle', 'Idle --> Running : go', '@enduml',
    ].join('\n'));
    assert.strictEqual(r.counts.states, 2);
  });

  test('Sequence とその他の図種は従来どおり elements · relations', function() {
    var r = ol.build(SEQ_DSL);
    assert.strictEqual(ol.summary(r, 'plantuml-sequence'), 'パース OK · 3 elements · 2 relations');
    assert.strictEqual(ol.summary(r, 'plantuml-usecase'), 'パース OK · 3 elements · 2 relations');
    // 図種を渡さない旧来の呼び方でも壊れない
    assert.strictEqual(ol.summary(r), 'パース OK · 3 elements · 2 relations');
  });

  test('1 件のときは単数形になる', function() {
    var r = ol.build(['@startuml', 'start', ':x;', 'if (a?) then (yes)', 'endif', 'stop', '@enduml'].join('\n'));
    assert.strictEqual(ol.countLabel(r.counts, 'plantuml-activity'), '1 action · 1 branch');
  });

  test('パース NG の見出しは図種によらず件数を出す', function() {
    var r = ol.build('@startuml\nclass A\n');
    assert.ok(/^パース NG · \d+ 件 · /.test(ol.summary(r, 'plantuml-class')));
  });
});
