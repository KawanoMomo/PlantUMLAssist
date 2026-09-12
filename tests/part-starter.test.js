'use strict';
// BLK-junior-20260913-0206-wish: 手本のまったく無い部品 (TIMER) を起こす周で、
// 6 図種を別々のタブ・別々の下書き機能でやり直し、部品名を図種ごとに打ち直していた。
// 部品名 1 語から 6 図ぶんの下書きが、同じ名前で揃って出ることを守る。

if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
[
  '../src/core/dsl-utils.js',
  '../src/core/parser-utils.js',
  '../src/core/name-audit.js',
  '../src/core/component-deps.js',
  '../src/core/component-starter.js',
  '../src/core/driver-usecase-starter.js',
  '../src/core/part-starter.js',
].forEach(function(f) {
  try { delete require.cache[require.resolve(f)]; } catch (e) {}
  require(f);
});
var PS = global.window.MA.partStarter;

describe('partStarter の部品名', function() {
  test('打ち方が揺れても同じ識別子になる', function() {
    ['TIMER', ' TIMER ドライバ', 'timer_drv.puml'].forEach(function(s) {
      expect(PS.normalizeSubject(s).toUpperCase()).toBe('TIMER');
    });
  });

  test('6 図が引く名前を 1 か所で作る', function() {
    var n = PS.identifiers('TIMER');
    expect(n.body).toBe('TIMER_Driver');
    expect(n.ops.init).toBe('TIMER_Init');
    expect(n.ops.irqNotify).toBe('TIMER_IrqNotify');
    expect(PS.identifiers('')).toBe(null);
  });
});

describe('partStarter の 6 図', function() {
  test('6 図種ぶんの下書きが、台本の周り方の順で出る', function() {
    var p = PS.plan('TIMER', []);
    expect(p.sheets.map(function(s) { return s.key; }))
      .toEqual(['sequence', 'state', 'class', 'activity', 'component', 'usecase']);
    expect(p.sheets.map(function(s) { return s.type; })).toEqual([
      'plantuml-sequence', 'plantuml-state', 'plantuml-class',
      'plantuml-activity', 'plantuml-component', 'plantuml-usecase']);
    // どれも中身のある DSL で、白紙は出さない
    p.sheets.forEach(function(s) {
      expect(s.dsl).toContain('@startuml');
      expect(s.dsl).toContain('@enduml');
      expect(s.dsl.split('\n').length).toBeGreaterThan(5);
    });
  });

  test('図の名前は部品名から揃う (図種ごとに打ち直さない)', function() {
    var p = PS.plan('TIMER', []);
    expect(p.sheets.map(function(s) { return s.name; })).toEqual([
      'timer_sequence', 'timer_state', 'timer_class',
      'timer_activity', 'timer_component', 'timer_usecase']);
  });

  test('6 図すべてが同じ綴りの部品名で書かれる (Timer / TIMER に割れない)', function() {
    var p = PS.plan('TIMER', []);
    p.sheets.forEach(function(s) {
      expect(s.dsl).toContain('TIMER');
      // 打ち直しで生まれる別綴りは 1 つも出てこない
      expect(s.dsl).not.toContain('Timer');
    });
    // 本体は、ユースケース図 (骨格が アクター ⇔ ユースケース で本体を持たない) 以外の
    // 5 図すべてに同じ識別子で入る
    var withBody = p.sheets.filter(function(s) { return s.dsl.indexOf('TIMER_Driver') >= 0; });
    expect(withBody.map(function(s) { return s.key; }))
      .toEqual(['sequence', 'state', 'class', 'activity', 'component']);
  });

  test('動作名はユースケース図の骨格と同じ語で揃う', function() {
    var p = PS.plan('TIMER', []);
    var byKey = {};
    p.sheets.forEach(function(s) { byKey[s.key] = s.dsl; });
    ['TIMER_Init', 'TIMER_Config', 'TIMER_Read'].forEach(function(op) {
      expect(byKey.sequence).toContain(op);
      expect(byKey.state).toContain(op);
      expect(byKey['class']).toContain(op);
      expect(byKey.usecase).toContain(op);
    });
    // アクティビティ図は初期化フローなので、初期化まわりの動作が入る
    expect(byKey.activity).toContain('TIMER_Init');
  });

  test('コンポーネント図とユースケース図は既存の下書き機能の出力そのもの', function() {
    var CS = global.window.MA.componentStarter;
    var US = global.window.MA.driverUsecaseStarter;
    var p = PS.plan('TIMER', []);
    var byKey = {};
    p.sheets.forEach(function(s) { byKey[s.key] = s.dsl; });
    expect(byKey.component).toBe(CS.dsl('TIMER', []));
    expect(byKey.usecase).toBe(US.dsl('TIMER'));
  });

  test('部品名が空なら plan を返さない', function() {
    expect(PS.plan('', [])).toBe(null);
    expect(PS.summary(null)).toContain('部品名');
  });
});

describe('partStarter の既存図', function() {
  var DOCS = [
    { name: 'timer_sequence', diagramType: 'plantuml-sequence', dsl: '@startuml\n@enduml' },
  ];

  test('既にある図種は「開かない」側に寄せる', function() {
    var p = PS.plan('TIMER', DOCS);
    var seq = p.sheets.filter(function(s) { return s.key === 'sequence'; })[0];
    expect(seq.existing).toEqual(['timer_sequence']);
    expect(p.existingCount).toBe(1);
    expect(p.newCount).toBe(5);
    expect(PS.selected(p).map(function(s) { return s.key; }))
      .toEqual(['state', 'class', 'activity', 'component', 'usecase']);
  });

  test('図種を選べば、既にある図種でも作れる', function() {
    var p = PS.plan('TIMER', DOCS);
    expect(PS.selected(p, ['sequence']).map(function(s) { return s.name; }))
      .toEqual(['timer_sequence']);
    expect(PS.selected(p, [])).toEqual([]);
  });

  test('別の部品の図は数に入れない', function() {
    var p = PS.plan('TIMER', [
      { name: 'gpio_sequence', diagramType: 'plantuml-sequence', dsl: '@startuml\n@enduml' },
    ]);
    expect(p.newCount).toBe(6);
  });

  test('見出しは、何図種が開いて何図種が開かないかを言う', function() {
    expect(PS.summary(PS.plan('TIMER', []))).toBe('TIMER_Driver の名前で 6 図種の下書きを開きます');
    expect(PS.summary(PS.plan('TIMER', DOCS))).toContain('1 図種は既にある');
  });
});
