'use strict';
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/driver-usecase-starter.js')]; } catch (e) {}
require('../src/core/driver-usecase-starter.js');
var DS = global.window.MA.driverUsecaseStarter;

describe('driver-usecase-starter — 題材名 1 語でドライバのユースケース図の下書きを作る (BLK-junior-20260909-0403)', () => {
  test('題材名は打ち方の揺れを吸収する', () => {
    expect(DS.normalizeSubject('GPIO')).toBe('GPIO');
    expect(DS.normalizeSubject(' GPIO ドライバ ')).toBe('GPIO');
    expect(DS.normalizeSubject('gpio_drv.puml')).toBe('gpio');
    expect(DS.normalizeSubject('CAN 通信')).toBe('CAN');
    expect(DS.normalizeSubject('   ')).toBe('');
  });

  test('骨格はアクター 2 / ユースケース 6 / 関連 7', () => {
    var p = DS.plan('GPIO');
    expect(p.actors.map((a) => a.label)).toEqual(['開発者', 'RTOS']);
    expect(p.usecases.length).toBe(6);
    expect(p.relations.length).toBe(7);
    // ユースケースの識別子は題材名で一意になる (別題材の図と混ざらない)
    expect(p.usecases.map((u) => u.id)).toContain('GPIO_Init');
    expect(DS.plan('UART').usecases.map((u) => u.id)).toContain('UART_Init');
  });

  test('表示名は打った綴りのまま出す', () => {
    var p = DS.plan('GPIO');
    expect(p.usecases[0].label).toBe('GPIO を初期化する');
    expect(p.usecases[5].label).toBe('GPIO の割り込みを通知する');
  });

  test('題材名が空なら何も作らない', () => {
    expect(DS.plan('')).toBe(null);
    expect(DS.dsl('  ')).toBe('');
    expect(DS.summary(null)).toContain('題材名');
  });

  test('summary は作られる件数をそのまま言う', () => {
    expect(DS.summary(DS.plan('GPIO'))).toBe('アクター 2 / ユースケース 6 / 関連 7 本の下書きを作ります');
  });

  test('DSL は描ける形で、関連は 7 本とも入る', () => {
    var d = DS.dsl('GPIO');
    expect(d.startsWith('@startuml')).toBe(true);
    expect(d.trim().endsWith('@enduml')).toBe(true);
    expect(d).toContain('left to right direction');
    expect(d).toContain('actor Developer as "開発者"');
    expect(d).toContain('usecase GPIO_Init as "GPIO を初期化する"');
    expect(d).toContain('rectangle "GPIO Driver" {');
    expect(d.match(/^Developer --> /gm).length).toBe(5);
    expect(d).toContain('RTOS --> GPIO_IrqNotify');
    // 割り込み通知は割り込み設定があるときだけ起きるので extend
    expect(d).toContain('GPIO_IrqNotify ..> GPIO_IrqSetup : <<extend>>');
  });

  test('図の名前の下書きは保存名にそのまま使える', () => {
    expect(DS.docName('GPIO')).toBe('gpio_usecase');
    expect(DS.docName('UART ドライバ')).toBe('uart_usecase');
    expect(DS.docName('')).toBe('');
  });
});
