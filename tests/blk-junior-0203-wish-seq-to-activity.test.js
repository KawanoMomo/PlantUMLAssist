'use strict';
// BLK-junior-20260909-0203-wish: シーケンス図に書いてある処理順を、
// アクティビティ図側で打ち直さずに取り込む。先輩の gpio_init_sequence.puml から
// EnableClock → WriteConfig → EnableIrq → InitDone の 4 個がそのまま並ぶことを
// ここで固定する (利用者が手で打ち直したのがちょうどこの 4 個)。
const assert = require('assert');
if (!global.window) global.window = global;
try { delete require.cache[require.resolve('../src/core/seq-to-activity.js')]; } catch (e) {}
require('../src/core/seq-to-activity.js');
var s2a = global.window.MA.seqToActivity;

// 先輩の図そのまま。
var GPIO_SEQ = [
  '@startuml',
  'title GPIO_Init_Sequence',
  'actor App',
  'participant Gpio_Driver',
  'participant GpioRegs',
  'participant ClockCtrl',
  'participant IRQCtrl',
  'note over Gpio_Driver : shares Driver_Common base with Spi_Driver',
  'App -> Gpio_Driver : Gpio_Init()',
  'Gpio_Driver -> ClockCtrl : EnableClock()',
  'Gpio_Driver -> GpioRegs : WriteConfig()',
  'Gpio_Driver -> IRQCtrl : EnableIrq()',
  'IRQCtrl --> Gpio_Driver : Ack',
  'Gpio_Driver --> App : InitDone',
  '@enduml',
].join('\n');

var ACTIVITY_DOC = [
  '@startuml',
  'start',
  ':既にある処理;',
  'stop',
  '@enduml',
].join('\n');

function run(name, fn) {
  try { fn(); console.log('  ok - ' + name); }
  catch (e) { console.log('  FAIL - ' + name + ': ' + e.message); process.exitCode = 1; }
}

console.log('BLK-junior-0203-wish seq-to-activity');

run('メッセージ行を送り手・受け手・ラベルに割る', function() {
  var m = s2a.message('Gpio_Driver -> ClockCtrl : EnableClock()');
  assert.strictEqual(m.from, 'Gpio_Driver');
  assert.strictEqual(m.to, 'ClockCtrl');
  assert.strictEqual(m.label, 'EnableClock()');
});

run('左向きの矢印は送り手が右側', function() {
  var m = s2a.message('App <- Gpio_Driver : InitDone');
  assert.strictEqual(m.from, 'Gpio_Driver');
  assert.strictEqual(m.to, 'App');
});

run('宣言・note・コメントはメッセージにしない', function() {
  assert.strictEqual(s2a.message('participant Gpio_Driver'), null);
  assert.strictEqual(s2a.message('note over Gpio_Driver : shares base'), null);
  assert.strictEqual(s2a.message("' Gpio_Driver -> X : Y"), null);
  assert.strictEqual(s2a.message('@startuml'), null);
});

run('主役は「いちばん多く送っている部品」', function() {
  assert.strictEqual(s2a.mainParticipant(GPIO_SEQ), 'Gpio_Driver');
});

run('その部品が送るメッセージだけが Action になる (受けと応答は入れない)', function() {
  var a = s2a.actions(GPIO_SEQ, 'Gpio_Driver');
  assert.deepStrictEqual(a, ['EnableClock', 'WriteConfig', 'EnableIrq', 'InitDone']);
});

run('呼び出し記法の括弧は落とす (Action は処理名)', function() {
  assert.deepStrictEqual(s2a.actions('A -> B : Do()', 'A'), ['Do']);
});

run('同じ処理を 2 回呼ぶ図では 2 回並ぶ (順序が意味を持つ)', function() {
  var dsl = ['A -> B : Send()', 'A -> C : Wait()', 'A -> B : Send()'].join('\n');
  assert.deepStrictEqual(s2a.actions(dsl, 'A'), ['Send', 'Wait', 'Send']);
});

run('アクティビティ図の下書きを 1 枚組み立てる', function() {
  var dsl = s2a.draft(GPIO_SEQ, 'Gpio_Driver', 'GPIO_Init_Activity');
  assert.deepStrictEqual(dsl.split('\n'), [
    '@startuml',
    'title GPIO_Init_Activity',
    'start',
    ':EnableClock;',
    ':WriteConfig;',
    ':EnableIrq;',
    ':InitDone;',
    'stop',
    '@enduml',
  ]);
});

run('対象を指定しなければ主役で起こす', function() {
  assert.ok(s2a.draft(GPIO_SEQ, '', '').indexOf(':EnableClock;') >= 0);
});

run('起こした図の名前で元の図が辿れる', function() {
  assert.strictEqual(s2a.draftName('gpio_init_sequence.puml', 'Gpio_Driver'), 'gpio_init_Activity');
  assert.strictEqual(s2a.draftName('diagram1.puml', 'A'), 'diagram1_activity');
});

run('開いているシーケンス図から候補を作る (図 × 送り手)', function() {
  var docs = [
    { id: 'a1', name: 'act.puml', dsl: ACTIVITY_DOC, diagramType: 'plantuml-activity' },
    { id: 's1', name: 'gpio_init_sequence.puml', dsl: GPIO_SEQ, diagramType: 'plantuml-sequence' },
  ];
  var cs = s2a.candidates(docs, 'a1');
  var main = cs.filter(function(c) { return c.participant === 'Gpio_Driver'; })[0];
  assert.ok(main, cs.map(function(c) { return c.participant; }).join(','));
  assert.strictEqual(main.docName, 'gpio_init_sequence.puml');
  assert.deepStrictEqual(main.labels, ['EnableClock', 'WriteConfig', 'EnableIrq', 'InitDone']);
  // 応答しか送らない部品も候補にはなる (どちらを起こすかは利用者が選ぶ)
  assert.ok(cs.length >= 2, String(cs.length));
});

run('シーケンス図が無ければ候補は無い', function() {
  var docs = [{ id: 'a1', name: 'act.puml', dsl: ACTIVITY_DOC, diagramType: 'plantuml-activity' }];
  assert.deepStrictEqual(s2a.candidates(docs, null), []);
});

// 一括欄の取り込みは reuse-picker 経由。図種をまたいで Action 候補が並ぶこと。
try { delete require.cache[require.resolve('../src/core/line-edit.js')]; } catch (e) {}
require('../src/core/line-edit.js');
try { delete require.cache[require.resolve('../src/core/reuse-picker.js')]; } catch (e) {}
require('../src/core/reuse-picker.js');
var rp = global.window.MA.reusePicker;

run('取り込み一覧にシーケンス図の処理順が並ぶ (出処が分かる)', function() {
  var docs = [
    { id: 'a1', name: 'act.puml', dsl: ACTIVITY_DOC, diagramType: 'plantuml-activity' },
    { id: 's1', name: 'gpio_init_sequence.puml', dsl: GPIO_SEQ, diagramType: 'plantuml-sequence' },
  ];
  var items = rp.collect(docs, 'plantuml-activity', 'a1');
  var texts = items.map(function(i) { return i.text; });
  ['EnableClock', 'WriteConfig', 'EnableIrq', 'InitDone'].forEach(function(l) {
    assert.ok(texts.indexOf(l) >= 0, l + ' が無い: ' + texts.join(','));
  });
  var one = items.filter(function(i) { return i.text === 'EnableClock'; })[0];
  assert.strictEqual(one.from, 'gpio_init_sequence.puml → Gpio_Driver');
  assert.strictEqual(one.kind, 'action');
});

run('取り込んだ順序が一括欄の並びになる', function() {
  var docs = [
    { id: 's1', name: 'gpio_init_sequence.puml', dsl: GPIO_SEQ, diagramType: 'plantuml-sequence' },
  ];
  var items = rp.collect(docs, 'plantuml-activity', null)
    .filter(function(i) { return i.from === 'gpio_init_sequence.puml → Gpio_Driver'; });
  assert.strictEqual(rp.toBlock(items),
    ['EnableClock', 'WriteConfig', 'EnableIrq', 'InitDone'].join('\n'));
});

run('他の図種の一括欄には持ち込まない', function() {
  var docs = [
    { id: 's1', name: 'gpio_init_sequence.puml', dsl: GPIO_SEQ, diagramType: 'plantuml-sequence' },
  ];
  assert.deepStrictEqual(rp.crossKind(docs, 'plantuml-state', null), []);
  assert.deepStrictEqual(rp.crossKind(docs, 'plantuml-class', null), []);
});
