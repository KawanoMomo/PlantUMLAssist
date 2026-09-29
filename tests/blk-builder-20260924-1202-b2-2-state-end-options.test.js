'use strict';
// BLK-builder-20260924-1202-b2-2 (design 4c): `state` 宣言の無い状態 (遷移にだけ出る Idle / Running) の遷移を
// 選ぶと、右パネルの From / To が [*] しか選べず「更新」で `[*] --> [*]` に書き換わっていた。
// 端の候補は状態遷移表の行と同じ集め方にし、候補に無い書き方の端 (`親[H]`) もその値のまま開く。
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
  '../src/modules/state.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var stMod = global.window.MA.modules.plantumlState;

// design 4c の見本。`state` 宣言が 1 つも無い。
var SAMPLE_4C = [
  '@startuml',
  'title Sample State',
  '[*] --> Idle',
  'Idle --> Running : start',
  'Running --> Idle : stop',
  'Running --> [*] : done',
  '@enduml',
].join('\n');

describe('BLK-builder-20260924-1202-b2-2 遷移の端の候補', function() {
  test('宣言の無い状態も候補に入る (開始・終了は入れない)', function() {
    var opts = stMod.endOptions(stMod.parse(SAMPLE_4C));
    expect(opts.map(function(o) { return o.value; })).toEqual(['Idle', 'Running']);
    expect(opts.map(function(o) { return o.label; })).toEqual(['Idle', 'Running']);
  });

  test('行き先にしか出ない状態も拾う', function() {
    var opts = stMod.endOptions(stMod.parse('@startuml\nA --> B : go\nB --> Done : fin\n@enduml'));
    expect(opts.map(function(o) { return o.value; })).toEqual(['A', 'B', 'Done']);
  });

  test('宣言のある入れ子の子は `親 / 子` で、宣言と遷移の両方に出る状態を 2 度並べない', function() {
    var opts = stMod.endOptions(stMod.parse([
      '@startuml',
      'state Idle {',
      '  state Standby',
      '  [*] --> Standby',
      '}',
      'Idle --> Running : go',
      '@enduml',
    ].join('\n')));
    expect(opts.map(function(o) { return o.value; })).toEqual(['Idle', 'Idle.Standby', 'Running']);
    expect(opts[1].label).toBe('Idle / Standby');
  });

  test('履歴 (`[H]` / `親[H]`) は状態の候補に入れない', function() {
    var opts = stMod.endOptions(stMod.parse('@startuml\nstate P {\n  state A\n}\nX --> P[H] : back\n@enduml'));
    expect(opts.map(function(o) { return o.value; })).toEqual(['P', 'P.A', 'X']);
  });

  test('宣言の無い状態の端は、そのまま開いてそのまま書き戻る', function() {
    var parsed = stMod.parse(SAMPLE_4C);
    var tr = parsed.transitions[1];
    expect(stMod.endValue(tr.from, tr.scope, parsed.states)).toBe('Idle');
    expect(stMod.endNameFor('Idle', tr.scope, parsed.states, tr.from)).toBe('Idle');
    expect(stMod.endNameFor('Running', tr.scope, parsed.states, tr.from)).toBe('Running');
    // 候補に無い書き方 (`親[H]`) は値そのままで開き、変えなければそのまま残る。
    expect(stMod.endValue('P[H]', null, parsed.states)).toBe('P[H]');
    expect(stMod.endNameFor('P[H]', null, parsed.states, 'P[H]')).toBe('P[H]');
  });
});

if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
