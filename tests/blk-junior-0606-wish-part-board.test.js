'use strict';
// BLK-junior-20260915-0606-wish: 1 部品 (SPI) の 6 図種を、先輩と自分の 2 列で
// 1 画面に並べる「部品ビュー」。ここで固定するのは:
//   - 行は常に 6 図種 (無い図種も「自分に無い / 手本なし」として残る)
//   - 部品ごとの図が無い図種では、相乗り図 (driver_common_class) を本文で拾う
//   - 先輩の欄から名前が役割つきで拾え、メソッド名が先に来る (控え書きを消す)
//   - 名前を押した差し込みは綴りだけを入れる (装飾を足さない)
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
  '../src/core/part-vocab.js',
  '../src/core/part-board.js',
].forEach(function(m) {
  try { delete require.cache[require.resolve(m)]; } catch (e) {}
  try { require(m); } catch (e) { /* 依存の順で読めないものは part-board が自分で外す */ }
});
var PB = global.window.MA.partBoard;

// 先輩 (primary) のフォルダ。SPI は「部品ごとの図」がシーケンス・状態遷移・
// アクティビティの 3 枚しかなく、クラスは 8 部品相乗りの 1 枚に入っている。
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
  { name: 'can_init_sequence', kind: 'sequence', text: '@startuml\nparticipant Can_Driver\n@enduml' },
];

// 自分 (junior) のフォルダ。活動図はこれから打ち直す 1 枚で、コンポーネント図とユースケース図はまだ無い。
var MINE = [
  { name: 'spi_init_sequence', kind: 'sequence', text: '@startuml\nparticipant SPI_Driver\n@enduml' },
  { name: 'spi_state', kind: 'state', text: '@startuml\n[*] --> Idle\n@enduml' },
  { name: 'spi_class', kind: 'class', text: '@startuml\nclass Spi_Driver\n@enduml' },
  { name: 'spi_activity', kind: 'activity', text: '@startuml\n:SPI_Init();\n@enduml' },
];

describe('part-board — 部品 1 つの 6 図種を 2 列で並べる', function() {
  test('選べる部品に SPI が出る', function() {
    expect(PB.parts(MINE, SENIOR)).toContain('spi');
  });

  test('行は常に 6 図種ぶんある', function() {
    var bd = PB.board('spi', MINE, SENIOR);
    expect(bd.rows.length).toBe(6);
    expect(bd.rows.map(function(r) { return r.kind; }).sort())
      .toEqual(['activity', 'class', 'component', 'sequence', 'state', 'usecase']);
  });

  test('部品ごとの図はそのまま、無い図種は相乗り図を本文で拾う', function() {
    var bd = PB.board('spi', MINE, SENIOR);
    function row(k) { return bd.rows.filter(function(r) { return r.kind === k; })[0]; }
    expect(row('activity').ref.name).toBe('spi_activity');
    expect(row('activity').ref.shared).toBe(false);
    // クラス図は spi_class が先輩側に無いので、相乗りの driver_common_class を手本にする
    expect(row('class').ref.name).toBe('driver_common_class');
    expect(row('class').ref.shared).toBe(true);
    expect(row('class').mine.name).toBe('spi_class');
    // 他部品の図 (can_init_sequence) は混ざらない
    expect(row('sequence').ref.name).toBe('spi_init_sequence');
  });

  test('どちらかが欠けている図種は、その旨が行に出る', function() {
    var bd = PB.board('spi', MINE, SENIOR);
    function row(k) { return bd.rows.filter(function(r) { return r.kind === k; })[0]; }
    expect(row('component').state).toBe('none');
    expect(PB.rowLabel(row('component'))).toContain('どちらにも無い');
    var c = PB.counts(bd);
    expect(c.pair).toBe(4);
    expect(c.none).toBe(2);
    expect(PB.summary(bd)).toContain('SPI: 6 図種のうち 手本と対 4');
  });

  test('先輩に図があって自分に無い図種は mine-missing', function() {
    var mine = MINE.filter(function(e) { return e.kind !== 'activity'; });
    var bd = PB.board('spi', mine, SENIOR);
    var r = bd.rows.filter(function(x) { return x.kind === 'activity'; })[0];
    expect(r.state).toBe('mine-missing');
    expect(PB.rowLabel(r)).toContain('自分にまだ無い');
  });

  test('先輩のクラス図の欄からメソッド名が役割つきで拾え、メソッドが先に来る', function() {
    var got = PB.names(SENIOR_CLASS, 'class');
    var methods = got.filter(function(n) { return n.role === 'method'; }).map(function(n) { return n.name; });
    expect(methods).toContain('Spi_Init');
    expect(methods).toContain('Spi_Transmit');
    expect(methods).toContain('Spi_Reset');
    expect(got[0].role).toBe('method');
    // 同じ綴りは 1 回だけ
    var names = got.map(function(n) { return n.role + ':' + n.name; });
    expect(names.length).toBe(new Set(names).size);
  });

  test('名前を押した差し込みは綴りだけを入れる', function() {
    var r = PB.insertName(':;', 1, 1, 'Spi_Init');
    expect(r.text).toBe(':Spi_Init;');
    expect(r.caret).toBe(9);
    // 選択範囲は置き換える (打ち間違えた名前をなぞって押す)
    var r2 = PB.insertName(':SPI_Init();', 1, 9, 'Spi_Init');
    expect(r2.text).toBe(':Spi_Init();');
    // 位置を渡さなければ末尾に足す
    expect(PB.insertName('abc', null, null, 'X').text).toBe('abcX');
  });
});

// 走らせ終えたら元の window に戻す (後続の test が runner の window を見ている)。
global.window = prevWindow;
global.document = prevDocument;
