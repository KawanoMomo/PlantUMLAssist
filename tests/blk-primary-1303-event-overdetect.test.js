'use strict';
// BLK-primary-20260907-1303: 🔍名前突合の「メソッド突合」が、state の遷移イベント名
// (Tick / Fault / Reset / Ack / Complete などの応答ラベル) をメソッド呼び出しと
// 誤認して「対応するクラスが無い」を出していた。実害の無い過検出が本物の不整合を
// 埋め、「0 件にしてから新人に渡す」という台本の目的が達成できなかった。
//
// 判定: 遷移ラベルは接頭辞 (`Xxx_`) を持つときだけドライバ API とみなす。
// 接頭辞の無い名前は UML のイベント名なので突合の対象外。
// あわせて、接頭辞を持たない呼び出し (`EnableClock()`) の持ち主を矢印の受け手から
// 決めるようにした (「対応する型 のクラスが無い」では何を足せばよいか伝わらない)。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/html-utils.js',
  '../src/core/dsl-utils.js',
  '../src/core/method-audit.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var M = global.window.MA.methodAudit;

// 応答ラベル (接頭辞なし) と API 名 (接頭辞あり) が混ざった state 図。
var STATE = [
  '@startuml',
  '[*] --> Idle',
  'Idle --> Busy : Adc_StartConv',
  'Busy --> Idle : ConvComplete',
  'Busy --> Error : ConvError',
  'Error --> Idle : Reset',
  'Idle --> Idle : Tick',
  '@enduml',
].join('\n');

var CLASSES = [
  '@startuml',
  'class Adc_Driver {',
  '  +Adc_Init() : void',
  '}',
  '@enduml',
].join('\n');

function docs() {
  return [
    { name: 'adc_state', diagramType: 'plantuml-state', dsl: STATE },
    { name: 'driver_class', diagramType: 'plantuml-class', dsl: CLASSES },
  ];
}

describe('遷移ラベルの見分け', function() {
  test('接頭辞を持つ名前はドライバ API とみなす', function() {
    expect(M.isApiEvent('Adc_StartConv')).toBe(true);
    expect(M.isApiEvent('Timer_Init')).toBe(true);
  });

  test('接頭辞を持たない名前は UML のイベント名とみなす', function() {
    expect(M.isApiEvent('Tick')).toBe(false);
    expect(M.isApiEvent('Fault')).toBe(false);
    expect(M.isApiEvent('Reset')).toBe(false);
    expect(M.isApiEvent('Ack')).toBe(false);
    expect(M.isApiEvent('TransferComplete')).toBe(false);
    expect(M.isApiEvent('ConvComplete')).toBe(false);
  });
});

describe('過検出が消える', function() {
  test('応答ラベルは指摘に出ない', function() {
    var names = M.audit(docs()).issues.map(function(i) { return i.method; });
    expect(names.indexOf('Tick')).toBe(-1);
    expect(names.indexOf('Reset')).toBe(-1);
    expect(names.indexOf('ConvComplete')).toBe(-1);
    expect(names.indexOf('ConvError')).toBe(-1);
  });

  test('接頭辞を持つ遷移名は今までどおり指摘に出る (BLK-reviewer-0943 の網は残る)', function() {
    var r = M.audit(docs());
    var hit = r.issues.filter(function(i) { return i.method === 'Adc_StartConv'; });
    expect(hit.length).toBe(1);
    expect(hit[0].kind).toBe('no-method');
    expect(hit[0].cls).toBe('Adc_Driver');
    expect(hit[0].via).toBe('state');
  });

  test('この図では指摘が 1 件だけになる (応答ラベル 4 種は数えない)', function() {
    expect(M.audit(docs()).issues.length).toBe(1);
  });

  test('対象外にしたイベントは捨てずに数えて持つ', function() {
    var ex = M.audit(docs()).excludedEvents;
    expect(ex.length).toBe(4);
    expect(ex.map(function(e) { return e.event; }))
      .toEqual(['ConvComplete', 'ConvError', 'Reset', 'Tick']);
  });

  test('同じイベントが複数の図に出ても 1 件にまとまり、図名が並ぶ', function() {
    var two = docs().concat([{ name: 'can_state', diagramType: 'plantuml-state', dsl: STATE }]);
    var ex = M.audit(two).excludedEvents;
    expect(ex.length).toBe(4);
    expect(ex[3].docs).toEqual(['adc_state', 'can_state']);
  });

  test('対象外にした旨を 1 行で説明できる (黙って捨てない)', function() {
    var line = M.excludedLine(M.audit(docs()));
    expect(line).toContain('4 種');
    expect(line).toContain('対象外');
    expect(line).toContain('Tick');
  });

  test('対象外が無ければ説明の行も出ない', function() {
    var line = M.excludedLine(M.audit([{ name: 'c', diagramType: 'plantuml-class', dsl: CLASSES }]));
    expect(line).toBe('');
  });
});

describe('呼び出しの持ち主は矢印の受け手', function() {
  test('parseCall が受け手を返す', function() {
    expect(M.parseCall('Adc_Driver -> ClockCtrl : EnableClock()').receiver).toBe('ClockCtrl');
  });

  test('逆向きの矢印では左が受け手', function() {
    expect(M.parseCall('ClockCtrl <- Adc_Driver : EnableClock()').receiver).toBe('ClockCtrl');
  });

  test('引用符つきの名前は引用符を外して返す', function() {
    expect(M.parseCall('A -> "Clock Ctrl" : EnableClock()').receiver).toBe('Clock Ctrl');
  });

  test('接頭辞の無い呼び出しは、受け手の名前で「クラスが無い」と言う', function() {
    var r = M.audit([
      { name: 'seq', diagramType: 'plantuml-sequence',
        dsl: '@startuml\nAdc_Driver -> ClockCtrl : EnableClock()\n@enduml' },
    ]);
    expect(r.issues.length).toBe(1);
    expect(r.issues[0].owner).toBe('ClockCtrl');
    expect(M.describe(r.issues[0])).toContain('ClockCtrl');
  });

  test('接頭辞のある呼び出しは今までどおり接頭辞で持ち主を決める', function() {
    var r = M.audit([
      { name: 'seq', diagramType: 'plantuml-sequence',
        dsl: '@startuml\nApp -> Bus : Spi_Init()\n@enduml' },
    ]);
    expect(r.issues[0].owner).toBe('Spi');
  });

  test('受け手にクラスがあればそれを持ち主として突き合わせる', function() {
    var r = M.audit([
      { name: 'seq', diagramType: 'plantuml-sequence',
        dsl: '@startuml\nApp -> Adc_Driver : Configure()\n@enduml' },
      { name: 'cls', diagramType: 'plantuml-class', dsl: CLASSES },
    ]);
    expect(r.issues.length).toBe(1);
    expect(r.issues[0].kind).toBe('no-method');
    expect(r.issues[0].cls).toBe('Adc_Driver');
  });
});

global.window = prevWindow;
global.document = prevDocument;
