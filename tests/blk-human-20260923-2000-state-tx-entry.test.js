'use strict';
// BLK-human-20260923-2000: 状態遷移を続けて入れる。候補・次の from・書き込む位置。

var W = (typeof window !== 'undefined' && window) || global.window;
var TX = W.MA.stateTxEntry;
var ST = W.MA.modules.plantumlState;

var DSL = [
  '@startuml',
  'state Idle',
  'state Running {',
  '  state Warmup',
  '  state Busy',
  '  [*] --> Warmup',
  '  Warmup --> Busy : tick',
  '}',
  '[*] --> Idle',
  'Idle --> Running : start',
  'Running --> Idle : stop [done] / log()',
  'Idle --> Idle : poll',
  '@enduml',
].join('\n');

describe('遷移の候補 (BLK-human-20260923-2000)', function() {
  test('この図の遷移 (入れ子の子状態を含む) のトリガ・ガード・アクションが候補に出る', function() {
    var c = TX.candidates(ST.parse(DSL), []);
    expect(c.triggers.indexOf('tick') >= 0).toBe(true);
    expect(c.triggers.indexOf('start') >= 0).toBe(true);
    expect(c.guards).toEqual(['done']);
    expect(c.actions[0]).toBe('log()');
  });

  test('同じ部品のシーケンス図のメッセージ名を後ろに足す (重複しない)', function() {
    var seq = '@startuml\nApp -> Drv : Adc_Init(cfg)\nDrv --> App : start\nDrv ->> Reg : write(CR1)\n\' App -> X : comment\n@enduml';
    var names = TX.messageNames(seq);
    expect(names).toEqual(['Adc_Init', 'start', 'write']);
    var c = TX.candidates(ST.parse(DSL), names);
    expect(c.triggers.filter(function(t) { return t === 'start'; }).length).toBe(1);
    expect(c.triggers.indexOf('Adc_Init') > c.triggers.indexOf('start')).toBe(true);
  });

  test('何度も使ったトリガが先に来る', function() {
    var d = '@startuml\nA --> B : go\nB --> C : once\nC --> A : go\n@enduml';
    expect(TX.candidates(ST.parse(d), [])[ 'triggers'][0]).toBe('go');
  });

  test('打ち始めで絞る (前方一致が先・大小を問わない・打った語そのものは出さない)', function() {
    var list = ['Timer_Start', 'start', 'restart', 'stop'];
    expect(TX.filter(list, 'st')).toEqual(['start', 'stop', 'Timer_Start', 'restart']);
    expect(TX.filter(list, 'START')).toEqual(['Timer_Start', 'restart']);
    expect(TX.filter(list, '').length).toBe(4);
  });
});

describe('続けて入れる', function() {
  test('次の from は既定で直前の遷移先、切り替えれば直前と同じ', function() {
    expect(TX.nextFrom('to', 'Idle', 'Running')).toBe('Running');
    expect(TX.nextFrom('same', 'Idle', 'Running')).toBe('Idle');
    expect(TX.nextFrom('to', 'Idle', '[*]')).toBe('Idle');
  });

  test('本数の札', function() {
    expect(TX.countLabel(3)).toBe('この回に入れた遷移: 3 本');
  });
});

describe('書き込む位置 (@enduml 直前に散らさない)', function() {
  test('同じ from の遷移の並びの末尾に入る', function() {
    var r = TX.insert(DSL, ST.parse(DSL), 'Idle', 'Running', 'resume', null, null);
    var lines = r.text.split('\n');
    expect(lines[r.line - 1]).toBe('Idle --> Running : resume');
    expect(lines[r.line - 2]).toBe('Idle --> Idle : poll');
  });

  test('同じ from が無ければ同じ階層の遷移の末尾に入る', function() {
    var d = '@startuml\nstate A\nstate B\nA --> B : go\n\' memo\n@enduml';
    var r = TX.insert(d, ST.parse(d), 'B', 'A', 'back', 'ok', 'reset()');
    expect(r.text.split('\n')[r.line - 1]).toBe('B --> A : back [ok] / reset()');
    expect(r.line).toBe(5);
  });

  test('入れ子の子状態どうしは、その複合状態の中 (短い名前) に入る', function() {
    var r = TX.insert(DSL, ST.parse(DSL), 'Running.Busy', 'Running.Warmup', 'cool', null, null);
    var lines = r.text.split('\n');
    expect(lines[r.line - 1]).toBe('  Busy --> Warmup : cool');
    expect(lines[r.line]).toBe('}');
  });

  test('開始 [*] から子状態へは、その子の階層に入る', function() {
    var d = '@startuml\nstate P {\n  state C1\n}\n@enduml';
    var r = TX.insert(d, ST.parse(d), '[*]', 'P.C1', null, null, null);
    var lines = r.text.split('\n');
    expect(lines[r.line - 1]).toBe('  [*] --> C1');
    expect(lines[r.line]).toBe('}');
  });

  test('表の「親 / （開始）」の行 ([*]@親) からは、その親の中に [*] で入る', function() {
    var d = '@startuml\nstate P {\n  state C1\n  state C2\n}\n@enduml';
    var r = TX.insert(d, ST.parse(d), '[*]@P', 'P.C2', null, null, null);
    var lines = r.text.split('\n');
    expect(lines[r.line - 1]).toBe('  [*] --> C2');
    expect(lines[r.line]).toBe('}');
  });

  test('親の違う状態どうしは最上位に入る (片方の親の中に書くと別の状態ができる)', function() {
    var r = TX.insert(DSL, ST.parse(DSL), 'Running.Busy', 'Idle', 'abort', null, null);
    var lines = r.text.split('\n');
    expect(lines[r.line - 1]).toBe('Busy --> Idle : abort');
    expect(r.line).toBeGreaterThan(lines.indexOf('}') + 1);
    expect(TX.txScope(ST.parse(DSL), 'Running.Busy', '[*]')).toBe('Running');
  });

  test('遷移が 1 本も無い図では @enduml の直前', function() {
    var d = '@startuml\nstate A\n@enduml\n';
    var r = TX.insert(d, ST.parse(d), 'A', 'A', 'self', null, null);
    expect(r.text).toBe('@startuml\nstate A\nA --> A : self\n@enduml\n');
  });

  test('遷移に添えた note on link は遷移と一緒に 1 本として扱う', function() {
    var d = '@startuml\nA --> B : go\nnote on link\n  memo\nend note\n@enduml';
    var r = TX.insert(d, ST.parse(d), 'A', 'C', 'x', null, null);
    expect(r.text.split('\n')[r.line - 1]).toBe('A --> C : x');
    expect(r.line).toBe(6);
  });
});
