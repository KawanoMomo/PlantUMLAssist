'use strict';
// BLK-junior-20260908-0203-wish: ドライバのコンポーネント図で「定石の依存先のうち
// 今の図に無いもの」をチェックリストとして出す。先輩の他部品の図を 1 枚ずつ開いて
// 見比べていた手順を、開かずに一覧で済ませられることを固定する。

var W = (typeof window !== 'undefined' && window) || global.window;
var CD = W.MA.componentDeps;

function uml(lines) { return ['@startuml'].concat(lines, ['@enduml']).join('\n'); }

// 指摘を受けた側。電源・割り込み・クロック・ボード設定のどれも無い。
var GPIO = uml([
  'component GpioDrv',
  'component Port_Drv',
  'GpioDrv ..> Port_Drv : 依存',
]);

// 先輩の図。UART は電源とクロック、CAN は電源と割り込みを持つ。
var UART = uml([
  'component UartDrv',
  'component Power_Ctrl',
  'component Clock_Ctrl',
  'component Dma_Drv',
  'UartDrv ..> Power_Ctrl : 依存',
  'UartDrv ..> Clock_Ctrl : 依存',
  'UartDrv ..> Dma_Drv : 依存',
]);
var CAN = uml([
  'component CanDrv',
  'component Power_Ctrl',
  'component IrqCtrl',
  'CanDrv ..> Power_Ctrl : 依存',
  'CanDrv ..> IrqCtrl : 依存',
]);

var DOCS = [
  { id: 1, name: 'gpio', diagramType: 'plantuml-component', dsl: GPIO },
  { id: 2, name: 'uart', diagramType: 'plantuml-component', dsl: UART },
  { id: 3, name: 'can', diagramType: 'plantuml-component', dsl: CAN },
  { id: 4, name: 'adc_state', diagramType: 'plantuml-state', dsl: uml(['[*] --> Idle']) },
];

describe('図に出てくる名前', function() {
  test('要素の宣言と関係の両端を拾う', function() {
    var names = CD.namesIn(GPIO);
    expect(names.indexOf('GpioDrv') >= 0).toBe(true);
    expect(names.indexOf('Port_Drv') >= 0).toBe(true);
  });

  test('関係行にしか出ない名前も拾う (宣言なしの依存先を「無い」と言わない)', function() {
    var names = CD.namesIn(uml(['component GpioDrv', 'GpioDrv ..> Power_Ctrl']));
    expect(names.indexOf('Power_Ctrl') >= 0).toBe(true);
  });
});

describe('定石が既にあるかの判定', function() {
  test('表記が違っても同じ依存先と見なす', function() {
    var power = CD.findEntry('power');
    expect(CD.hasEntry(['PowerCtrl'], power)).toBe(true);
    expect(CD.hasEntry(['PWR_MANAGER'], power)).toBe(true);
    expect(CD.hasEntry(['電源管理'], power)).toBe(true);
  });

  test('関係ない名前は一致させない', function() {
    var power = CD.findEntry('power');
    expect(CD.hasEntry(['GpioDrv', 'Port_Drv'], power)).toBe(false);
  });

  test('短い別表記は完全一致だけ (det が Detector を拾わない)', function() {
    var det = CD.findEntry('det');
    expect(CD.hasEntry(['Det'], det)).toBe(true);
    expect(CD.hasEntry(['EdgeDetector'], det)).toBe(false);
  });
});

describe('チェックリスト', function() {
  test('定石のうち図に無いものが全部出る', function() {
    var res = CD.check(GPIO, DOCS, 1);
    var names = res.rows.map(function(r) { return r.name; });
    ['Power_Ctrl', 'IrqCtrl', 'Clock_Ctrl', 'Board_Cfg'].forEach(function(n) {
      expect(names.indexOf(n) >= 0).toBe(true);
    });
    expect(res.present.length).toBe(0);
  });

  test('既にある定石は候補に出さず present に入る', function() {
    var withPower = uml(['component GpioDrv', 'component Power_Ctrl', 'GpioDrv ..> Power_Ctrl']);
    var res = CD.check(withPower, [], null);
    expect(res.rows.map(function(r) { return r.id; }).indexOf('power')).toBe(-1);
    expect(res.present.map(function(r) { return r.id; }).indexOf('power') >= 0).toBe(true);
  });

  test('他の図で依存先になっている名前も候補に出る (見比べの代わり)', function() {
    var res = CD.check(GPIO, DOCS, 1);
    var peer = res.rows.filter(function(r) { return r.source === 'peer'; });
    var names = peer.map(function(r) { return r.name; });
    expect(names.indexOf('Dma_Drv') >= 0).toBe(true);
    var dma = peer.filter(function(r) { return r.name === 'Dma_Drv'; })[0];
    expect(dma.docs).toEqual(['uart']);
    expect(dma.why.indexOf('uart') >= 0).toBe(true);
  });

  test('他の図の依存先が定石と同じなら二重に出さない', function() {
    var res = CD.check(GPIO, DOCS, 1);
    var powers = res.rows.filter(function(r) { return CD.normName(r.name) === CD.normName('Power_Ctrl'); });
    expect(powers.length).toBe(1);
    expect(powers[0].source).toBe('catalog');
  });

  test('自分の図と図種違いは実績の出所にしない', function() {
    var res = CD.check(GPIO, DOCS, 1);
    var names = res.rows.map(function(r) { return r.name; });
    expect(names.indexOf('Port_Drv')).toBe(-1);   // 自分の図の依存先
    expect(names.indexOf('Idle')).toBe(-1);       // 状態遷移図
  });

  test('候補には理由が付く', function() {
    var res = CD.check(GPIO, DOCS, 1);
    res.rows.forEach(function(r) { expect(String(r.why).length > 0).toBe(true); });
  });

  test('図が 1 枚しか無くても定石は出る', function() {
    var res = CD.check(GPIO, [], null);
    expect(res.catalogMissing).toBe(6);
    expect(res.peerMissing).toBe(0);
  });
});

describe('依存の主体', function() {
  test('出ていく関係が多い component が先頭', function() {
    expect(CD.defaultSubject(UART)).toBe('UartDrv');
  });

  test('interface は主体の候補にしない', function() {
    var dsl = uml(['component GpioDrv', 'interface IGpio', 'GpioDrv -() IGpio']);
    var ids = CD.subjects(dsl).map(function(s) { return s.id; });
    expect(ids).toEqual(['GpioDrv']);
  });

  test('要素が無ければ空', function() {
    expect(CD.defaultSubject(uml([]))).toBe('');
  });
});

describe('選んだ候補を図に足す', function() {
  test('宣言を先に、依存の矢印を後に組む', function() {
    var res = CD.check(GPIO, DOCS, 1);
    var picks = res.rows.filter(function(r) { return r.id === 'power' || r.id === 'irq'; });
    var block = CD.blockFor('GpioDrv', picks).split('\n');
    expect(block).toEqual([
      'component Power_Ctrl',
      'component IrqCtrl',
      'GpioDrv ..> Power_Ctrl : 電源制御',
      'GpioDrv ..> IrqCtrl : 割り込み制御',
    ]);
  });

  test('組んだ行はそのまま一括入力で図に入る', function() {
    var mod = W.MA.modules.plantumlComponent;
    var res = CD.check(GPIO, DOCS, 1);
    var picks = res.rows.filter(function(r) { return r.id === 'power'; });
    var out = mod.addBulk(GPIO, CD.blockFor('GpioDrv', picks), mod.parse(GPIO));
    expect(out.indexOf('component Power_Ctrl') >= 0).toBe(true);
    expect(/GpioDrv\s+\.\.>\s+Power_Ctrl\s*:\s*電源制御/.test(out)).toBe(true);
    // 足したあとは同じ候補が出なくなる (棚卸しが 1 周で終わる)。
    var after = CD.check(out, DOCS, 1);
    expect(after.rows.map(function(r) { return r.id; }).indexOf('power')).toBe(-1);
  });

  test('主体か候補が無ければ何も組まない', function() {
    expect(CD.blockFor('', [{ name: 'Power_Ctrl', label: '電源制御' }])).toBe('');
    expect(CD.blockFor('GpioDrv', [])).toBe('');
  });
});

describe('見出し', function() {
  test('欠けがあれば内訳が読める', function() {
    var t = CD.summaryText(CD.check(GPIO, DOCS, 1));
    expect(t.indexOf('定石 6 件') >= 0).toBe(true);
    expect(t.indexOf('他の図にあって無い依存') >= 0).toBe(true);
  });

  test('全部あれば欠け無しと言う', function() {
    var all = uml([
      'component GpioDrv', 'GpioDrv ..> Power_Ctrl', 'GpioDrv ..> IrqCtrl',
      'GpioDrv ..> Clock_Ctrl', 'GpioDrv ..> Board_Cfg', 'GpioDrv ..> Det',
      'GpioDrv ..> SchM',
    ]);
    var res = CD.check(all, [], null);
    expect(res.rows.length).toBe(0);
    expect(CD.summaryText(res).indexOf('すべて図にあります') >= 0).toBe(true);
  });
});
