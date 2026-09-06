'use strict';
// ランナーは全テストを 1 プロセスで動かす。global.window を差し替えると
// 先に読み込まれたモジュールが載っている window ごと消えるので、既にあれば使う。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/name-audit.js')]; } catch (e) {}
require('../src/core/name-audit.js');
var na = global.window.MA.nameAudit;

var SPI_SEQ = [
  '@startuml',
  'participant SpiDrv',
  'participant IRQCtrl',
  'SpiDrv -> IRQCtrl : Spi_Init()',
  'IRQCtrl --> SpiDrv : ok',
  '@enduml',
].join('\n');

var CAN_SEQ = [
  '@startuml',
  'participant CanDrv',
  'participant IrqCtrl',
  'CanDrv -> IrqCtrl : Can_Init()',
  '@enduml',
].join('\n');

var CLS = [
  '@startuml',
  'class SpiDrv {',
  '  +init()',
  '}',
  'class CanDrv',
  'SpiDrv <|-- CanDrv',
  'CanDrv --> DmaCtrl : uses',
  '@enduml',
].join('\n');

var STATE = [
  '@startuml',
  '[*] --> Idle',
  'state Busy',
  'Idle --> Busy : SpiDrv_Start',
  '@enduml',
].join('\n');

function docs() {
  return [
    { id: 'd1', name: 'spi-seq', dsl: SPI_SEQ },
    { id: 'd2', name: 'can-seq', dsl: CAN_SEQ },
    { id: 'd3', name: 'common-class', dsl: CLS },
  ];
}

function names(rows) {
  return rows.map(function(r) { return r.name; });
}

function find(rows, name) {
  return rows.filter(function(r) { return r.name === name; })[0] || null;
}

describe('nameAudit.normalizeKey', () => {
  test('大小の違いを吸収する', () => {
    expect(na.normalizeKey('IRQCtrl')).toBe(na.normalizeKey('IrqCtrl'));
  });

  test('区切り記号を落とす', () => {
    expect(na.normalizeKey('Irq_Ctrl')).toBe('irqctrl');
    expect(na.normalizeKey('Irq-Ctrl')).toBe('irqctrl');
    expect(na.normalizeKey('Irq.Ctrl')).toBe('irqctrl');
  });

  test('別部品は別キーになる', () => {
    expect(na.normalizeKey('SpiDrv')).not.toBe(na.normalizeKey('CanDrv'));
  });

  test('null や undefined は空文字', () => {
    expect(na.normalizeKey(null)).toBe('');
    expect(na.normalizeKey(undefined)).toBe('');
  });
});

describe('nameAudit.collect', () => {
  test('宣言された部品名を集める', () => {
    var rows = na.collect(docs());
    expect(names(rows)).toContain('SpiDrv');
    expect(names(rows)).toContain('CanDrv');
    expect(names(rows)).toContain('IRQCtrl');
    expect(names(rows)).toContain('IrqCtrl');
  });

  test('名前は昇順で並ぶ', () => {
    var ns = names(na.collect(docs()));
    var sorted = ns.slice().sort();
    expect(ns).toEqual(sorted);
  });

  test('出現した図の名前を持つ', () => {
    var r = find(na.collect(docs()), 'SpiDrv');
    expect(r.docs).toEqual(['spi-seq', 'common-class']);
  });

  test('同じ図で複数回出ても図名は 1 度だけ', () => {
    var r = find(na.collect(docs()), 'IRQCtrl');
    expect(r.docs).toEqual(['spi-seq']);
    expect(r.refs).toBe(3);
  });

  test('宣言行のある名前は declared', () => {
    expect(find(na.collect(docs()), 'CanDrv').declared).toBe(true);
  });

  test('矢印にだけ出る名前は declared でない', () => {
    expect(find(na.collect(docs()), 'DmaCtrl').declared).toBe(false);
  });

  test('kind に宣言の種類が入る', () => {
    var rows = na.collect(docs());
    expect(find(rows, 'IRQCtrl').kind).toBe('participant');
    expect(find(rows, 'SpiDrv').kind).toBe('participant');
  });

  test('class 宣言は kind=class', () => {
    var rows = na.collect([{ id: 'd', name: 'c', dsl: CLS }]);
    expect(find(rows, 'SpiDrv').kind).toBe('class');
  });

  test('state 宣言を拾う', () => {
    var rows = na.collect([{ id: 'd', name: 's', dsl: STATE }]);
    expect(find(rows, 'Busy').kind).toBe('state');
    expect(find(rows, 'Idle')).not.toBeNull();
  });

  test('制御構文や見出しは名前にしない', () => {
    var dsl = ['@startuml', 'title 概要', 'alt 正常', 'A -> B : x', 'else 異常', 'end', '@enduml'].join('\n');
    var ns = names(na.collect([{ id: 'd', name: 'x', dsl: dsl }]));
    expect(ns).not.toContain('else');
    expect(ns).not.toContain('end');
    expect(ns).not.toContain('alt');
  });

  test('コメント行は無視する', () => {
    var dsl = ['@startuml', "' participant Ghost", 'participant Real', '@enduml'].join('\n');
    var ns = names(na.collect([{ id: 'd', name: 'x', dsl: dsl }]));
    expect(ns).toContain('Real');
    expect(ns).not.toContain('Ghost');
  });

  test('"表示名" as Alias は Alias を識別子にする', () => {
    var dsl = ['@startuml', 'participant "SPI Driver" as SpiDrv', '@enduml'].join('\n');
    var ns = names(na.collect([{ id: 'd', name: 'x', dsl: dsl }]));
    expect(ns).toContain('SpiDrv');
  });

  test('引用名だけの宣言はその名前を使う', () => {
    var dsl = ['@startuml', 'participant "Spi Drv"', '@enduml'].join('\n');
    var ns = names(na.collect([{ id: 'd', name: 'x', dsl: dsl }]));
    expect(ns).toContain('Spi Drv');
  });

  test('空配列でも落ちない', () => {
    expect(na.collect([]).length).toBe(0);
    expect(na.collect(null).length).toBe(0);
  });

  test('dsl が無いドキュメントを飛ばす', () => {
    expect(na.collect([{ id: 'd', name: 'x' }]).length).toBe(0);
  });
});

describe('nameAudit.variants', () => {
  test('IRQCtrl と IrqCtrl を 1 組にまとめる', () => {
    var v = na.variants(docs());
    var g = v.filter(function(x) { return x.key === 'irqctrl'; })[0];
    expect(g).toBeDefined();
    expect(names(g.members).sort()).toEqual(['IRQCtrl', 'IrqCtrl']);
  });

  test('綴りが 1 通りしかない名前は組にしない', () => {
    var v = na.variants(docs());
    expect(v.map(function(g) { return g.key; })).not.toContain('spidrv');
  });

  test('出現の多い綴りを統一先に推す', () => {
    var v = na.variants(docs());
    var g = v.filter(function(x) { return x.key === 'irqctrl'; })[0];
    expect(g.suggested).toBe('IRQCtrl');   // spi-seq に 3 回 / can-seq に 2 回
  });

  test('区切りだけ違う綴りも同じ組になる', () => {
    var d = [
      { id: '1', name: 'a', dsl: '@startuml\nparticipant Irq_Ctrl\n@enduml' },
      { id: '2', name: 'b', dsl: '@startuml\nparticipant IrqCtrl\n@enduml' },
    ];
    expect(na.variants(d).length).toBe(1);
  });

  test('揺れが無ければ空', () => {
    var d = [{ id: '1', name: 'a', dsl: SPI_SEQ }];
    expect(na.variants(d).length).toBe(0);
  });

  test('total は組全体の出現数', () => {
    var v = na.variants(docs());
    var g = v.filter(function(x) { return x.key === 'irqctrl'; })[0];
    expect(g.total).toBe(5);
  });

  test('出現の多い組から並ぶ', () => {
    var d = [
      { id: '1', name: 'a', dsl: '@startuml\nparticipant Aa\nparticipant Bb\nAa -> Bb : x\nAa -> Bb : y\n@enduml' },
      { id: '2', name: 'b', dsl: '@startuml\nparticipant AA\nparticipant BB\n@enduml' },
    ];
    var v = na.variants(d);
    expect(v.length).toBe(2);
    expect(v[0].total).toBeGreaterThan(v[1].total - 1);
  });
});

describe('nameAudit.undeclared', () => {
  test('矢印にだけ出る名前を返す', () => {
    expect(names(na.undeclared(docs()))).toEqual(['DmaCtrl']);
  });

  test('別の図で宣言されていれば挙げない', () => {
    var d = docs();
    d.push({ id: 'd4', name: 'dma-class', dsl: '@startuml\nclass DmaCtrl\n@enduml' });
    expect(names(na.undeclared(d))).toEqual([]);
  });

  test('空配列でも落ちない', () => {
    expect(na.undeclared([])).toEqual([]);
  });
});

describe('nameAudit.matrix', () => {
  test('図の並びを列にする', () => {
    expect(na.matrix(docs()).docs).toEqual(['spi-seq', 'can-seq', 'common-class']);
  });

  test('部品がどの図にあるかを真偽値で並べる', () => {
    var m = na.matrix(docs());
    var row = m.rows.filter(function(r) { return r.name === 'SpiDrv'; })[0];
    expect(row.present).toEqual([true, false, true]);
  });

  test('1 枚にしか無い部品は 1 箇所だけ true', () => {
    var m = na.matrix(docs());
    var row = m.rows.filter(function(r) { return r.name === 'IrqCtrl'; })[0];
    expect(row.present).toEqual([false, true, false]);
  });

  test('行数は名前の数と一致する', () => {
    expect(na.matrix(docs()).rows.length).toBe(na.collect(docs()).length);
  });
});

describe('nameAudit.audit', () => {
  test('揺れ・宣言なし・対照表をまとめて返す', () => {
    var a = na.audit(docs());
    expect(a.variants.length).toBe(1);
    expect(names(a.undeclared)).toEqual(['DmaCtrl']);
    expect(a.matrix.docs.length).toBe(3);
    expect(a.names.length).toBeGreaterThan(3);
  });

  test('問題が無ければ clean', () => {
    var a = na.audit([{ id: '1', name: 'a', dsl: SPI_SEQ }]);
    expect(a.clean).toBe(true);
  });

  test('揺れがあれば clean でない', () => {
    expect(na.audit(docs()).clean).toBe(false);
  });

  test('空でも clean', () => {
    expect(na.audit([]).clean).toBe(true);
  });
});
