'use strict';
// BLK-junior-20260909-0103-wish: 図の要素と ASPICE 要求 ID の対応。
// 図を作るのと要求 ID を付けるのが 1 回の作業になること、書き出しで
// 対応表と脚注が同時に確定することを固定する。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/req-trace.js'].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  require(m);
});
var RT = global.window.MA.reqTrace;

var CLASS_DSL = [
  '@startuml',
  'title GPIOドライバ派生クラス',
  'class Gpio_Driver {',
  '  + Gpio_Init() : void',
  '  + Gpio_SetHigh(ch) : void',
  '  - port : uint8',
  '}',
  'class Gpio_PortDrv',
  'Gpio_Driver <|-- Gpio_PortDrv',
  '@enduml',
].join('\n');

var STATE_DSL = [
  '@startuml',
  'title GPIOドライバ状態遷移',
  '[*] --> Uninit',
  'state Ready',
  'Uninit --> Ready : Gpio_Init',
  'Ready --> Uninit : Gpio_DeInit',
  '@enduml',
].join('\n');

describe('要求ID対応 — 付けられる要素', function() {
  test('クラス図はクラス・メソッド・属性が要素になり、メソッドは持ち主で区別される', function() {
    var keys = RT.targets(CLASS_DSL).map(function(t) { return t.key; });
    expect(keys).toContain('Gpio_Driver');
    expect(keys).toContain('Gpio_Driver.Gpio_Init()');
    expect(keys).toContain('Gpio_Driver.Gpio_SetHigh()');
    expect(keys).toContain('Gpio_Driver.port');
    expect(keys).toContain('Gpio_PortDrv');
  });

  test('状態遷移図は状態と遷移が要素になる', function() {
    var t = RT.targets(STATE_DSL);
    var keys = t.map(function(x) { return x.key; });
    expect(keys).toContain('Ready');
    expect(keys).toContain('Uninit -> Ready : Gpio_Init');
    var tr = t.filter(function(x) { return x.kind === 'transition'; });
    expect(tr.length).toBe(3);
  });

  test('題名・skinparam・注記は要素にしない', function() {
    var keys = RT.targets(CLASS_DSL).map(function(t) { return t.key; });
    expect(keys).not.toContain('GPIOドライバ派生クラス');
    expect(RT.targets('@startuml\nskinparam monochrome true\n@enduml').length).toBe(0);
  });
});

describe('要求ID対応 — 読み書きは DSL の注記行', function() {
  test('付けた対応は DSL に残り、読み直せる', function() {
    var out = RT.setIds(CLASS_DSL, 'Gpio_Driver.Gpio_Init()', ['SWReq-101']);
    expect(out).toContain("' @req Gpio_Driver.Gpio_Init() = SWReq-101");
    expect(RT.idsOf(out, 'Gpio_Driver.Gpio_Init()')).toEqual(['SWReq-101']);
    // 図そのものは変わらない (描画には出ない)。
    expect(out).toContain('class Gpio_Driver {');
  });

  test('注記は @enduml の直前にまとまる（要素行の並べ替えで取り残されない）', function() {
    var out = RT.setIds(CLASS_DSL, 'Gpio_Driver', ['SWReq-100']).split('\n');
    expect(out[out.length - 1]).toBe('@enduml');
    expect(out[out.length - 2]).toBe("' @req Gpio_Driver = SWReq-100");
  });

  test('付け直しは 1 行のまま（同じ要素の注記が増えない）', function() {
    var a = RT.setIds(CLASS_DSL, 'Gpio_Driver', ['SWReq-100']);
    var b = RT.setIds(a, 'Gpio_Driver', ['SWReq-100', 'SWReq-102']);
    var marks = b.split('\n').filter(function(l) { return /@req Gpio_Driver =/.test(l); });
    expect(marks.length).toBe(1);
    expect(RT.idsOf(b, 'Gpio_Driver')).toEqual(['SWReq-100', 'SWReq-102']);
  });

  test('空にすると注記行ごと消える', function() {
    var a = RT.setIds(CLASS_DSL, 'Gpio_Driver', ['SWReq-100']);
    var b = RT.setIds(a, 'Gpio_Driver', []);
    expect(b).not.toContain('@req');
    expect(RT.idsOf(b, 'Gpio_Driver')).toEqual([]);
  });

  test('区切りは読点・カンマ・空白のどれでもよく、重複は 1 つになる', function() {
    expect(RT.normalizeIds('SWReq-101、SWReq-102 SWReq-101, SYS-3')).toEqual(
      ['SWReq-101', 'SWReq-102', 'SYS-3']);
  });

  test('要求 ID として読めない語は捨てるが、何を捨てたかは言える', function() {
    expect(RT.normalizeIds('SWReq-101 未定 あとで')).toEqual(['SWReq-101']);
    expect(RT.invalidIds('SWReq-101 未定 あとで')).toEqual(['未定', 'あとで']);
  });
});

describe('要求ID対応 — 一覧', function() {
  test('付いていない要素も一覧に出る（付け忘れが表で分かる）', function() {
    var dsl = RT.setIds(CLASS_DSL, 'Gpio_Driver.Gpio_Init()', ['SWReq-101']);
    var rows = RT.rows(dsl);
    var init = rows.filter(function(r) { return r.key === 'Gpio_Driver.Gpio_Init()'; })[0];
    var high = rows.filter(function(r) { return r.key === 'Gpio_Driver.Gpio_SetHigh()'; })[0];
    expect(init.status).toBe('assigned');
    expect(init.ids).toEqual(['SWReq-101']);
    expect(high.status).toBe('none');
    expect(high.kindLabel).toBe('メソッド');
  });

  test('図から消えた要素に付いたままの対応は「図に無い」として残る', function() {
    var dsl = RT.setIds(CLASS_DSL, 'Gpio_Old.Gpio_Reset()', ['SWReq-900']);
    var orphan = RT.rows(dsl).filter(function(r) { return r.status === 'orphan'; });
    expect(orphan.length).toBe(1);
    expect(orphan[0].ids).toEqual(['SWReq-900']);
    expect(RT.summary(RT.rows(dsl))).toContain('図に無い');
  });

  test('要約は残り件数を言う', function() {
    var dsl = RT.setIds(CLASS_DSL, 'Gpio_Driver', ['SWReq-100']);
    var s = RT.summary(RT.rows(dsl));
    expect(s).toContain('1 要素に要求 ID が付いています');
    expect(s).toContain('残り');
  });
});

describe('要求ID対応 — 書き出し', function() {
  var DSL = RT.setIds(RT.setIds(CLASS_DSL,
    'Gpio_Driver.Gpio_Init()', ['SWReq-101']),
    'Gpio_Driver.Gpio_SetHigh()', ['SWReq-102', 'SWReq-103']);

  test('対応表は画像と並ぶ名前の CSV', function() {
    expect(RT.tableFilename('GPIOドライバ派生クラス(資料用).puml'))
      .toBe('GPIOドライバ派生クラス(資料用)_要求対応表.csv');
  });

  test('CSV には付いていない要素も空欄で残る', function() {
    var csv = RT.tableCsv(RT.rows(DSL), 'GPIOドライバ派生クラス');
    expect(csv.split('\r\n')[0]).toBe('図,種別,要素,要求ID');
    expect(csv).toContain('メソッド,Gpio_Driver.Gpio_Init(),SWReq-101');
    expect(csv).toContain('SWReq-102 SWReq-103');
    expect(csv).toContain('属性,Gpio_Driver.port,');
  });

  test('脚注は対応の付いた要素だけを出す', function() {
    var lines = RT.footnoteLines(RT.rows(DSL));
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe('Gpio_Driver.Gpio_Init() : SWReq-101');
  });

  test('脚注は書き出し用の DSL にだけ入り、二重に入らない', function() {
    var once = RT.applyFootnote(DSL, RT.rows(DSL));
    var twice = RT.applyFootnote(once, RT.rows(DSL));
    expect(once).toContain('legend bottom');
    expect(twice.split('legend bottom').length - 1).toBe(1);
    expect(RT.stripFootnote(twice)).toBe(DSL);
    // 脚注を入れても対応そのものは読み直せる。
    expect(RT.idsOf(twice, 'Gpio_Driver.Gpio_Init()')).toEqual(['SWReq-101']);
  });

  test('押す前に何が出るかが読める', function() {
    var p = RT.plan(DSL, 'GPIOドライバ派生クラス.puml');
    expect(p.assigned).toBe(2);
    expect(RT.planText(p)).toContain('要求対応表.csv');
    expect(RT.planText(RT.plan(CLASS_DSL, 'x.puml'))).toContain('まだ 1 件も付いていません');
  });
});
