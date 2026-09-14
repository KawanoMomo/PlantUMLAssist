'use strict';
// BLK-junior-20260907-1203-wish: 系統 1 セットを対応表 1 回でまとめて複製する。

const FC = () => window.MA.familyClone;

function doc(name, type, dsl) {
  return { id: name, name: name, diagramType: type, dsl: dsl };
}

const DOCS = [
  doc('Gpio-sequence.puml', 'plantuml-sequence', [
    '@startuml', 'title Gpio 初期化', 'participant GpioDrv', 'participant GpioHal',
    'GpioDrv -> GpioHal : Gpio_HalInit()', '@enduml',
  ].join('\n')),
  doc('Gpio-state.puml', 'plantuml-state', [
    '@startuml', 'title Gpio 状態遷移', '[*] --> Gpio_Idle',
    'Gpio_Idle --> Gpio_Busy : Gpio_Start', '@enduml',
  ].join('\n')),
  doc('Gpio-class.puml', 'plantuml-class', [
    '@startuml', 'class GpioDriver {', '  +Gpio_Init()', '}', '@enduml',
  ].join('\n')),
  doc('Adc-state.puml', 'plantuml-state', [
    '@startuml', '[*] --> Adc_Idle', '@enduml',
  ].join('\n')),
];

describe('family-clone — 系統でまとめて題材を替える', () => {

  test('図の名前の頭でセットに束ね、枚数の多い順に並べる', () => {
    var gs = FC().groups(DOCS);
    expect(gs.length).toBe(2);
    expect(gs[0].key).toBe('gpio');
    expect(gs[0].docs.length).toBe(3);
    expect(gs[1].key).toBe('adc');
  });

  test('セットの見出しに枚数と図種が出る (6 枚揃っているかが一目で分かる)', () => {
    var label = FC().groupLabel(FC().groups(DOCS)[0]);
    expect(label).toContain('gpio');
    expect(label).toContain('3 枚');
    expect(label).toContain('シーケンス');
    expect(label).toContain('状態遷移');
  });

  test('置換元の既定は、図の中で実際に使われている綴りになる', () => {
    expect(FC().suggestFrom(FC().groups(DOCS)[0])).toBe('Gpio');
  });

  test('対応表 1 組でセットの全部の図が題材替えされる', () => {
    var p = FC().plan(FC().groups(DOCS)[0], [{ from: 'Gpio', to: 'Uart' }], []);
    expect(p.docs).toBe(3);
    expect(p.items.map((i) => i.name)).toEqual(['Uart-sequence', 'Uart-state', 'Uart-class']);
    expect(p.items[0].dsl).toContain('participant UartDrv');
    expect(p.items[1].dsl).toContain('Uart_Idle --> Uart_Busy : Uart_Start');
    expect(p.items[2].dsl).toContain('class UartDriver');
    expect(p.ready).toBe(true);
  });

  test('図種は元の図から引き継ぐ (作った直後に描ける)', () => {
    var p = FC().plan(FC().groups(DOCS)[0], [{ from: 'Gpio', to: 'Uart' }], []);
    expect(p.items.map((i) => i.diagramType))
      .toEqual(['plantuml-sequence', 'plantuml-state', 'plantuml-class']);
  });

  test('既にある名前とはぶつからない名前を付ける', () => {
    var p = FC().plan(FC().groups(DOCS)[0], [{ from: 'Gpio', to: 'Uart' }], ['Uart-sequence.puml']);
    expect(p.items[0].name).toBe('Uart-sequence-2');
    expect(p.items[1].name).toBe('Uart-state');
  });

  test('置換元が出てこない図が 1 枚でもあれば作らせない (元の題材の複製が増えるだけ)', () => {
    var mixed = { key: 'gpio', types: [], docs: DOCS.slice(0, 2).concat([DOCS[3]]) };
    var p = FC().plan(mixed, [{ from: 'Gpio', to: 'Uart' }], []);
    expect(p.ready).toBe(false);
    expect(p.untouched).toEqual(['Adc-state']);
    expect(FC().summaryText(p)).toContain('Adc-state');
  });

  test('置換で消えなかった宣言名は挙げるが、作成は止めない (App のような相手役で止まらない)', () => {
    var g = { key: 'gpio', types: [], docs: [doc('Gpio-mix.puml', 'plantuml-class', [
      '@startuml', 'class GpioDriver', 'class PortMux', 'GpioDriver --> PortMux', '@enduml',
    ].join('\n'))] };
    var p = FC().plan(g, [{ from: 'Gpio', to: 'Uart' }], []);
    expect(p.remaining).toBe(1);
    expect(FC().remainingNames(p)).toEqual(['PortMux']);
    expect(p.ready).toBe(true);
    expect(FC().summaryText(p)).toContain('PortMux');
  });

  test('対応表に 2 組目を足せば残った名前も消えて作れるようになる', () => {
    var g = { key: 'gpio', types: [], docs: [doc('Gpio-mix.puml', 'plantuml-class', [
      '@startuml', 'class GpioDriver', 'class PortMux', 'GpioDriver --> PortMux', '@enduml',
    ].join('\n'))] };
    var p = FC().plan(g, [{ from: 'Gpio', to: 'Uart' }, { from: 'PortMux', to: 'UartMux' }], []);
    expect(p.remaining).toBe(0);
    expect(p.ready).toBe(true);
    expect(p.items[0].dsl).toContain('class UartMux');
  });

  test('対応表が空なら何も作らせない', () => {
    var p = FC().plan(FC().groups(DOCS)[0], [], []);
    expect(p.ready).toBe(false);
    expect(FC().summaryText(p)).toContain('置換元と置換先');
  });

  test('確定前の 1 行に、作る枚数と変わる行数が出る', () => {
    var p = FC().plan(FC().groups(DOCS)[0], [{ from: 'Gpio', to: 'Uart' }], []);
    expect(FC().summaryText(p)).toContain('3 枚を作ります');
  });

  test('図が 1 枚も無くても例外を投げない', () => {
    expect(FC().groups([])).toEqual([]);
    expect(FC().groups(null)).toEqual([]);
    expect(FC().plan(null, [{ from: 'a', to: 'b' }], []).docs).toBe(0);
    expect(FC().summaryText(null)).toContain('セットを選ぶ');
  });
});
