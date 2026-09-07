'use strict';
// BLK-builder-20260907-1440-1: design 4b — 選択中アクションのスイムレーンを選び直す。
const assert = require('assert');
if (!global.window) global.window = global;
require('../src/core/dsl-utils.js');
try { delete require.cache[require.resolve('../src/core/swimlane-move.js')]; } catch (e) {}
require('../src/core/swimlane-move.js');
var SM = global.window.MA.swimlaneMove;

// |Client| / |Server| の 2 レーン。行番号は 1 始まり。
//  1 @startuml
//  2 |Client|
//  3 start
//  4 :入力を受け取る;
//  5 |Server|
//  6 :保存する;
//  7 stop
//  8 @enduml
var TWO_LANES = [
  '@startuml',
  '|Client|',
  'start',
  ':入力を受け取る;',
  '|Server|',
  ':保存する;',
  'stop',
  '@enduml',
].join('\n');

var NO_LANE = ['@startuml', 'start', ':入力を受け取る;', ':保存する;', 'stop', '@enduml'].join('\n');

describe('swimlanes / laneAt', function() {
  test('出てくる順にレーン名を拾う', function() {
    assert.deepStrictEqual(SM.swimlanes(TWO_LANES), ['Client', 'Server']);
    assert.deepStrictEqual(SM.swimlanes(NO_LANE), []);
  });

  test('同じレーンに戻る印があっても重複させない', function() {
    var dsl = ['@startuml', '|A|', ':x;', '|B|', ':y;', '|A|', ':z;', '@enduml'].join('\n');
    assert.deepStrictEqual(SM.swimlanes(dsl), ['A', 'B']);
  });

  test('その行が属するレーンを答える。最初の印より前は空', function() {
    assert.strictEqual(SM.laneAt(TWO_LANES, 4), 'Client');
    assert.strictEqual(SM.laneAt(TWO_LANES, 6), 'Server');
    assert.strictEqual(SM.laneAt(TWO_LANES, 1), '');
    assert.strictEqual(SM.laneAt(NO_LANE, 3), '');
  });

  test('色つきの印 (|#AAA|Server|) も読める', function() {
    var dsl = ['@startuml', '|#AliceBlue|Server|', ':x;', '@enduml'].join('\n');
    assert.strictEqual(SM.laneAt(dsl, 3), 'Server');
  });
});

describe('setSwimlane', function() {
  test('後ろの行が元のレーンに残るよう、元の印を戻す', function() {
    // 4 行目 (:入力を受け取る;) を Client → Server へ
    var out = SM.setSwimlane(TWO_LANES, 4, 'Server');
    assert.strictEqual(SM.laneAt(out, out.split('\n').indexOf('start') + 1), 'Client');
    assert.strictEqual(SM.laneAt(out, out.split('\n').indexOf(':入力を受け取る;') + 1), 'Server');
    assert.strictEqual(SM.laneAt(out, out.split('\n').indexOf(':保存する;') + 1), 'Server');
    assert.strictEqual(SM.laneAt(out, out.split('\n').indexOf('stop') + 1), 'Server');
  });

  test('動かした後、動かしていない行の所属は変わらない', function() {
    // 6 行目 (:保存する;) を Server → Client へ。start は Client のまま
    var out = SM.setSwimlane(TWO_LANES, 6, 'Client');
    var lines = out.split('\n');
    assert.strictEqual(SM.laneAt(out, lines.indexOf('start') + 1), 'Client');
    assert.strictEqual(SM.laneAt(out, lines.indexOf(':入力を受け取る;') + 1), 'Client');
    assert.strictEqual(SM.laneAt(out, lines.indexOf(':保存する;') + 1), 'Client');
    assert.strictEqual(SM.laneAt(out, lines.indexOf('stop') + 1), 'Server');
  });

  test('中身の無い印は畳む。掛け直しても印が積み上がらない', function() {
    var once = SM.setSwimlane(TWO_LANES, 4, 'Server');
    var back = SM.setSwimlane(once, once.split('\n').indexOf(':入力を受け取る;') + 1, 'Client');
    var twice = SM.setSwimlane(back, back.split('\n').indexOf(':入力を受け取る;') + 1, 'Server');
    var markers = twice.split('\n').filter(function(l) { return SM.markerLabel(l) !== null; });
    assert.ok(markers.length <= 3, '印が積み上がっている: ' + JSON.stringify(twice.split('\n')));
    // 空の印 (次の行がまた印) が残っていない
    var lines = twice.split('\n');
    for (var i = 0; i < lines.length - 1; i++) {
      if (SM.markerLabel(lines[i]) === null) continue;
      var next = null;
      for (var j = i + 1; j < lines.length; j++) {
        var t = lines[j].trim();
        if (t === '' || /^@(start|end)uml/i.test(t)) continue;
        next = lines[j]; break;
      }
      assert.ok(next === null || SM.markerLabel(next) === null, '空の印が残っている');
    }
  });

  test('同じレーンを選び直しても DSL は変わらない', function() {
    assert.strictEqual(SM.setSwimlane(TWO_LANES, 4, 'Client'), TWO_LANES);
  });

  test('レーンなし ("") は PlantUML に印が無いので何もしない', function() {
    assert.strictEqual(SM.setSwimlane(TWO_LANES, 4, ''), TWO_LANES);
  });

  test('レーンがまったく無い図に移すと、そこから先が新しいレーンになる', function() {
    var out = SM.setSwimlane(NO_LANE, 3, 'Server');
    var lines = out.split('\n');
    assert.strictEqual(lines[lines.indexOf(':入力を受け取る;') - 1], '|Server|');
    assert.strictEqual(SM.laneAt(out, lines.indexOf(':保存する;') + 1), 'Server');
  });

  test('複数行のアクションは endLine まで一緒に動く', function() {
    var dsl = ['@startuml', '|A|', ':1 行目', '2 行目;', '|B|', ':x;', '@enduml'].join('\n');
    var out = SM.setSwimlane(dsl, 3, 'B', 4);
    var lines = out.split('\n');
    // 印はアクションの手前に 1 つだけ入り、2 行目も同じレーンに残る
    assert.strictEqual(lines[lines.indexOf(':1 行目') - 1], '|B|');
    assert.strictEqual(SM.laneAt(out, lines.indexOf('2 行目;') + 1), 'B');
    // 後続は元から |B| なので、戻す印は増えない
    assert.strictEqual(SM.laneAt(out, lines.indexOf(':x;') + 1), 'B');
  });

  test('範囲外の行番号では何もしない', function() {
    assert.strictEqual(SM.setSwimlane(TWO_LANES, 0, 'Server'), TWO_LANES);
    assert.strictEqual(SM.setSwimlane(TWO_LANES, 999, 'Server'), TWO_LANES);
  });
});

describe('chips', function() {
  test('（なし）+ 各レーンが並び、今のレーンだけが選択状態', function() {
    var c = SM.chips(TWO_LANES, 4);
    assert.deepStrictEqual(c.map(function(x) { return x.label; }), ['（なし）', 'Client', 'Server']);
    assert.deepStrictEqual(c.map(function(x) { return x.checked; }), [false, true, false]);
  });

  test('（なし）はそこに居るときだけ押せる', function() {
    assert.strictEqual(SM.chips(TWO_LANES, 4)[0].selectable, false);
    assert.strictEqual(SM.chips(NO_LANE, 3)[0].selectable, true);
  });
});
