'use strict';
// BLK-junior-20260924-0704-wish (+ BLK-junior-20260923-2012): 手順 1 で相手の図が
// 見つからないとき、図種ごとに「並べて比較 → 無ければ他フォルダを探す」を繰り返していた。
// ここで固定するのは:
//   - 並べて比較の相手選び: 同じ部品 (adc) の別図種しか無く、同じ図種は共通図
//     (driver_common_class) だけなら、図種の違う候補ではなく共通図を部品で絞って出す
//   - 共通図も無く、相手にその図種が別部品ぶんだけあるときは「無い」と枚数つきで言い切る
//     (自分の見本図に差し替える印 sameKind を持つ)
//   - 部品ビューの先輩欄: 部品名の図が無い図種は、共通の図を「部品で絞る」と同じ絞りで出し、
//     出典を 1 行で言う。自分の欄は絞らない (保存で他部品が消える)
var assert = require('assert');
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

[
  '../src/core/diagram-kind.js',
  '../src/core/family-audit.js',
  '../src/core/domain-cohort.js',
  '../src/core/peek-verdict.js',
  '../src/core/kind-matrix.js',
  '../src/core/method-audit.js',
  '../src/core/name-pairing.js',
  '../src/core/part-vocab.js',
  '../src/core/part-slice.js',
  '../src/core/part-focus.js',
  '../src/core/part-board.js',
  '../src/core/senior-slice.js',
  '../src/core/senior-pane.js',
].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  try { require(m); } catch (e) { /* 依存の順で読めないものは呼ぶ側が外す */ }
});
var MA = global.window.MA;
var SP = MA.seniorPane;
var SS = MA.seniorSlice;
var PB = MA.partBoard;

// primary のフォルダ。ADC はシーケンスと状態遷移だけ部品名の図があり、
// クラス図は全ドライバ共通の 1 枚に入っている (junior の ADC 一巡と同じ並び)。
var SENIOR_NAMES = ['adc_init_sequence.puml', 'adc_state.puml', 'driver_common_class.puml',
  'spi_init_sequence.puml', 'plantuml-usecase.puml'];

function pick(mine, names) {
  return SP.pickCounterpart({ name: mine, dir: './junior' }, names, './primary', SS.partKeysOf(mine));
}

describe('並べて比較: 同じ部品の別図種より先に共通図を部品で絞る (BLK-junior-20260923-2012)', function() {
  test('adc_class の相手は driver_common_class を ADC で絞ったもの', function() {
    var p = pick('adc_class.puml', SENIOR_NAMES);
    assert.strictEqual(p.how, 'common-slice');
    assert.strictEqual(p.name, 'driver_common_class.puml');
    assert.strictEqual(p.key, 'adc');
  });

  test('同じ部品の同じ図種があれば今までどおりそれ (シーケンス・状態遷移は変えない)', function() {
    assert.strictEqual(pick('adc_state.puml', SENIOR_NAMES).name, 'adc_state.puml');
    var s = pick('adc_seq.puml', SENIOR_NAMES);
    assert.strictEqual(s.name, 'adc_init_sequence.puml');
    assert.strictEqual(s.how, 'same-kind');
  });

  test('共通図も無く、その図種が別部品ぶんだけあれば枚数つきで言い切り、見本に差し替えない印を持つ', function() {
    var names = ['adc_init_sequence.puml', 'adc_state.puml', 'spi_class.puml', 'can_class.puml'];
    var p = pick('adc_class.puml', names);
    assert.strictEqual(p.how, 'none');
    assert.strictEqual(p.name, '');
    assert.strictEqual(p.sameKind, 2);
    assert.ok(p.reason.indexOf('当たる相手の図はありません') >= 0, p.reason);
    assert.ok(p.reason.indexOf('ADC のクラス図は 4 枚中 0 枚') >= 0, p.reason);
    assert.ok(p.reason.indexOf('どれも ADC の図ではありません') >= 0, p.reason);
    assert.deepStrictEqual(p.candidates, []);
  });

  test('相手がその図種を 1 枚も持たなければ印は付かない (見本は今までどおり出せる)', function() {
    var p = pick('timer_activity.puml', ['gpio_init_sequence.puml', 'gpio_state.puml']);
    assert.strictEqual(p.how, 'none');
    assert.ok(!p.sameKind);
  });
});

// 部品ビュー。先輩の共通クラス図に ADC を含む 3 部品が相乗りしている。
var COMMON_CLASS = [
  '@startuml',
  'class Driver_Common',
  'class Adc_Driver {',
  '  +Adc_Init()',
  '  +Adc_StartConversion()',
  '}',
  'class Spi_Driver {',
  '  +Spi_Init()',
  '}',
  'class Can_Driver {',
  '  +Can_Init()',
  '}',
  'Driver_Common <|-- Adc_Driver',
  'Driver_Common <|-- Spi_Driver',
  'Driver_Common <|-- Can_Driver',
  '@enduml',
].join('\n');

var SENIOR = [
  { name: 'adc_init_sequence', kind: 'sequence', text: '@startuml\nparticipant Adc_Driver\n@enduml' },
  { name: 'driver_common_class', kind: 'class', text: COMMON_CLASS },
  { name: 'plantuml-usecase', kind: 'usecase', text: '@startuml\nactor User\nUser --> (Login)\n@enduml' },
];
var MINE = [
  { name: 'adc_init_sequence', kind: 'sequence', text: '@startuml\nparticipant Adc_Driver\n@enduml' },
  { name: 'my_common_class', kind: 'class', text: COMMON_CLASS },
];

describe('部品ビュー: 共通の図を部品で絞って先輩欄に出す', function() {
  test('クラス図は driver_common_class を ADC の部分だけに絞り、出典を 1 行で言う', function() {
    var bd = PB.board('adc', MINE, SENIOR);
    var row = bd.rows.filter(function(r) { return r.kind === 'class'; })[0];
    assert.strictEqual(row.ref.name, 'driver_common_class');
    assert.strictEqual(row.ref.shared, true);
    assert.ok(row.ref.text.indexOf('Adc_Driver') >= 0);
    assert.ok(row.ref.text.indexOf('Spi_Driver') < 0, row.ref.text);
    assert.ok(row.ref.text.indexOf('Can_Driver') < 0, row.ref.text);
    assert.strictEqual(row.ref.fullText, COMMON_CLASS);
    var note = PB.sharedNote(row.ref, 'adc');
    assert.ok(note.indexOf('共通の図 driver_common_class から ADC の部分を絞った') === 0, note);
    assert.ok(note.indexOf('他 2 クラスは伏せています') >= 0, note);
  });

  test('自分の欄の相乗り図は絞らない (その場で保存すると他部品が消えるため)', function() {
    var bd = PB.board('adc', MINE, SENIOR);
    var row = bd.rows.filter(function(r) { return r.kind === 'class'; })[0];
    assert.strictEqual(row.mine.text, COMMON_CLASS);
    assert.ok(!row.mine.sliced);
  });

  test('部品名を含む共通の図も無い図種は空欄のまま (ユースケース図)', function() {
    var bd = PB.board('adc', MINE, SENIOR);
    var row = bd.rows.filter(function(r) { return r.kind === 'usecase'; })[0];
    assert.strictEqual(row.ref.missing, true);
    assert.strictEqual(PB.sharedNote(row.ref, 'adc'), '');
  });
});

global.window = prevWindow;
global.document = prevDocument;
