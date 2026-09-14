'use strict';
// BLK-reviewer-20260907-0943: state の遷移ラベル (括弧なし) とクラスメソッドの突合。
// adc_state.puml を接頭辞だけ替えて複製した timer_state.puml のイベント名が
// どのクラスにも無いことを、今までどの突合も検出できなかった。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/method-audit.js')]; } catch (e) {}
require('../src/core/method-audit.js');
var MAUD = global.window.MA.methodAudit;

var TIMER_STATE = {
  name: 'timer_state',
  diagramType: 'plantuml-state',
  dsl: [
    '@startuml',
    '[*] --> Idle',
    'Idle --> Busy : Timer_StartConv',
    'Busy --> Idle : Timer_Ack',
    'Busy --> Error : Timer_Fault [retry > 3] / log()',
    '@enduml',
  ].join('\n'),
};

var CLASS_DOC = {
  name: 'driver_common_class',
  diagramType: 'plantuml-class',
  dsl: [
    '@startuml',
    'class Timer_Driver {',
    '  +Timer_Init(cfg)',
    '  +Timer_Ack()',
    '}',
    '@enduml',
  ].join('\n'),
};

describe('method-audit — state の遷移イベント (BLK-reviewer-0943)', () => {
  test('parseStateEvent: きっかけだけを取り、guard と action は落とす', () => {
    expect(MAUD.parseStateEvent('Idle --> Busy : Timer_StartConv').event).toBe('Timer_StartConv');
    expect(MAUD.parseStateEvent('Busy --> Error : Timer_Fault [retry > 3] / log()').event).toBe('Timer_Fault');
    expect(MAUD.parseStateEvent('Idle -down-> Busy : start').event).toBe('start');
    expect(MAUD.parseStateEvent('[*] --> Idle : boot').event).toBe('boot');
    expect(MAUD.parseStateEvent('Idle --> Busy : start / Timer_Go()').event).toBe('start');
  });

  test('parseStateEvent: 呼び出し形式・日本語・空ラベルは拾わない', () => {
    // 括弧つきは parseCall の職掌。二重に数えない。
    expect(MAUD.parseStateEvent('Idle --> Busy : Timer_Start()')).toBe(null);
    expect(MAUD.parseStateEvent('Idle --> Busy : 変換を開始')).toBe(null);
    expect(MAUD.parseStateEvent('Idle --> Busy')).toBe(null);
    expect(MAUD.parseStateEvent('state Idle')).toBe(null);
    expect(MAUD.parseStateEvent('')).toBe(null);
    expect(MAUD.parseStateEvent(null)).toBe(null);
  });

  test('isStateDoc: diagramType があればそれで決め、無ければ DSL の形で見る', () => {
    expect(MAUD.isStateDoc({ diagramType: 'plantuml-state', dsl: '' })).toBe(true);
    expect(MAUD.isStateDoc({ diagramType: 'plantuml-sequence', dsl: '[*] --> Idle' })).toBe(false);
    expect(MAUD.isStateDoc({ dsl: '@startuml\n[*] --> Idle\n@enduml' })).toBe(true);
    expect(MAUD.isStateDoc({ dsl: '@startuml\nstate Busy\n@enduml' })).toBe(true);
    expect(MAUD.isStateDoc({ dsl: '@startuml\nA -> B : x()\n@enduml' })).toBe(false);
    expect(MAUD.isStateDoc(null)).toBe(false);
  });

  test('stateEvents: state の図からだけ集め、行番号を付ける', () => {
    var evs = MAUD.stateEvents([TIMER_STATE, CLASS_DOC]);
    expect(evs.map(function(e) { return e.event; }).join(',')).toBe('Timer_StartConv,Timer_Ack,Timer_Fault');
    expect(evs[0].doc).toBe('timer_state');
    expect(evs[0].line).toBe(3);
  });

  test('audit: クラスに宣言が無いイベントを挙げ、宣言があるものは挙げない', () => {
    var res = MAUD.audit([TIMER_STATE, CLASS_DOC]);
    var stateIssues = res.issues.filter(function(i) { return i.via === 'state'; });
    var names = stateIssues.map(function(i) { return i.method; }).sort().join(',');
    // Timer_Ack は Timer_Driver に宣言があるので挙がらない。
    expect(names).toBe('Timer_Fault,Timer_StartConv');
    expect(stateIssues[0].kind).toBe('no-method');
    expect(stateIssues[0].cls).toBe('Timer_Driver');
    expect(res.events.length).toBe(3);
  });

  test('audit: 対応するクラスが 1 枚も無ければ no-class として挙げる', () => {
    var res = MAUD.audit([TIMER_STATE]);
    var stateIssues = res.issues.filter(function(i) { return i.via === 'state'; });
    expect(stateIssues.length).toBe(3);
    expect(stateIssues[0].kind).toBe('no-class');
    expect(stateIssues[0].owner).toBe('Timer');
  });

  test('audit: 同じイベント名が 2 枚に出ても 1 件にまとめる', () => {
    var other = { name: 'timer_state2', diagramType: 'plantuml-state', dsl: '@startuml\nA --> B : Timer_StartConv\n@enduml' };
    var res = MAUD.audit([TIMER_STATE, other, CLASS_DOC]);
    var hit = res.issues.filter(function(i) { return i.method === 'Timer_StartConv'; });
    expect(hit.length).toBe(1);
    expect(hit[0].docs.join(',')).toBe('timer_state,timer_state2');
  });

  test('audit: state の図が無ければ従来と同じ結果 (呼び出しだけを見る)', () => {
    var seq = { name: 's', diagramType: 'plantuml-sequence', dsl: '@startuml\nApp -> Timer_Driver : Timer_Init(cfg)\n@enduml' };
    var res = MAUD.audit([seq, CLASS_DOC]);
    expect(res.events.length).toBe(0);
    expect(res.issues.filter(function(i) { return i.via === 'state'; }).length).toBe(0);
  });

  test('describe: 遷移ラベルは「() を呼んでいる」とは言わない', () => {
    var res = MAUD.audit([TIMER_STATE, CLASS_DOC]);
    var one = res.issues.filter(function(i) { return i.method === 'Timer_StartConv'; })[0];
    expect(MAUD.describe(one)).toBe('Timer_StartConv (state の遷移) の宣言が Timer_Driver に無い');
    var none = MAUD.audit([TIMER_STATE]).issues[0];
    expect(MAUD.describe(none).indexOf('のクラスがどの図にも無い')).toBeGreaterThan(-1);
    expect(MAUD.describe(none).indexOf('()')).toBe(-1);
  });
});

describe('consistency — イベント名不一致をバッジに数える (BLK-reviewer-0943)', () => {
  test('check: events に載り、count に加算される', () => {
    try { delete require.cache[require.resolve('../src/core/family-audit.js')]; } catch (e) {}
    require('../src/core/family-audit.js');
    try { delete require.cache[require.resolve('../src/core/consistency.js')]; } catch (e) {}
    require('../src/core/consistency.js');
    var ck = global.window.MA.consistency;
    var res = ck.check([TIMER_STATE, CLASS_DOC]);
    expect(res.events.length).toBe(2);
    expect(res.events.map(function(e) { return e.event; }).sort().join(',')).toBe('Timer_Fault,Timer_StartConv');
    expect(res.events[0].cls).toBe('Timer_Driver');
    expect(res.count >= 2).toBe(true);
    expect(ck.badgeLabel(res).indexOf('⚠')).toBe(0);
  });

  test('eventGaps: 宣言が揃っていれば 0 件', () => {
    var ck = global.window.MA.consistency;
    var ok = {
      name: 'cls', diagramType: 'plantuml-class',
      dsl: '@startuml\nclass Timer_Driver {\n  +Timer_StartConv()\n  +Timer_Ack()\n  +Timer_Fault()\n}\n@enduml',
    };
    expect(ck.eventGaps([TIMER_STATE, ok]).length).toBe(0);
  });
});
