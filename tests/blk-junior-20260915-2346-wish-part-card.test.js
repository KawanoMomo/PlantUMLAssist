'use strict';
// BLK-junior-20260915-2346-wish: 部品 1 個・6 図種を 1 まとまりとして見るカード。
// ここで固定するのは:
//   - 進捗の母数は常に 6 で、数えるのは「自分が持っている枚数」
//   - 先輩に合っていない図種が、名前の照合で 1 行に出る
//   - 綴りだけの違い (Spi_Init ⇔ SPI_Init) は「無い」と混ぜず表記揺れとして出る
//   - 相乗り図が手本のとき、他部品の名前 (Can_Init) を「自分に無い」に数えない
//   - 手本か自分のどちらかが無い図種は判定しない (合っている側に寄せない)
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

[
  '../src/core/diagram-kind.js',
  '../src/core/family-audit.js',
  '../src/core/domain-cohort.js',
  '../src/core/peek-verdict.js',
  '../src/core/kind-matrix.js',
  '../src/core/method-audit.js',
  '../src/core/name-pairing.js',
  '../src/core/part-reference.js',
  '../src/core/part-slice.js',
  '../src/core/part-vocab.js',
  '../src/core/part-board.js',
  '../src/core/part-card.js',
].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  try { require(m); } catch (e) { /* 依存の順で読めないものは各モジュールが自分で外す */ }
});
var PC = global.window.MA.partCard;

var SENIOR_CLASS = [
  '@startuml',
  'class Driver_Common',
  'class Spi_Driver {',
  '  +Spi_Init()',
  '  +Spi_Transmit()',
  '  +Spi_Reset()',
  '}',
  'class Can_Driver {',
  '  +Can_Init()',
  '}',
  'Driver_Common <|-- Spi_Driver',
  '@enduml',
].join('\n');

var SENIOR = [
  { name: 'spi_init_sequence', kind: 'sequence', text: ['@startuml', 'participant Spi_Driver', 'Spi_Driver -> IRQCtrl : Spi_Init()', '@enduml'].join('\n') },
  { name: 'spi_state', kind: 'state', text: ['@startuml', '[*] --> Idle', 'Idle --> Busy : Spi_Transmit', 'Busy --> Idle : TransferComplete', '@enduml'].join('\n') },
  { name: 'driver_common_class', kind: 'class', text: SENIOR_CLASS },
  { name: 'spi_activity', kind: 'activity', text: ['@startuml', ':Spi_Init();', ':Spi_Transmit();', '@enduml'].join('\n') },
  { name: 'spi_component', kind: 'component', text: '@startuml\ncomponent Spi_Driver\n@enduml' },
  { name: 'can_init_sequence', kind: 'sequence', text: '@startuml\nparticipant Can_Driver\n@enduml' },
];

// 自分のフォルダ。ユースケース図だけがまだ無い (6 枚中 5 枚)。
var MINE = [
  { name: 'spi_init_sequence', kind: 'sequence', text: '@startuml\nparticipant Spi_Driver\nSpi_Driver -> IRQCtrl : Spi_Init()\n@enduml' },
  { name: 'spi_state', kind: 'state', text: '@startuml\n[*] --> Idle\nIdle --> Busy : Spi_Transmit\nBusy --> Idle : TransferComplete\n@enduml' },
  { name: 'spi_class', kind: 'class', text: '@startuml\nclass Driver_Common\nclass Spi_Driver {\n  +Spi_Init()\n  +Spi_Transmit()\n  +Spi_Reset()\n}\nDriver_Common <|-- Spi_Driver\n@enduml' },
  { name: 'spi_activity', kind: 'activity', text: '@startuml\n:SPI_Init();\n:SPI_Transmit();\n@enduml' },
  { name: 'spi_component', kind: 'component', text: '@startuml\ncomponent Spi_Driver\n@enduml' },
];

function rowOf(cd, kind) {
  return cd.rows.filter(function(r) { return r.kind === kind; })[0];
}

describe('part-card — 部品 1 個・6 図種をひとまとまりで見る', function() {

  test('行は常に 6 図種ぶんある', function() {
    var cd = PC.card('spi', MINE, SENIOR);
    expect(cd.rows.length).toBe(6);
  });

  test('進捗は「自分が持っている枚数 / 6」で、母数は常に 6', function() {
    var cd = PC.card('spi', MINE, SENIOR);
    var pr = PC.progress(cd);
    expect(pr.total).toBe(6);
    expect(pr.done).toBe(5);
    expect(pr.text).toBe('6 図種中 5 枚');
  });

  test('まだ無い図種が名前で出る (ユースケース図)', function() {
    var cd = PC.card('spi', MINE, SENIOR);
    var pr = PC.progress(cd);
    expect(pr.missing.join('')).toContain('ユースケース');
  });

  test('先輩と同じ名前が並んでいる図種は一致になる', function() {
    var cd = PC.card('spi', MINE, SENIOR);
    expect(rowOf(cd, 'state').verdict).toBe('agree');
    expect(rowOf(cd, 'sequence').verdict).toBe('agree');
  });

  test('綴りだけが違う図種は differ ではなく variant', function() {
    var cd = PC.card('spi', MINE, SENIOR);
    var r = rowOf(cd, 'activity');
    expect(r.verdict).toBe('variant');
    expect(r.missing.length).toBe(0);
    expect(r.variant.length).toBeGreaterThan(0);
  });

  test('相乗り図が手本でも、他部品の名前 (Can_Init) は自分に無いに数えない', function() {
    var cd = PC.card('spi', MINE, SENIOR);
    var r = rowOf(cd, 'class');
    var names = r.missing.map(function(m) { return m.name; }).join(' ');
    expect(names).not.toContain('Can_Init');
    expect(names).not.toContain('Can_Driver');
  });

  test('コンポーネント図も宣言語の形で照合できる (判定できないのままにしない)', function() {
    var cd = PC.card('spi', MINE, SENIOR);
    var r = rowOf(cd, 'component');
    expect(r.verdict).toBe('agree');
    expect(r.checked).toBeGreaterThan(0);
  });

  test('自分にその図種が無い行は判定しない (合っている側に寄せない)', function() {
    var cd = PC.card('spi', MINE, SENIOR);
    var r = rowOf(cd, 'usecase');
    expect(r.has).toBe(false);
    expect(r.verdict).toBe('n/a');
  });

  test('先輩に無い名前が自分にあるだけでは合っていない扱いにしない', function() {
    var mine = MINE.concat([]);
    mine[1] = { name: 'spi_state', kind: 'state', text: '@startuml\n[*] --> Idle\nIdle --> Busy : Spi_Transmit\nBusy --> Idle : TransferComplete\nBusy --> Fault : Spi_Abort\n@enduml' };
    var cd = PC.card('spi', mine, SENIOR);
    expect(rowOf(cd, 'state').verdict).toBe('agree');
  });

  test('先輩の名前が自分に無ければ differ になり、名前が挙がる', function() {
    var mine = MINE.concat([]);
    mine[1] = { name: 'spi_state', kind: 'state', text: '@startuml\n[*] --> Idle\n@enduml' };
    var cd = PC.card('spi', mine, SENIOR);
    var r = rowOf(cd, 'state');
    expect(r.verdict).toBe('differ');
    expect(r.missing.map(function(m) { return m.name; })).toContain('Busy');
  });

  test('gaps は differ を先に、綴りだけの違いを後に出す', function() {
    var mine = MINE.concat([]);
    mine[1] = { name: 'spi_state', kind: 'state', text: '@startuml\n[*] --> Idle\n@enduml' };
    var g = PC.gaps(PC.card('spi', mine, SENIOR));
    expect(g.length).toBe(2);
    expect(g[0].verdict).toBe('differ');
    expect(g[1].verdict).toBe('variant');
  });

  test('見出しは部品名・進捗・要直しの図種を 1 行で言う', function() {
    var h = PC.headline(PC.card('spi', MINE, SENIOR));
    expect(h).toContain('SPI');
    expect(h).toContain('6 図種中 5 枚');
    expect(h).toContain('ユースケース');
    expect(h).toContain('要直し');
  });

  test('6 枚揃って全部一致したときだけ done', function() {
    expect(PC.done(PC.card('spi', MINE, SENIOR))).toBe(false);
    var mine = MINE.concat([
      { name: 'spi_usecase', kind: 'usecase', text: '@startuml\nusecase Spi_Init\n@enduml' },
    ]);
    // 活動図の綴りを先輩に合わせる。
    mine[3] = { name: 'spi_activity', kind: 'activity', text: '@startuml\n:Spi_Init();\n:Spi_Transmit();\n@enduml' };
    var cd = PC.card('spi', mine, SENIOR);
    expect(PC.progress(cd).done).toBe(6);
    expect(PC.gaps(cd).length).toBe(0);
    expect(PC.done(cd)).toBe(true);
    expect(PC.headline(cd)).toContain('先輩と一致');
  });

  test('行の説明は理由を文字でも言う', function() {
    var cd = PC.card('spi', MINE, SENIOR);
    expect(PC.rowLine(rowOf(cd, 'usecase'))).toContain('まだ無い');
    expect(PC.rowLine(rowOf(cd, 'activity'))).toContain('綴りだけ違う');
    expect(PC.rowLine(rowOf(cd, 'state'))).toContain('一致');
  });

  test('部品を選んでいなければ見出しは空', function() {
    expect(PC.headline(PC.card('', MINE, SENIOR))).toBe('');
  });

  test('一致の見出し語は verdict ごとに決まる', function() {
    expect(PC.verdictLabel('agree')).toBe('先輩と一致');
    expect(PC.verdictLabel('differ')).toBe('先輩に合っていない');
    expect(PC.verdictLabel('variant')).toBe('綴りだけ違う');
    expect(PC.verdictLabel('n/a')).toBe('判定できない');
  });
});

// 走らせ終えたら元の window に戻す (後続の test が runner の window を見ている)。
global.window = prevWindow;
global.document = prevDocument;
