'use strict';
// BLK-primary-20260907-1803-wish: state 図の遷移イベントと class 図のメソッドの
// 突合表と、表の行からクラスへメソッドを足す操作。
// 指摘文とクラス一覧を目で突き合わせて対応表を作り、クラスを 1 つずつ選んで
// メソッド追加フォームを開く、を繰り返していた所を 1 画面にまとめる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/dsl-utils.js', '../src/core/method-audit.js', '../src/core/event-sync.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var ES = global.window.MA.eventSync;

function stateDoc(name, lines) {
  return { id: name, name: name, diagramType: 'plantuml-state', dsl: ['@startuml'].concat(lines, ['@enduml']).join('\n') };
}

var ADC_STATE = stateDoc('adc_state', [
  '[*] --> Idle',
  'Idle --> Busy : Adc_StartConv',
  'Busy --> Idle : Adc_Reset',
  'Busy --> Error : Fault',
]);
var GPIO_STATE = stateDoc('gpio_state', [
  '[*] --> Low',
  'Low --> High : Gpio_SetHigh',
  'High --> Low : Gpio_SetLow',
  'High --> Low : Gpio_Reset',
]);
var CAN_STATE = stateDoc('can_state', [
  '[*] --> Stop',
  'Stop --> Run : Can_Reset',
]);

var CLASS_DOC = {
  id: 'cls',
  name: 'driver_common_class',
  diagramType: 'plantuml-class',
  dsl: [
    '@startuml',
    'class Adc_Driver {',
    '  +Adc_StartConv() : void',
    '}',
    'class Gpio_Driver',
    'Gpio_Driver : +Gpio_Init() : void',
    'class Can_Driver {',
    '}',
    '@enduml',
  ].join('\n'),
};

var DOCS = [ADC_STATE, GPIO_STATE, CAN_STATE, CLASS_DOC];

describe('event-sync — イベント⇔メソッド突合表 (BLK-primary-1803-wish)', () => {
  test('build: 全 state 図のイベントが 1 枚の表に並ぶ', () => {
    var r = ES.build(DOCS);
    var names = r.rows.map(function(x) { return x.event; });
    expect(names.indexOf('Adc_StartConv') >= 0).toBe(true);
    expect(names.indexOf('Gpio_SetHigh') >= 0).toBe(true);
    expect(names.indexOf('Can_Reset') >= 0).toBe(true);
    expect(r.total).toBe(7);
  });

  test('build: 宣言済みは ok、欠落は missing、接頭辞なしは excluded', () => {
    var r = ES.build(DOCS);
    function st(ev) {
      var hit = r.rows.filter(function(x) { return x.event === ev; })[0];
      return hit ? hit.status : '';
    }
    expect(st('Adc_StartConv')).toBe('ok');
    expect(st('Adc_Reset')).toBe('missing');
    expect(st('Gpio_SetHigh')).toBe('missing');
    expect(st('Fault')).toBe('excluded');
    expect(r.counts.missing).toBe(5);
    expect(r.counts.ok).toBe(1);
    expect(r.counts.excluded).toBe(1);
  });

  test('build: 欠落行は追加先のクラスと図を持つ', () => {
    var r = ES.build(DOCS);
    var row = r.missing.filter(function(x) { return x.event === 'Gpio_SetLow'; })[0];
    expect(row.cls).toBe('Gpio_Driver');
    expect(row.classDoc).toBe('driver_common_class');
    expect(row.classDocId).toBe('cls');
  });

  test('build: 欠落行は先頭に並ぶ (指摘の反映から手を付けられる)', () => {
    var r = ES.build(DOCS);
    expect(r.rows[0].status).toBe('missing');
    expect(r.rows[r.rows.length - 1].status).toBe('excluded');
  });

  test('build: 同じイベントが 2 枚の state 図に出たら 1 行にまとまる', () => {
    var other = stateDoc('adc2_state', ['[*] --> Idle', 'Idle --> Busy : Adc_Reset']);
    var r = ES.build([ADC_STATE, other, CLASS_DOC]);
    var row = r.rows.filter(function(x) { return x.event === 'Adc_Reset'; })[0];
    expect(row.stateDocs.length).toBe(2);
    expect(row.stateDocs.join(',')).toBe('adc_state,adc2_state');
  });

  test('build: 対応するクラスがどの図にも無ければ no-class', () => {
    var r = ES.build([stateDoc('spi_state', ['Idle --> Busy : Spi_Send']), CLASS_DOC]);
    var row = r.rows.filter(function(x) { return x.event === 'Spi_Send'; })[0];
    expect(row.status).toBe('no-class');
    expect(row.cls).toBe('');
  });

  test('addMethod: 本体 { } を持つクラスは閉じ括弧の直前に足す', () => {
    var res = ES.addMethod(CLASS_DOC.dsl, 'Adc_Driver', 'Adc_Reset', 'void');
    expect(res.added).toBe(true);
    var lines = res.dsl.split('\n');
    expect(lines[3]).toBe('  +Adc_Reset() : void');
    expect(lines[4]).toBe('}');
  });

  test('addMethod: 本体を持たないクラスは外置きの後ろに足す', () => {
    var res = ES.addMethod(CLASS_DOC.dsl, 'Gpio_Driver', 'Gpio_SetHigh', 'void');
    expect(res.added).toBe(true);
    expect(res.dsl.indexOf('Gpio_Driver : +Gpio_SetHigh() : void') > 0).toBe(true);
    // 既存の外置きメンバーより後ろ
    expect(res.dsl.indexOf('Gpio_Init') < res.dsl.indexOf('Gpio_SetHigh')).toBe(true);
  });

  test('addMethod: 空の本体にも足せる', () => {
    var res = ES.addMethod(CLASS_DOC.dsl, 'Can_Driver', 'Can_Reset', '');
    expect(res.added).toBe(true);
    expect(res.dsl.indexOf('  +Can_Reset()') > 0).toBe(true);
  });

  test('addMethod: 既にあるメソッドは足さない', () => {
    var res = ES.addMethod(CLASS_DOC.dsl, 'Adc_Driver', 'Adc_StartConv', 'void');
    expect(res.added).toBe(false);
    expect(res.reason).toBe('exists');
    expect(res.dsl).toBe(CLASS_DOC.dsl);
  });

  test('addMethod: 無いクラスには足さない', () => {
    var res = ES.addMethod(CLASS_DOC.dsl, 'Spi_Driver', 'Spi_Send', 'void');
    expect(res.added).toBe(false);
    expect(res.reason).toBe('no-class');
  });

  test('addMethod: CRLF の図でも改行の種類を変えない', () => {
    var crlf = CLASS_DOC.dsl.replace(/\n/g, '\r\n');
    var res = ES.addMethod(crlf, 'Adc_Driver', 'Adc_Reset', 'void');
    expect(res.added).toBe(true);
    expect(res.dsl.indexOf('\n\n')).toBe(-1);
    expect(/\r\n\s*\+Adc_Reset\(\) : void\r\n/.test(res.dsl)).toBe(true);
  });

  test('apply: 3 クラスへの欠落 5 件を 1 回で当てる', () => {
    var r = ES.build(DOCS);
    var res = ES.apply(DOCS, r.missing, 'void');
    expect(res.added.length).toBe(5);
    // 追加先はすべて同じ図なので、書き換えは 1 枚だけ
    expect(res.changed.length).toBe(1);
    expect(res.changed[0].id).toBe('cls');
    var after = ES.build([ADC_STATE, GPIO_STATE, CAN_STATE, { id: 'cls', name: 'driver_common_class', diagramType: 'plantuml-class', dsl: res.changed[0].dsl }]);
    expect(after.counts.missing).toBe(0);
    expect(after.counts.ok).toBe(6);
  });

  test('apply: 1 行だけ選んでも当てられる', () => {
    var r = ES.build(DOCS);
    var one = r.missing.filter(function(x) { return x.event === 'Can_Reset'; });
    var res = ES.apply(DOCS, one, 'void');
    expect(res.added.join(',')).toBe('Can_Reset');
    expect(res.changed[0].dsl.indexOf('Adc_Reset')).toBe(-1);
  });

  test('apply: no-class の行は skipped に落ちる', () => {
    var docs = [stateDoc('spi_state', ['Idle --> Busy : Spi_Send']), CLASS_DOC];
    var r = ES.build(docs);
    var res = ES.apply(docs, r.rows, 'void');
    expect(res.added.length).toBe(0);
    expect(res.skipped.length).toBe(1);
    expect(res.skipped[0].event).toBe('Spi_Send');
  });

  test('summary / badgeLabel: 0 件は言い切る', () => {
    var r = ES.build(DOCS);
    expect(ES.summary(r).indexOf('追加できる欠落 5') > 0).toBe(true);
    expect(ES.badgeLabel(r)).toBe('⇄ イベント 5');
    var clean = ES.build([ADC_STATE, {
      id: 'c2', name: 'c2', diagramType: 'plantuml-class',
      dsl: '@startuml\nclass Adc_Driver {\n  +Adc_StartConv()\n  +Adc_Reset()\n}\n@enduml',
    }]);
    expect(clean.counts.missing).toBe(0);
    expect(ES.badgeLabel(clean)).toBe('⇄ イベント OK');
    expect(ES.summary(clean).indexOf('欠落なし') > 0).toBe(true);
  });

  test('memberText: 戻り値が空なら型を書かない', () => {
    expect(ES.memberText('Gpio_Reset', 'void')).toBe('+Gpio_Reset() : void');
    expect(ES.memberText('Gpio_Reset', '')).toBe('+Gpio_Reset()');
  });
});
