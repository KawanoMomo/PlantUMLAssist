'use strict';
// BLK-reviewer-20260914-1106-wish: timer_state.puml の 5 遷移が
// driver_common_class.puml の Timer_Driver に対応メソッドを 1 つも持たない、という
// 不整合は tools/audit.js を実行して JSON を読み解くまで分からなかった。
// 保存フォルダの全文を入口に、部品ごとに図を束ねて欠落を名指しできることを見る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/dsl-utils.js', '../src/core/method-audit.js', '../src/core/part-cross.js']
  .forEach(function(m) {
    try { delete require.cache[require.resolve(m)]; } catch (e) {}
    require(m);
  });
var pc = global.window.MA.partCross;

var CLASS_DOC = {
  name: 'driver_common_class',
  kind: 'class',
  text: '@startuml\nclass Timer_Driver {\n  + Timer_Init()\n}\n'
    + 'class Spi_Driver {\n  + Spi_Init()\n  + Spi_Send(buf, len)\n}\n@enduml',
};
// 実物と同じ形: 接頭辞つきの遷移ラベルが 2 つ、接頭辞なしの UML イベントが 1 つ。
var STATE_DOC = {
  name: 'timer_state',
  kind: 'state',
  text: '@startuml\n[*] --> Idle\nIdle --> Busy : Timer_Start\n'
    + 'Busy --> Idle : Timer_Stop\nBusy --> Fault : Tick\n@enduml',
};
var SEQ_DOC = {
  name: 'spi_init_sequence',
  kind: 'sequence',
  text: '@startuml\nparticipant Spi_Driver\nparticipant Mcu\n'
    + 'Mcu -> Spi_Driver: Spi_Init()\nMcu -> Spi_Driver: Spi_Reset()\n@enduml',
};

describe('partCross.scan', () => {
  test('遷移ラベルに対応するメソッドが無いクラスを名指しする', () => {
    var s = pc.scan([CLASS_DOC, STATE_DOC]);
    var row = s.parts.filter((r) => r.part === 'Timer_Driver')[0];
    expect(row.part).toBe('Timer_Driver');
    expect(row.missing.map((m) => m.name)).toEqual(['Timer_Start', 'Timer_Stop']);
    expect(row.missing.every((m) => m.via === 'state')).toBe(true);
    expect(s.missingTotal).toBe(2);
    expect(s.flagged).toBe(1);
  });

  test('束ねた図には、クラス図と状態遷移図の両方が入る', () => {
    var s = pc.scan([CLASS_DOC, STATE_DOC]);
    var row = s.parts.filter((r) => r.part === 'Timer_Driver')[0];
    expect(row.classDocs).toEqual(['driver_common_class']);
    expect(row.stateDocs).toEqual(['timer_state']);
    expect(row.docs).toEqual(['driver_common_class', 'timer_state']);
  });

  test('接頭辞を持たない UML のイベント名は突合の対象外', () => {
    var s = pc.scan([CLASS_DOC, STATE_DOC]);
    var names = s.parts.reduce((a, r) => a.concat(r.missing.map((m) => m.name)), []);
    expect(names).not.toContain('Tick');
  });

  test('シーケンスのメッセージも同じ部品に束ねる', () => {
    var s = pc.scan([CLASS_DOC, SEQ_DOC]);
    var row = s.parts.filter((r) => r.part === 'Spi_Driver')[0];
    expect(row.seqDocs).toEqual(['spi_init_sequence']);
    // Spi_Init は宣言があるので出ない。Spi_Reset だけが欠落。
    expect(row.missing.map((m) => m.name)).toEqual(['Spi_Reset']);
    expect(row.ok).toBe(1);
  });

  test('クラス図の本体行そのものは呼び出しとして数えない', () => {
    var s = pc.scan([CLASS_DOC]);
    expect(s.missingTotal).toBe(0);
  });

  test('対応する型のクラスがどの図にも無ければ orphan として別に出す', () => {
    var s = pc.scan([STATE_DOC]);
    expect(s.parts).toEqual([]);
    expect(s.orphans.length).toBe(1);
    expect(s.orphans[0].owner).toBe('Timer');
    expect(s.orphans[0].names).toEqual(['Timer_Start', 'Timer_Stop']);
    expect(pc.orphanLine(s.orphans[0]))
      .toBe('Timer のクラスがどのクラス図にも無い: Timer_Start / Timer_Stop');
  });

  test('本文の無い一覧 (texts を返さない server) では何も言わない', () => {
    var s = pc.scan([{ name: 'timer_state', kind: 'state' }]);
    expect(s.parts).toEqual([]);
    expect(s.orphans).toEqual([]);
    expect(pc.summaryLine(s)).toBe('');
  });

  test('CRLF で保存された図でも遷移ラベルを取り逃さない', () => {
    var crlf = { name: 'timer_state', kind: 'state', text: STATE_DOC.text.replace(/\n/g, '\r\n') };
    var s = pc.scan([CLASS_DOC, crlf]);
    var row = s.parts.filter((r) => r.part === 'Timer_Driver')[0];
    expect(row.missing.map((m) => m.name)).toEqual(['Timer_Start', 'Timer_Stop']);
  });
});

describe('partCross の 1 行', () => {
  test('欠落があれば、どのクラスに何を足すのかまで書く', () => {
    var s = pc.scan([CLASS_DOC, STATE_DOC]);
    var row = s.parts.filter((r) => r.part === 'Timer_Driver')[0];
    expect(pc.partLine(row)).toBe('Timer_Driver に宣言が無い: Timer_Start / Timer_Stop');
    expect(pc.partTitle(row)).toContain('状態遷移図の遷移ラベル: Timer_Start, Timer_Stop');
    expect(pc.summaryLine(s)).toBe('部品の突合: 1 部品にクラス未宣言 2 件');
  });

  test('欠落が無ければ「揃っている」と言い切る (黙らない)', () => {
    var ok = {
      name: 'timer_state', kind: 'state',
      text: '@startuml\nIdle --> Busy : Timer_Init\n@enduml',
    };
    var s = pc.scan([CLASS_DOC, ok]);
    expect(s.missingTotal).toBe(0);
    expect(pc.summaryLine(s)).toBe('部品の突合: 1 部品すべてで遷移ラベル・メッセージ名がクラスに揃っています');
  });

  test('行の印は、その図に出てくる欠落だけを数える', () => {
    var s = pc.scan([CLASS_DOC, STATE_DOC, SEQ_DOC]);
    expect(pc.badge(s, 'timer_state').mark).toBe('クラス未宣言 2');
    expect(pc.badge(s, 'timer_state').part).toBe('Timer_Driver');
    expect(pc.badge(s, 'spi_init_sequence').mark).toBe('クラス未宣言 1');
    expect(pc.badge(s, 'driver_common_class')).toBe(null);
  });
});
