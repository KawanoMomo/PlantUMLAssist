'use strict';
// BLK-junior-20260907-0803-wish: 既存の図をテンプレートに、部品名だけ替えた
// 図を作る。模写ではなく置換で作るので写し間違いが起きないことを確かめる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/template-new.js')]; } catch (e) {}
require('../src/core/template-new.js');
var TN = global.window.MA.templateNew;

var TPL = [
  '@startuml',
  'title UART 受信ドライバ',
  '[*] --> Uart_Idle',
  'state Uart_Idle',
  'state Uart_Busy',
  'Uart_Idle --> Uart_Busy : UART_START',
  'Uart_Busy --> Uart_Idle : uart_done',
  'note right of Uart_Busy : UartDrv が転送中',
  '@enduml',
].join('\n');

describe('caseVariants', function() {
  test('打った綴り・UPPER・lower・Capitalized の 4 族を作る', function() {
    var v = TN.caseVariants('Uart', 'Gpio');
    expect(v.length).toBe(3);   // Uart と Capitalized(Uart) は同じなので畳まれる
    expect(v[0]).toEqual({ from: 'Uart', to: 'Gpio' });
    expect(v[1]).toEqual({ from: 'UART', to: 'GPIO' });
    expect(v[2]).toEqual({ from: 'uart', to: 'gpio' });
  });

  test('全大文字で打っても小文字・先頭大文字の族が付く', function() {
    var v = TN.caseVariants('UART', 'CAN');
    expect(v[0]).toEqual({ from: 'UART', to: 'CAN' });
    expect(v.map(function(x) { return x.from; })).toContain('uart');
    expect(v.map(function(x) { return x.from; })).toContain('Uart');
  });

  test('どちらかが空なら何もしない', function() {
    expect(TN.caseVariants('', 'Gpio').length).toBe(0);
    expect(TN.caseVariants('Uart', '').length).toBe(0);
  });
});

describe('instantiate', function() {
  var out = TN.instantiate(TPL, 'Uart', 'Gpio');

  test('state 名が置き換わる', function() {
    expect(out).toContain('state Gpio_Idle');
    expect(out).not.toContain('Uart_Idle');
  });

  test('タイトルの全大文字も同時に置き換わる', function() {
    expect(out).toContain('title GPIO 受信ドライバ');
  });

  test('遷移ラベルの大文字・小文字がどちらも追随する', function() {
    expect(out).toContain(': GPIO_START');
    expect(out).toContain(': gpio_done');
  });

  test('note の中の型名も置き換わる', function() {
    expect(out).toContain('GpioDrv が転送中');
  });

  test('行数と構成は変わらない (模写ではないので構造がずれない)', function() {
    expect(out.split('\n').length).toBe(TPL.split('\n').length);
  });

  test('識別子の途中では置換しない', function() {
    expect(TN.instantiate('participant MyUartX\nparticipant Uart', 'Uart', 'Gpio'))
      .toBe('participant MyUartX\nparticipant Gpio');
  });

  test('小文字が続くだけの語は別物として残す (Uartlet は替えない)', function() {
    expect(TN.instantiate('state Uartlet\nstate Uart_Idle', 'Uart', 'Gpio'))
      .toBe('state Uartlet\nstate Gpio_Idle');
  });

  test('置換元が入っていなければ元のまま', function() {
    expect(TN.instantiate(TPL, 'Spi', 'Gpio')).toBe(TPL);
    expect(TN.instantiate(TPL, '', 'Gpio')).toBe(TPL);
  });
});

describe('previewLines', function() {
  test('変わる行だけを before/after で返す', function() {
    var rows = TN.previewLines(TPL, 'Uart', 'Gpio');
    expect(rows.length).toBe(7);
    expect(rows[0].line).toBe(2);
    expect(rows[0].before).toBe('title UART 受信ドライバ');
    expect(rows[0].after).toBe('title GPIO 受信ドライバ');
  });

  test('変わらなければ 0 行', function() {
    expect(TN.previewLines(TPL, 'Spi', 'Gpio').length).toBe(0);
  });
});

describe('candidates', function() {
  var cands = TN.candidates(TPL);

  test('部品名の一族の共通の頭が先頭に来る (Uart_Idle ではなく Uart)', function() {
    expect(cands[0].name).toBe('Uart');
    expect(cands[0].count).toBe(9);
  });

  test('個々の名前も候補に残る', function() {
    var names = cands.map(function(c) { return c.name; });
    expect(names).toContain('Uart_Idle');
    expect(names).toContain('UartDrv');
  });

  test('PlantUML の構文語は候補にしない', function() {
    var names = cands.map(function(c) { return c.name; });
    expect(names).not.toContain('state');
    expect(names).not.toContain('title');
    expect(names).not.toContain('note');
    expect(names).not.toContain('startuml');
  });

  test('空の DSL なら候補なし', function() {
    expect(TN.candidates('').length).toBe(0);
  });
});

describe('suggestName', function() {
  test('元の名前の中の語を置き換える', function() {
    expect(TN.suggestName('uart-driver.puml', 'Uart', 'Gpio')).toBe('gpio-driver');
  });

  test('語が入っていなければ置換先を足して別名にする', function() {
    expect(TN.suggestName('driver', 'Uart', 'Gpio')).toBe('driver-Gpio');
  });

  test('置換先が空ならそのまま', function() {
    expect(TN.suggestName('uart-driver', 'Uart', '')).toBe('uart-driver');
  });
});
