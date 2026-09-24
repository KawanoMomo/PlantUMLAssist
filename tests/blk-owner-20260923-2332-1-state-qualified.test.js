'use strict';
// BLK-owner-20260923-2332-1: 他ツールや手書きの図にある `Idle.Standby --> Idle.Sleep` (最上位に修飾した名前で
// 子どうしの遷移を書く記法) を、状態遷移表・遷移一覧・件数が `state Idle { state Standby }` の子と
// 同じ状態として読む。書き換えはしない。遷移を選んだ右パネルの From / To も `親 / 子` で並べる。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/dsl-utils.js',
  '../src/core/state-transition.js',
  '../src/core/regex-parts.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/core/state-table.js',
  '../src/core/outline.js',
  '../src/modules/state.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var stMod = global.window.MA.modules.plantumlState;
var ST = global.window.MA.stateTable;
var OL = global.window.MA.outline;

var DSL = [
  '@startuml',
  'state Idle {',
  '  state Standby',
  '  state Sleep',
  '}',
  'state Running {',
  '  state Busy',
  '  state Wait',
  '}',
  '[*] --> Idle',
  'Idle.Standby --> Idle.Sleep : sleep',
  'Idle.Sleep --> Idle.Standby : irq',
  'Running.Busy -> Running.Wait : poll',
  'Idle --> Running : go',
  '@enduml',
].join('\n');

describe('BLK-owner-20260923-2332-1 修飾した端 (親.子) の遷移', function() {
  var parsed = stMod.parse(DSL);

  test('修飾した端の遷移も 1 本の遷移として読む (遷移一覧に全部出る)', function() {
    expect(parsed.transitions.length).toBe(5);
    var sleep = parsed.transitions.filter(function(t) { return t.trigger === 'sleep'; })[0];
    expect(sleep.from).toBe('Idle.Standby');
    expect(sleep.to).toBe('Idle.Sleep');
    expect(sleep.line).toBe(11);
  });

  test('状態遷移表は修飾した端を入れ子の子の行・マスとして引く', function() {
    var table = ST.build(parsed);
    expect(table.triggers).toEqual([ST.NO_TRIGGER, 'sleep', 'irq', 'poll', 'go']);
    var ids = table.rows.map(function(r) { return r.stateId; });
    // 別の行 (`Idle.Standby` という最上位の状態) を作らない。
    expect(ids).toEqual(['[*]', 'Idle', 'Idle.Standby', 'Idle.Sleep', 'Running', 'Running.Busy', 'Running.Wait']);
    var standby = table.rows[2];
    expect(standby.cells[1].text).toBe('Idle / Sleep');
    var busy = table.rows[5];
    expect(busy.cells[3].text).toBe('Running / Wait');
  });

  test('途中を省いた修飾 (子.孫) も id の後ろが一致すれば同じ状態', function() {
    var states = [
      { id: 'A', parentId: null }, { id: 'A.B', parentId: 'A' }, { id: 'A.B.C', parentId: 'A.B' },
    ];
    expect(ST.resolveEnd('B.C', null, states)).toBe('A.B.C');
    expect(ST.resolveEnd('A.B.C', null, states)).toBe('A.B.C');
    // 宣言の無い修飾名はそのまま (壊れた入力でも落とさない)。
    expect(ST.resolveEnd('X.Y', null, states)).toBe('X.Y');
  });

  test('下端の件数は修飾した端を別の状態に数えない', function() {
    var res = OL.build(DSL);
    expect(res.counts.states).toBe(6);
    expect(OL.countLabel(res.counts, 'plantuml-state')).toBe('6 states · 5 transitions');
  });

  test('書き換えない: 読んだだけでは DSL の行は変わらない', function() {
    var again = stMod.parse(DSL);
    expect(again.transitions[1].from).toBe('Idle.Standby');
  });
});

describe('BLK-owner-20260923-2332-1 遷移を選んだ右パネルの From / To', function() {
  var parsed = stMod.parse([
    '@startuml',
    'state Idle {',
    '  state Standby',
    '  state Sleep',
    '  Standby --> Sleep : sleep',
    '}',
    'state Running {',
    '  state Sleep',
    '}',
    'Idle.Standby --> Idle.Sleep : nap',
    'Idle --> Running : go',
    '@enduml',
  ].join('\n'));
  var states = parsed.states;

  test('書かれた端 (素の名前 / 修飾名) はどちらも同じ状態の候補を選ぶ', function() {
    var inner = parsed.transitions[0];
    expect(inner.scope).toBe('Idle');
    expect(stMod.endValue(inner.from, inner.scope, states)).toBe('Idle.Standby');
    var top = parsed.transitions[1];
    expect(stMod.endValue(top.from, top.scope, states)).toBe('Idle.Standby');
    expect(stMod.endValue('[*]', 'Idle', states)).toBe('[*]');
  });

  test('候補の見出しは状態遷移表と同じ `親 / 子`', function() {
    expect(ST.rowLabel('Idle.Standby', states)).toBe('Idle / Standby');
  });

  test('変えていない端は書かれたまま残す', function() {
    var top = parsed.transitions[1];
    expect(stMod.endNameFor('Idle.Standby', top.scope, states, top.from)).toBe('Idle.Standby');
    var inner = parsed.transitions[0];
    expect(stMod.endNameFor('Idle.Standby', inner.scope, states, inner.from)).toBe('Standby');
  });

  test('同じ親の { } の中なら素の名前、別の親の中からは修飾したまま', function() {
    var inner = parsed.transitions[0];
    expect(stMod.endNameFor('Idle.Sleep', 'Idle', states, inner.to)).toBe('Sleep');
    expect(stMod.endNameFor('Running.Sleep', 'Idle', states, inner.to)).toBe('Running.Sleep');
  });

  test('最上位の行からは、素の名前が 1 つに決まればそれ、同名があれば修飾する', function() {
    expect(stMod.endNameFor('Idle.Standby', null, states, 'Idle')).toBe('Standby');
    expect(stMod.endNameFor('Idle.Sleep', null, states, 'Idle')).toBe('Idle.Sleep');
    expect(stMod.endNameFor('Running', null, states, 'Idle')).toBe('Running');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
