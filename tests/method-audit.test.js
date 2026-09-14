'use strict';
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/method-audit.js')]; } catch (e) {}
require('../src/core/method-audit.js');
var MA_ = global.window.MA.methodAudit;

var CLASS_DOC = {
  name: 'driver_common_class',
  dsl: [
    '@startuml',
    'class Spi_Driver {',
    '  +Spi_Init(cfg): Std_ReturnType',
    '  +Spi_Transmit(buf, len): Std_ReturnType',
    '  -state: uint8',
    '}',
    'class Uart_Driver {',
    '  +Uart_Send(buf, len): void',
    '}',
    '@enduml',
  ].join('\n'),
};

var SEQ_DOC = {
  name: 'spi_init_sequence',
  dsl: [
    '@startuml',
    'actor App',
    'participant Spi_Driver',
    'App -> Spi_Driver : Spi_Init(cfg)',
    'Spi_Driver --> App : Std_ReturnType',
    '@enduml',
  ].join('\n'),
};

describe('method-audit — 呼び出しと宣言の突合 (BLK-reviewer-20260907-0143)', () => {
  test('argCount: 空・空白は 0、コンマ区切りの個数を数える', () => {
    expect(MA_.argCount('')).toBe(0);
    expect(MA_.argCount('   ')).toBe(0);
    expect(MA_.argCount('cfg')).toBe(1);
    expect(MA_.argCount('buf: uint8*, len: uint16')).toBe(2);
    expect(MA_.argCount(null)).toBe(0);
  });

  test('parseCall: メッセージ本文から呼び出しを取る', () => {
    // receiver は「呼ばれる側」。BLK-primary-20260907-1303 で足した
    // (接頭辞を持たない呼び出しの持ち主を矢印の受け手から決めるため)。
    expect(MA_.parseCall('App -> Spi_Driver : Spi_Init(cfg)'))
      .toEqual({ method: 'Spi_Init', args: 1, receiver: 'Spi_Driver' });
    expect(MA_.parseCall('A --> B : Uart_Send(buf, len)'))
      .toEqual({ method: 'Uart_Send', args: 2, receiver: 'B' });
  });

  test('parseCall: 呼び出しでない行は数えない', () => {
    expect(MA_.parseCall('App -> Spi_Driver : 初期化する')).toBeNull();
    expect(MA_.parseCall('participant Spi_Driver')).toBeNull();
    expect(MA_.parseCall('')).toBeNull();
    expect(MA_.parseCall(null)).toBeNull();
  });

  test('parseClassDoc: 波括弧の中のメソッドを引数個数と戻り値ごと取る', () => {
    var r = MA_.parseClassDoc(CLASS_DOC.dsl);
    expect(r.classes).toEqual(['Spi_Driver', 'Uart_Driver']);
    expect(r.methods).toEqual([
      { cls: 'Spi_Driver', method: 'Spi_Init', args: 1, ret: 'Std_ReturnType' },
      { cls: 'Spi_Driver', method: 'Spi_Transmit', args: 2, ret: 'Std_ReturnType' },
      { cls: 'Uart_Driver', method: 'Uart_Send', args: 2, ret: 'void' },
    ]);
  });

  test('parseClassDoc: 属性 (括弧なし) はメソッドに数えない', () => {
    var r = MA_.parseClassDoc('@startuml\nclass A {\n  -count: uint8\n}\n@enduml');
    expect(r.methods).toEqual([]);
    expect(r.classes).toEqual(['A']);
  });

  test('parseClassDoc: 外置きの `クラス : +メソッド()` も拾う', () => {
    var r = MA_.parseClassDoc('@startuml\nclass A\nA : +Do(x)\n@enduml');
    expect(r.methods).toEqual([{ cls: 'A', method: 'Do', args: 1, ret: '' }]);
  });

  test('ownerPrefix / findClass: Spi_Init の持ち主は Spi_Driver', () => {
    expect(MA_.ownerPrefix('Spi_Init')).toBe('Spi');
    expect(MA_.ownerPrefix('Init')).toBe('');
    expect(MA_.findClass(['Spi_Driver', 'Uart_Driver'], 'Spi')).toBe('Spi_Driver');
    expect(MA_.findClass(['Spi_Driver', 'Spi_Driver_Cfg'], 'Spi')).toBe('Spi_Driver');
    expect(MA_.findClass(['Uart_Driver'], 'Timer')).toBeNull();
    expect(MA_.findClass(['Uart_Driver'], '')).toBeNull();
  });

  test('audit: 宣言と一致していれば指摘なし', () => {
    var r = MA_.audit([CLASS_DOC, SEQ_DOC]);
    expect(r.issues).toEqual([]);
    expect(r.clean).toBe(true);
    expect(r.calls.length).toBe(1);
  });

  test('audit: 対応するクラスが無い (UART/Timer/ADC で繰り返した欠落)', () => {
    var seq = { name: 'timer_init_sequence', dsl: '@startuml\nApp -> Timer_Driver : Timer_Init(cfg)\n@enduml' };
    var r = MA_.audit([CLASS_DOC, seq]);
    expect(r.issues.length).toBe(1);
    expect(r.issues[0].kind).toBe('no-class');
    expect(r.issues[0].method).toBe('Timer_Init');
    expect(r.issues[0].owner).toBe('Timer');
    expect(MA_.describe(r.issues[0])).toBe('Timer_Init() を呼んでいるが、Timer のクラスがどの図にも無い');
  });

  test('audit: クラスはあるがメソッドが無い (Uart_Recv の欠落)', () => {
    var seq = { name: 'uart_state', dsl: '@startuml\nApp -> Uart_Driver : Uart_Recv(buf, len)\n@enduml' };
    var r = MA_.audit([CLASS_DOC, seq]);
    expect(r.issues.length).toBe(1);
    expect(r.issues[0].kind).toBe('no-method');
    expect(r.issues[0].cls).toBe('Uart_Driver');
    expect(MA_.describe(r.issues[0])).toBe('Uart_Recv() を呼んでいるが、Uart_Driver に宣言が無い');
  });

  test('audit: 引数の個数が宣言と違う', () => {
    var seq = { name: 'spi_tx', dsl: '@startuml\nApp -> Spi_Driver : Spi_Transmit(buf)\n@enduml' };
    var r = MA_.audit([CLASS_DOC, seq]);
    expect(r.issues.length).toBe(1);
    expect(r.issues[0].kind).toBe('arity');
    expect(r.issues[0].args).toBe(1);
    expect(r.issues[0].declaredArgs).toBe(2);
    expect(MA_.describe(r.issues[0]))
      .toBe('Spi_Transmit() の引数が 1 個だが、Spi_Driver の宣言は 2 個');
  });

  test('audit: 同じ呼び出しが複数の図に出ても指摘は 1 件にまとまる', () => {
    var a = { name: 'seq_a', dsl: '@startuml\nApp -> Timer_Driver : Timer_Init(cfg)\n@enduml' };
    var b = { name: 'seq_b', dsl: '@startuml\nApp -> Timer_Driver : Timer_Init(cfg)\n@enduml' };
    var r = MA_.audit([CLASS_DOC, a, b]);
    expect(r.issues.length).toBe(1);
    expect(r.issues[0].docs).toEqual(['seq_a', 'seq_b']);
  });

  test('audit: 深刻な順 (クラス無し → メソッド無し → 引数違い) に並ぶ', () => {
    var docs = [
      CLASS_DOC,
      { name: 's1', dsl: '@startuml\nA -> B : Spi_Transmit(buf)\n@enduml' },
      { name: 's2', dsl: '@startuml\nA -> B : Uart_Recv(buf)\n@enduml' },
      { name: 's3', dsl: '@startuml\nA -> B : Timer_Init(cfg)\n@enduml' },
    ];
    expect(MA_.audit(docs).issues.map(i => i.kind)).toEqual(['no-class', 'no-method', 'arity']);
  });

  // BLK-reviewer-20260914-1406: 指摘が減ったことを「直った」と読めるのは、
  // 減り方が正しいときだけ。宣言の付け方の誤りは件数を増やす側に出す。
  test('audit: メソッド名をクラスとして宣言した空のクラスを名指しする', () => {
    var cls = { name: 'driver_common_class', dsl: [
      '@startuml', 'class AdcRegs', 'class WriteConfig',
      'class Adc_Driver {', '  +Adc_Init()', '}', '@enduml'].join('\n') };
    var seq = { name: 'adc_sequence', dsl: '@startuml\nAdc_Driver -> AdcRegs : WriteConfig()\n@enduml' };
    var r = MA_.audit([cls, seq]);
    var mac = r.issues.filter(i => i.kind === 'method-as-class');
    expect(mac.length).toBe(1);
    expect(mac[0].method).toBe('WriteConfig');
    expect(mac[0].docs).toEqual(['driver_common_class']);
    expect(MA_.describe(mac[0])).toBe(
      'WriteConfig は同名の呼び出しがあるのに中身が 1 行も無いクラス宣言 (driver_common_class)。'
      + 'メソッド宣言を独立したクラスとして書いた誤りの疑い');
    // 受け手のクラスを足しただけでは no-method は消えない (数だけ見て直ったと読めない)
    expect(r.issues.filter(i => i.kind === 'no-method').length).toBe(1);
  });

  test('audit: 中身を持つクラスは呼び出しと同名でも疑わない', () => {
    var cls = { name: 'c', dsl: '@startuml\nclass WriteConfig {\n  +apply()\n}\n@enduml' };
    var seq = { name: 's', dsl: '@startuml\nA -> WriteConfig : WriteConfig()\n@enduml' };
    expect(MA_.audit([cls, seq]).issues.filter(i => i.kind === 'method-as-class')).toEqual([]);
  });

  test('audit: 呼び出しの無い空のクラス宣言は疑わない', () => {
    var cls = { name: 'c', dsl: '@startuml\nclass AdcRegs\nclass Adc_Driver {\n  +Adc_Init()\n}\n@enduml' };
    var seq = { name: 's', dsl: '@startuml\nApp -> Adc_Driver : Adc_Init()\n@enduml' };
    expect(MA_.audit([cls, seq]).issues).toEqual([]);
  });

  test('audit: 宣言が写し (-編集中) にしかなければ本体未修正として出す', () => {
    var draft = { name: 'driver_common_class-編集中', dsl: [
      '@startuml', 'class Timer_Driver {', '  +Timer_Init(cfg)', '}', '@enduml'].join('\n') };
    var seq = { name: 'timer_sequence', dsl: '@startuml\nApp -> Timer_Driver : Timer_Init(cfg)\n@enduml' };
    var r = MA_.audit([draft, seq]);
    expect(r.issues.map(i => i.kind)).toEqual(['draft-only']);
    expect(r.issues[0].declDocs).toEqual(['driver_common_class-編集中']);
    expect(MA_.describe(r.issues[0])).toBe(
      'Timer_Init() の宣言が写しの driver_common_class-編集中 にしかない (本体は未修正のまま)');
  });

  test('audit: 本体にも宣言があれば写しがあっても出さない', () => {
    var body = { name: 'driver_common_class', dsl: [
      '@startuml', 'class Timer_Driver {', '  +Timer_Init(cfg)', '}', '@enduml'].join('\n') };
    var draft = { name: 'driver_common_class-編集中', dsl: body.dsl };
    var seq = { name: 'timer_sequence', dsl: '@startuml\nApp -> Timer_Driver : Timer_Init(cfg)\n@enduml' };
    expect(MA_.audit([body, draft, seq]).issues).toEqual([]);
  });

  test('isCopyDoc: 写しの印を持つ名前だけを写しと見る', () => {
    expect(MA_.isCopyDoc('driver_common_class-編集中')).toBe(true);
    expect(MA_.isCopyDoc('spi-old.puml')).toBe(true);
    expect(MA_.isCopyDoc('driver_common_class')).toBe(false);
  });

  test('parseClassDoc: クラスごとの本体の行数を数える', () => {
    var r = MA_.parseClassDoc('@startuml\nclass A\nclass B {\n  -x: int\n}\n@enduml');
    expect(r.members.A).toBe(0);
    expect(r.members.B).toBe(1);
  });

  test('audit: 図が 0 枚でも落ちない', () => {
    expect(MA_.audit([]).clean).toBe(true);
    expect(MA_.audit(null).issues).toEqual([]);
  });
});
