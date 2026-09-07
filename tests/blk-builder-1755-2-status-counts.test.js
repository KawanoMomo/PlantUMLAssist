'use strict';
// BLK-builder-20260907-1755-2: design 1a/4a/4b/4c — キャンバス下端の状態表示。
// 下端は構造タブと同じ数え方 (outline.countLabel) を使うので、design が各案で
// 書いている文字列がそのまま出ることをここで固定する。図種ごとに数える語彙が
// 変わる (elements/relations · classes/relations · actions/branch · states/transitions)。
const assert = require('assert');
if (!global.window) global.window = global;
require('../src/core/dsl-utils.js');
try { delete require.cache[require.resolve('../src/core/outline.js')]; } catch (e) {}
require('../src/core/outline.js');
var ol = global.window.MA.outline;

// design 1a / 2b の Sequence。下端は「3 elements · 4 relations」。
var SEQ = [
  '@startuml',
  'title Sample Sequence',
  'actor User',
  'participant System',
  'database DB',
  'User -> System : Request',
  'System -> DB : Query',
  'DB --> System : Result',
  'System --> User : Response',
  '@enduml',
].join('\n');

// design 4b の Activity。下端は「3 actions · 1 branch」。
var ACT = [
  '@startuml',
  'title Sample Activity',
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

// design 4c の State。下端は「2 states · 4 transitions」。
var ST = [
  '@startuml',
  'title Sample State',
  '[*] --> Idle',
  'Idle --> Running : start',
  'Running --> Idle : stop',
  'Running --> [*] : done',
  '@enduml',
].join('\n');

function statusLine(dsl, type) {
  return ol.countLabel(ol.build(dsl).counts, type);
}

describe('キャンバス下端の数え方 (design 1a/4b/4c)', function() {
  test('Sequence は design 1a のまま「3 elements · 4 relations」', function() {
    assert.strictEqual(statusLine(SEQ, 'plantuml-sequence'), '3 elements · 4 relations');
  });

  test('Activity は design 4b の「3 actions · 1 branch」(0 のままにしない)', function() {
    assert.strictEqual(statusLine(ACT, 'plantuml-activity'), '3 actions · 1 branch');
  });

  test('State は design 4c の「2 states · 4 transitions」', function() {
    assert.strictEqual(statusLine(ST, 'plantuml-state'), '2 states · 4 transitions');
  });

  test('図種を渡さなければ 1a の語彙に落ちる (未知の図種でも 0 を出さない)', function() {
    assert.strictEqual(statusLine(SEQ, ''), '3 elements · 4 relations');
  });

  test('空の図では 0 が出る (「読めていない」ではなく 0 件だと分かる)', function() {
    assert.strictEqual(statusLine('@startuml\n@enduml', 'plantuml-activity'), '0 actions · 0 branches');
  });
});
