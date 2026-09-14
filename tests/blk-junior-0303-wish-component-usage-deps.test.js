'use strict';
// BLK-junior-20260909-0303-wish: コンポーネント図の依存候補に「この部品の
// シーケンス図・状態遷移図で実際に呼んでいる相手」を別枠で出す。
// 定石は題材によらず常に同じ 6 件なので、GPIO ドライバに合っているかを
// 先輩の図と自分で見比べる手間が残っていた。実績はその見比べを機械にやらせる。

var W = (typeof window !== 'undefined' && window) || global.window;
var CD = W.MA.componentDeps;

function uml(lines) { return ['@startuml'].concat(lines, ['@enduml']).join('\n'); }

// 棚卸しの対象。依存は Port_Drv しか書いていない。
var GPIO = uml([
  'component GpioDrv',
  'component Port_Drv',
  'GpioDrv ..> Port_Drv : 依存',
]);

// 同じ部品のシーケンス図。IRQCtrl と Board_Cfg を実際に呼んでいる。
// Logger は定石に無い相手 — 定石だけでは絶対に出てこない。
var GPIO_SEQ = uml([
  'participant GpioDrv',
  'participant IRQCtrl',
  'participant Board_Cfg',
  'participant Logger',
  'participant Port_Drv',
  'GpioDrv -> Board_Cfg : ピン割り当て取得',
  'GpioDrv -> IRQCtrl : 割り込み設定依頼',
  'GpioDrv -> Logger : 初期化完了を記録',
  'GpioDrv -> Port_Drv : ポート設定',
  'IRQCtrl -> GpioDrv : 完了通知',
]);

// 同じ部品の状態遷移図。遷移の動作で Power_Ctrl を呼んでいる。
var GPIO_STATE = uml([
  '[*] --> Idle',
  'Idle --> Active : start / Power_Ctrl.on()',
  'Active --> Idle : stop / Power_Ctrl.off()',
  'Active --> Active : tick / 内部カウンタを進める',
]);

// 別部品のシーケンス図。ここの呼び出し先は GPIO の実績ではない。
var UART_SEQ = uml([
  'participant UartDrv',
  'participant Dma_Drv',
  'UartDrv -> Dma_Drv : 転送依頼',
]);

var DOCS = [
  { id: 1, name: 'gpio_component', diagramType: 'plantuml-component', dsl: GPIO },
  { id: 2, name: 'gpio_init_sequence', diagramType: 'plantuml-sequence', dsl: GPIO_SEQ },
  { id: 3, name: 'gpio_state', diagramType: 'plantuml-state', dsl: GPIO_STATE },
  { id: 4, name: 'uart_flow_sequence', diagramType: 'plantuml-sequence', dsl: UART_SEQ },
];

function names(list) { return list.map(function(r) { return r.name; }); }

describe('部品を見分ける語', function() {
  test('どの部品にも付く語は落とす', function() {
    var t = CD.keyTokens('gpio_init_sequence');
    expect(t.indexOf('gpio') >= 0).toBe(true);
    expect(t.indexOf('init')).toBe(-1);
    expect(t.indexOf('sequence')).toBe(-1);
  });

  test('部品名の語は残る', function() {
    expect(CD.keyTokens('GpioDrv')).toEqual(['gpio']);
  });
});

describe('実際に呼んでいる相手', function() {
  test('同じ部品のシーケンス図で自分が送っている宛先を拾う', function() {
    var got = names(CD.usageTargets(GPIO, DOCS, 1, 'GpioDrv'));
    expect(got.indexOf('IRQCtrl') >= 0).toBe(true);
    expect(got.indexOf('Board_Cfg') >= 0).toBe(true);
    expect(got.indexOf('Logger') >= 0).toBe(true);
  });

  test('自分に送られてくるだけの相手は依存にしない', function() {
    // IRQCtrl -> GpioDrv しか無い図では、IRQCtrl は依存先にならない。
    var seq = uml([
      'participant GpioDrv', 'participant Timer',
      'Timer -> GpioDrv : 周期通知',
    ]);
    var docs = [{ id: 9, name: 'gpio_notify_sequence', diagramType: 'plantuml-sequence', dsl: seq }];
    expect(names(CD.usageTargets(GPIO, docs, 1, 'GpioDrv'))).toEqual([]);
  });

  test('状態遷移図は遷移の動作が呼んでいる相手だけを拾う (状態名は拾わない)', function() {
    var got = names(CD.usageTargets(GPIO, [DOCS[2]], 1, 'GpioDrv'));
    expect(got.indexOf('Power_Ctrl') >= 0).toBe(true);
    expect(got.indexOf('Idle')).toBe(-1);
    expect(got.indexOf('Active')).toBe(-1);
  });

  test('別部品の図は見ない', function() {
    var got = names(CD.usageTargets(GPIO, DOCS, 1, 'GpioDrv'));
    expect(got.indexOf('Dma_Drv')).toBe(-1);
  });

  test('自分自身は依存先に出さない', function() {
    var got = names(CD.usageTargets(GPIO, DOCS, 1, 'GpioDrv'));
    expect(got.indexOf('GpioDrv')).toBe(-1);
  });

  test('起点を替えれば実績も替わる', function() {
    var got = names(CD.usageTargets(GPIO, DOCS, 1, 'Port_Drv'));
    expect(got.indexOf('IRQCtrl')).toBe(-1);
  });
});

describe('チェックリストへの並び', function() {
  var res = CD.check(GPIO, DOCS, 1, 'GpioDrv');

  test('実績が定石より先に並ぶ', function() {
    var first = res.rows[0];
    expect(first.source).toBe('usage');
    var srcs = res.rows.map(function(r) { return r.source; });
    expect(srcs.lastIndexOf('usage') < srcs.indexOf('catalog')).toBe(true);
  });

  test('定石に無い実績も候補になる', function() {
    var logger = CD.findRow(res, 'use:Logger');
    expect(logger != null).toBe(true);
    expect(logger.source).toBe('usage');
  });

  test('実績の理由にどの図で呼んでいるかが書いてある', function() {
    var irq = res.rows.filter(function(r) { return r.name === 'IrqCtrl'; })[0];
    expect(irq != null).toBe(true);
    expect(irq.why.indexOf('gpio_init_sequence') >= 0).toBe(true);
  });

  test('定石と同じ相手は実績側に寄せて 1 行にまとめる', function() {
    // IRQCtrl は定石 irq と同じ相手。定石側にも出ると 2 行に割れる。
    var irqRows = res.rows.filter(function(r) { return r.id === 'irq' || r.name === 'IrqCtrl'; });
    expect(irqRows.length).toBe(1);
    expect(irqRows[0].source).toBe('usage');
    // まとめた行には定石の名前と理由が残る。
    expect(irqRows[0].name).toBe('IrqCtrl');
    expect(irqRows[0].label).toBe('割り込み制御');
    expect(irqRows[0].why.indexOf('割り込みで受ける') >= 0).toBe(true);
  });

  test('実績で押さえた定石は定石の残り件数から減る', function() {
    // Power_Ctrl / IrqCtrl / Board_Cfg が実績側に移るので定石は 3 件。
    expect(res.usageMissing).toBe(4);
    expect(res.catalogMissing).toBe(3);
  });

  test('既に図にある依存は実績でも候補にしない', function() {
    // Port_Drv は GPIO の図に既にある。
    expect(names(res.rows).indexOf('Port_Drv')).toBe(-1);
  });

  test('実績が無ければ今までどおり定石だけが出る', function() {
    var plain = CD.check(GPIO, [DOCS[0], DOCS[3]], 1, 'GpioDrv');
    expect(plain.usageMissing).toBe(0);
    expect(plain.catalogMissing).toBe(6);
  });
});

describe('追加する行', function() {
  test('定石と重なった実績は定石のラベルで結ぶ', function() {
    var res = CD.check(GPIO, DOCS, 1, 'GpioDrv');
    var irq = res.rows.filter(function(r) { return r.name === 'IrqCtrl'; });
    expect(CD.blockFor('GpioDrv', irq)).toEqual([
      'component IrqCtrl',
      'GpioDrv ..> IrqCtrl : 割り込み制御',
    ].join('\n'));
  });

  test('定石に無い実績は「依存」で結ぶ (名前をラベルに繰り返さない)', function() {
    var res = CD.check(GPIO, DOCS, 1, 'GpioDrv');
    var logger = [CD.findRow(res, 'use:Logger')];
    expect(CD.blockFor('GpioDrv', logger)).toEqual([
      'component Logger',
      'GpioDrv ..> Logger : 依存',
    ].join('\n'));
  });

  test('足したあとは同じ実績が出なくなる', function() {
    var mod = W.MA.modules.plantumlComponent;
    var res = CD.check(GPIO, DOCS, 1, 'GpioDrv');
    var picks = [CD.findRow(res, 'use:Logger')];
    var out = mod.addBulk(GPIO, CD.blockFor('GpioDrv', picks), mod.parse(GPIO));
    var after = CD.check(out, DOCS, 1, 'GpioDrv');
    expect(names(after.rows).indexOf('Logger')).toBe(-1);
  });
});

describe('見出し', function() {
  test('実績の件数が定石と別に読める', function() {
    var t = CD.summaryText(CD.check(GPIO, DOCS, 1, 'GpioDrv'));
    expect(t.indexOf('実際に呼んでいる相手 4 件') >= 0).toBe(true);
    expect(t.indexOf('定石 3 件') >= 0).toBe(true);
  });
});
