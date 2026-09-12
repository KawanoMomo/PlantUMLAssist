'use strict';
// BLK-reviewer-20260912-2103-wish: driver_common_class.puml が 7 クラス・35 メソッド超から
// 3 行に激減し、その 3 行が plantuml-class.puml とバイト完全一致していた。
// GUI にどの保存操作がそれを起こしたかの記録が無く、reviewer は puml のバイト比較から
// 推測するしかなかった。保存のその場で気付けること・後から操作を辿れることを固定する。
const assert = require('assert');
if (!global.window) global.window = global;
try { delete require.cache[require.resolve('../src/core/save-swap.js')]; } catch (e) {}
var SS = require('../src/core/save-swap.js');

var TEMPLATE_CLASS = ['@startuml', 'class Foo', '@enduml'].join('\n');

var FULL_CLASS = ['@startuml', 'title driver_common_class'].concat(
  ['Spi_Driver', 'Can_Driver', 'Gpio_Driver', 'Irq_Driver', 'Uart_Driver', 'Adc_Driver', 'Timer_Driver']
    .map(function(c) { return 'class ' + c + ' {\n  +Init()\n  +DeInit()\n  +Read()\n}'; })
).concat(['@enduml']).join('\n');

var FOLDER = [
  { name: 'plantuml-class', dsl: TEMPLATE_CLASS },
  { name: 'plantuml-sequence', dsl: ['@startuml', 'A -> B : x', 'B -> A : y', '@enduml'].join('\n') },
  { name: 'gpio_state', dsl: ['@startuml', 'state Idle', 'Idle --> Idle : tick', '@enduml'].join('\n') },
];

// --- 事故そのもの -----------------------------------------------------------
(function theAccident() {
  var res = SS.inspect({
    name: 'driver_common_class', dsl: TEMPLATE_CLASS,
    prev: FULL_CLASS, folderDocs: FOLDER,
  });
  assert.ok(res.warn, '保存したその場で警告になる');
  assert.deepStrictEqual(res.twins, ['plantuml-class'],
    '中身が一致した別名のファイルを名指しできる');
  assert.ok(res.shrink, '行が激減したことも言う');
  assert.strictEqual(res.shrink.after, 3);
  assert.strictEqual(res.lines.length, 2);
  assert.ok(res.lines[0].indexOf('plantuml-class') >= 0);
  assert.ok(SS.summaryLine(res).indexOf('driver_common_class') >= 0);
})();

// --- ふつうの保存では黙る ---------------------------------------------------
(function quietOnNormalSave() {
  var grown = FULL_CLASS + '\nSpi_Driver --> Can_Driver';
  var res = SS.inspect({ name: 'driver_common_class', dsl: grown, prev: FULL_CLASS, folderDocs: FOLDER });
  assert.strictEqual(res.warn, false, '書き足した保存では帯を出さない');
  assert.deepStrictEqual(res.twins, []);
  assert.strictEqual(res.shrink, null);

  // 数行の図から 1〜2 行消しただけでは「激減」と言わない
  var small = SS.inspect({
    name: 'memo', dsl: '@startuml\nclass A\n@enduml',
    prev: '@startuml\nclass A\nclass B\nclass C\n@enduml', folderDocs: [],
  });
  assert.strictEqual(small.shrink, null);

  // 初回保存 (直前の中身が無い) では減少を見ない
  var first = SS.inspect({ name: 'new_one', dsl: TEMPLATE_CLASS, prev: null, folderDocs: [] });
  assert.strictEqual(first.shrink, null);

  // 空白・行末の違いだけでは別の中身にしない (同じ図を二度別判定にしない)
  assert.strictEqual(SS.normalize('@startuml\nclass A  \n@enduml\n\n'),
    SS.normalize('@startuml\nclass A\n@enduml'));
})();

// --- 骨だけの図は一致していても叩かない -------------------------------------
(function thinDocs() {
  var bones = '@startuml\n@enduml';
  var res = SS.inspect({
    name: 'draft2', dsl: bones, prev: null,
    folderDocs: [{ name: 'draft1', dsl: bones }],
  });
  assert.deepStrictEqual(res.twins, [], '中身の無い図どうしの一致は事故ではない');
  assert.strictEqual(res.warn, false);

  // 自分自身とは一致させない (同じ名前のファイルは自分)
  var self = SS.inspect({
    name: 'plantuml-class', dsl: TEMPLATE_CLASS, prev: null, folderDocs: FOLDER,
  });
  assert.deepStrictEqual(self.twins, []);
})();

// --- 保存操作の控え ---------------------------------------------------------
(function theLog() {
  var mem = (function() {
    var box = {};
    return {
      getItem: function(k) { return Object.prototype.hasOwnProperty.call(box, k) ? box[k] : null; },
      setItem: function(k, v) { box[k] = String(v); },
    };
  })();
  var DIR = './persona-data/primary';

  assert.deepStrictEqual(SS.load(mem, DIR).entries, [], '最初は空');

  var res = SS.inspect({ name: 'driver_common_class', dsl: TEMPLATE_CLASS,
    prev: FULL_CLASS, folderDocs: FOLDER });
  var log = SS.record(SS.load(mem, DIR), res, '2026-09-12T21:30:00Z', SS.lineCount(TEMPLATE_CLASS));
  SS.save(mem, DIR, log);

  var back = SS.load(mem, DIR);
  assert.strictEqual(back.entries.length, 1);
  assert.strictEqual(back.entries[0].name, 'driver_common_class');
  assert.deepStrictEqual(back.entries[0].twins, ['plantuml-class']);
  var line = SS.logLine(back.entries[0]);
  assert.ok(line.indexOf('driver_common_class') >= 0, '控えの 1 行にファイル名が入る');
  assert.ok(line.indexOf('plantuml-class') >= 0, '一致した相手のファイル名も入る');

  // 警告の出なかった保存も積む (事故の直前に何を保存したかが欠けないように)
  var quiet = SS.inspect({ name: 'gpio_state', dsl: FOLDER[2].dsl, prev: null, folderDocs: [] });
  log = SS.record(back, quiet, '2026-09-12T21:31:00Z', 4);
  assert.strictEqual(log.entries.length, 2);
  assert.strictEqual(log.entries[0].name, 'gpio_state', '新しいものが先頭');

  // 上限を超えたら古いものから落ちる
  var many = { entries: [] };
  for (var i = 0; i < SS.MAX_ENTRIES + 5; i++) {
    many = SS.record(many, { name: 'x' + i, twins: [], shrink: null }, '2026-09-12T00:00:00Z', 1);
  }
  assert.strictEqual(many.entries.length, SS.MAX_ENTRIES);
  assert.strictEqual(many.entries[0].name, 'x' + (SS.MAX_ENTRIES + 4));

  // 保存フォルダごとに別の控え (別のフォルダを開いても混ざらない)
  assert.notStrictEqual(SS.storageKey('./a'), SS.storageKey('./b'));
  // store が無くても落ちない
  assert.strictEqual(SS.save(null, DIR, log), false);
  assert.deepStrictEqual(SS.load(null, DIR).entries, []);
})();

console.log('blk-reviewer-2103-wish-save-swap: ok');
