'use strict';
// BLK-reviewer-20260917-0323-wish: 呼び出しグラフ。
// 突合の答え (ClockCtrl.EnableClock) はメソッド 1 個に付いているのに、
// 手掛かりはファイル単位でしか返らなかった。図の束を Owner.Method の節点に寄せ、
// 節点 1 個から「どの図のどの行が呼んでいるか」が全部辿れることを確かめる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/call-graph.js')]; } catch (e) {}
var CG = require('../src/core/call-graph.js');

// 実物と同じ形。6 ドメインの初期化シーケンスが同じ ClockCtrl.EnableClock を呼び、
// クラス図にはその宣言が無い (F-01)。
function seq(domain, drv) {
  return ['@startuml', 'title ' + domain,
    'actor App', 'participant ' + drv, 'participant ClockCtrl', 'participant IRQCtrl',
    'App -> ' + drv + ' : ' + drv.split('_')[0] + '_Init()',
    drv + ' -> ClockCtrl : EnableClock()',
    drv + ' -> IRQCtrl : EnableIrq()',
    drv + ' --> App : InitDone',
    '@enduml'].join('\n');
}

var DOCS = [
  { name: 'adc_init_sequence.puml', text: seq('ADC', 'Adc_Driver') },
  { name: 'can_init_sequence.puml', text: seq('CAN', 'Can_Driver') },
  { name: 'spi_init_sequence.puml', text: seq('SPI', 'Spi_Driver') },
  {
    name: 'spi_state.puml',
    text: ['@startuml', 'title Spi_State', '[*] --> Uninit', 'state Uninit', 'state Ready',
      'Uninit --> Ready : Spi_Init', 'Ready --> Uninit : Spi_Reset', '@enduml'].join('\n'),
  },
  {
    name: 'driver_common_class.puml',
    text: ['@startuml', 'title Driver_Common_Class',
      'class Spi_Driver {', '  + Spi_Init() : void', '  + Spi_Reset() : StatusType', '}',
      'class Adc_Driver {', '  + Adc_Init() : void', '}',
      '@enduml'].join('\n'),
  },
];

var G = CG.build(DOCS);

describe('図の束を呼び出し関係のグラフとして引く', () => {
  test('メソッド 1 個で、それを呼んでいる全図と行が 1 回で出る', () => {
    var w = CG.walk(G, 'ClockCtrl.EnableClock');
    expect(!!w).toBe(true);
    // 6 枚を開いて頭で組み直していたものが、1 つの節点になる。
    expect(w.docs.sort()).toEqual(
      ['adc_init_sequence.puml', 'can_init_sequence.puml', 'spi_init_sequence.puml']);
    expect(w.spread).toBe(3);
    // 指摘に写す「図名 + 行 + 内容」がその場で揃う。
    var ref = w.refs[0];
    expect(ref.line).toBe(8);
    expect(ref.text).toContain('EnableClock()');
    expect(ref.from).toBe('Adc_Driver');
  });

  test('どの上位ドメインから呼ばれているかがグラフのまま出る (図を開いて推測しない)', () => {
    var w = CG.walk(G, 'ClockCtrl.EnableClock');
    expect(w.domains.sort()).toEqual(['adc', 'can', 'spi']);
    expect(w.byDomain.map((g) => g.domain)).toEqual(['adc', 'can', 'spi']);
    expect(w.byDomain[0].refs.length).toBe(1);
    expect(w.callers.sort()).toEqual(['Adc_Driver', 'Can_Driver', 'Spi_Driver']);
  });

  test('クラス図に宣言が無いメソッドが「宣言なし」として出る (F-01 の正体)', () => {
    expect(CG.walk(G, 'ClockCtrl.EnableClock').undeclared).toBe(true);
    // 宣言のあるメソッドは宣言の在り処まで出る。
    var ok = CG.walk(G, 'Spi_Driver.Spi_Init');
    expect(ok.undeclared).toBe(false);
    expect(ok.declared[0].doc).toBe('driver_common_class.puml');
    expect(ok.declared[0].line).toBe(4);
    expect(ok.declared[0].ret).toBe('void');
  });

  test('状態遷移図の遷移ラベルも同じ節点に寄る (手順 4.11 の突合が 1 か所で済む)', () => {
    var w = CG.walk(G, 'Spi_Driver.Spi_Init');
    var tr = w.refs.filter((r) => r.kind === 'transition');
    expect(tr.length).toBe(1);
    expect(tr[0].doc).toBe('spi_state.puml');
    expect(tr[0].from).toBe('Uninit');
    // シーケンスのメッセージと状態遷移が同じ節点に並ぶので、
    // 「遷移ラベルが実在しない架空の名前」はこの節点の欠けとして読める。
    expect(w.docs).toContain('spi_init_sequence.puml');
    expect(w.docs).toContain('spi_state.puml');
  });

  test('返信 (`-->`) を呼び出しに数えない (InitDone の宣言漏れという空振りを作らない)', () => {
    var w = CG.walk(G, 'App.InitDone');
    expect(w.replyOnly).toBe(true);
    expect(w.undeclared).toBe(false);
    expect(CG.hotspots(G).map((n) => n.key)).not.toContain('App.InitDone');
  });

  test('先に見る節点が先頭に来る (散っている指摘から確定できる)', () => {
    var hot = CG.hotspots(G);
    expect(hot[0].key).toBe('ClockCtrl.EnableClock');
    expect(hot[0].docCount).toBe(3);
    expect(CG.summary(G).worst).toBe('ClockCtrl.EnableClock');
    expect(CG.summary(G).files).toBe(5);
  });

  test('名前で絞れる (24 枚の一覧から目で探さない)', () => {
    expect(CG.search(G, 'clockctrl').map((n) => n.key)).toEqual(['ClockCtrl.EnableClock']);
    expect(CG.search(G, 'Spi_').length).toBeGreaterThan(1);
    expect(CG.search(G, '').length).toBe(G.nodes.length);
  });

  test('指摘.md へそのまま写せる 1 件分の文面が出る', () => {
    var t = CG.refText(G, 'ClockCtrl.EnableClock');
    expect(t.split('\n')[0]).toContain('クラス図に宣言なし');
    expect(t).toContain('adc\tadc_init_sequence.puml:8');
    expect(t).toContain('Adc_Driver -> ClockCtrl');
  });

  test('同名メソッドの持ち主が複数いる遷移ラベルは、勝手に片方へ寄せず候補を出す', () => {
    var g = CG.build([
      {
        name: 'x_class.puml',
        text: ['@startuml', 'class A {', '  + Run() : void', '}',
          'class B {', '  + Run() : void', '}', '@enduml'].join('\n'),
      },
      {
        name: 'x_state.puml',
        text: ['@startuml', '[*] --> Idle', 'Idle --> Busy : Run', '@enduml'].join('\n'),
      },
    ]);
    var w = CG.walk(g, 'Run');
    expect(w.ambiguous.sort()).toEqual(['A', 'B']);
    expect(w.refs[0].doc).toBe('x_state.puml');
  });

  test('図の種類とドメインを、中身とファイル名から見分ける', () => {
    expect(CG.docKind(DOCS[0].text)).toBe('sequence');
    expect(CG.docKind(DOCS[3].text)).toBe('state');
    expect(CG.docKind(DOCS[4].text)).toBe('class');
    expect(CG.domainOf('adc_init_sequence.puml')).toBe('adc');
    expect(CG.domainOf('can.puml')).toBe('can');
  });

  test('コメント行と日本語だけのラベルは呼び出しに数えない', () => {
    var g = CG.build([{
      name: 'n_sequence.puml',
      text: ['@startuml', 'participant A', 'participant B',
        "' A -> B : Ghost()", 'A -> B : 初期化する', 'A -> B : Real()', '@enduml'].join('\n'),
    }]);
    var keys = g.nodes.map((n) => n.key);
    expect(keys).toEqual(['B.Real']);
  });
});
