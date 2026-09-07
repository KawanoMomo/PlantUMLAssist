'use strict';
// BLK-junior-20260907-1903-wish: 同じ図種で既に描いた図の骨格を土台にして、
// 題材名 1 語だけで新しい図を作る。骨格 (要素数・関係数) が保たれること、
// 打つのが 1 語で済むこと (置換元と図の名前が図の中身から決まること) を確かめる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/template-new.js', '../src/core/skeleton-new.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var SK = global.window.MA.skeletonNew;

var GPIO = [
  '@startuml',
  'title GPIO ドライバ構成',
  'component "GpioDrv" as GpioDrv',
  'component "Reg_Access" as Reg_Access',
  'component "Clock_Ctrl" as Clock_Ctrl',
  'component "Irq_Ctrl" as Irq_Ctrl',
  'GpioDrv ..> Reg_Access',
  'GpioDrv ..> Clock_Ctrl',
  'GpioDrv ..> Irq_Ctrl',
  'Reg_Access ..> Clock_Ctrl',
  'Clock_Ctrl ..> Irq_Ctrl',
  'Irq_Ctrl ..> GpioDrv : notify',
  '@enduml',
].join('\n');

var SEQ = [
  '@startuml',
  'participant GpioDrv',
  'participant GpioHal',
  'GpioDrv -> GpioHal : Gpio_Init()',
  '@enduml',
].join('\n');

var DOCS = [
  { id: 'd1', name: 'gpio-component.puml', diagramType: 'plantuml-component', dsl: GPIO },
  { id: 'd2', name: 'gpio-seq.puml', diagramType: 'plantuml-sequence', dsl: SEQ },
  { id: 'd3', name: 'blank.puml', diagramType: 'plantuml-component', dsl: '' },
];

describe('shape', function() {
  test('骨格の大きさは宣言数と関係の行数', function() {
    var s = SK.shape(GPIO);
    expect(s.decls).toBe(4);
    expect(s.relations).toBe(6);
  });

  test('title や @startuml は関係に数えない', function() {
    expect(SK.shape('@startuml\ntitle A --> B\n@enduml').relations).toBe(0);
  });
});

describe('subjectOf', function() {
  test('いちばん多く出てくる部品名を中心に採る', function() {
    expect(SK.subjectOf(GPIO)).toBe('Gpio');
  });
});

describe('sources', function() {
  test('同じ図種で、中身のある図だけを土台の候補にする', function() {
    var list = SK.sources(DOCS, 'plantuml-component');
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('gpio-component.puml');
    expect(list[0].subject).toBe('Gpio');
  });

  test('今のタブ自身は候補から外せる', function() {
    expect(SK.sources(DOCS, 'plantuml-component', 'd1').length).toBe(0);
  });

  test('骨格の大きい図が先に来る', function() {
    var docs = [
      { id: 'a', name: 'small.puml', diagramType: 'plantuml-component',
        dsl: '@startuml\ncomponent AbcDrv\ncomponent AbcHal\nAbcDrv ..> AbcHal\n@enduml' },
      { id: 'b', name: 'big.puml', diagramType: 'plantuml-component', dsl: GPIO },
    ];
    expect(SK.sources(docs, 'plantuml-component')[0].name).toBe('big.puml');
  });
});

describe('plan', function() {
  var src = SK.sources(DOCS, 'plantuml-component')[0];

  test('題材名 1 語で置換元も新しい図の名前も決まる', function() {
    var p = SK.plan(src, 'Can');
    expect(p.ok).toBe(true);
    expect(p.from).toBe('Gpio');
    expect(p.name).toBe('can-component');
  });

  test('骨格 (要素数・関係数) は土台のまま', function() {
    var p = SK.plan(src, 'Can');
    var after = SK.shape(p.dsl);
    expect(after.decls).toBe(4);
    expect(after.relations).toBe(6);
    expect(p.dsl.split('\n').length).toBe(GPIO.split('\n').length);
  });

  test('大小の綴りは族ごと替わり、中心以外の部品名は動かない', function() {
    var p = SK.plan(src, 'Can');
    expect(p.dsl).toContain('component "CanDrv" as CanDrv');
    expect(p.dsl).toContain('title CAN ドライバ構成');
    expect(p.dsl).toContain('Irq_Ctrl ..> CanDrv : notify');
    expect(p.dsl).toContain('Reg_Access');
    expect(p.dsl).not.toContain('Gpio');
  });

  test('元の系統の宣言名が残っていないことを返す', function() {
    expect(SK.plan(src, 'Can').remaining.length).toBe(0);
  });

  test('題材名が空・土台と同じなら作らせない', function() {
    expect(SK.plan(src, '').ok).toBe(false);
    expect(SK.plan(src, 'Gpio').reason).toBe('same-subject');
  });
});

describe('summaryText', function() {
  var src = SK.sources(DOCS, 'plantuml-component')[0];

  test('作れるときは何行が何に変わるかを出す', function() {
    var t = SK.summaryText(SK.plan(src, 'Can'), src);
    expect(t).toContain('Gpio → Can');
    expect(t).toContain('要素 4・関係 6');
  });

  test('土台が無いときも同じ場所で理由を返す', function() {
    expect(SK.summaryText(null, null)).toContain('ありません');
  });
});
