'use strict';
// BLK-primary-20260908-2003-wish: 部品名を 1 つ選ぶと参照元・参照先の図が
// 矢印付きで一望できること。テキストの羅列では見えなかった「どの図がどの図を
// 参照して連鎖しているか」を、開かずに数えられる状態で固定する。

var W = (typeof window !== 'undefined' && window) || global.window;
var DG = W.MA.depGraph;

function uml(lines) { return ['@startuml'].concat(lines, ['@enduml']).join('\n'); }

// コンポーネント図: Spi_Driver が DmaCtrl と Power_Ctrl を使う。
var COMP = uml([
  'component Spi_Driver',
  'component DmaCtrl',
  'component Power_Ctrl',
  'Spi_Driver ..> DmaCtrl : 転送',
  'Spi_Driver ..> Power_Ctrl : 電源',
]);

// シーケンス図: App が Spi_Driver を呼ぶ (Spi_Driver から見れば参照元)。
var SEQ = uml([
  'participant App',
  'participant Spi_Driver',
  'App -> Spi_Driver : Spi_Write()',
  'Spi_Driver -> DmaCtrl : Dma_Start()',
]);

// クラス図: 継承は矢印が左を向くので from/to が入れ替わる。
var CLS = uml([
  'class DmaCtrl',
  'class DmaCtrl_Base',
  'DmaCtrl_Base <|-- DmaCtrl',
  "note right of DmaCtrl : 見出し -- ここは関係ではない",
]);

// Spi_Driver も DmaCtrl も出てこない図 (連鎖の外)。
var OTHER = uml([
  'component Adc_Driver',
  'component Adc_Hw',
  'Adc_Driver ..> Adc_Hw',
]);

var DOCS = [
  { id: 1, name: 'spi_component', dsl: COMP },
  { id: 2, name: 'spi_sequence', dsl: SEQ },
  { id: 3, name: 'dma_class', dsl: CLS },
  { id: 4, name: 'adc_component', dsl: OTHER },
];

describe('depGraph.relations', function() {
  test('矢印の向きで from / to が決まる', function() {
    var r = DG.relations(COMP);
    expect(r.length).toBe(2);
    expect(r[0].from).toBe('Spi_Driver');
    expect(r[0].to).toBe('DmaCtrl');
    expect(r[0].label).toBe('転送');
  });

  test('左向きの継承は参照の向きを反転する', function() {
    var r = DG.relations(CLS);
    expect(r.length).toBe(1);
    expect(r[0].from).toBe('DmaCtrl');
    expect(r[0].to).toBe('DmaCtrl_Base');
  });

  test('note / skinparam の中の -- は関係にしない', function() {
    var r = DG.relations(uml(['skinparam x -- y', "' A -> B", 'note left : a -- b']));
    expect(r.length).toBe(0);
  });

  test('[*] は部品ではないので辺にしない', function() {
    var r = DG.relations(uml(['[*] --> Idle', 'Idle --> Busy : start']));
    expect(r.length).toBe(1);
    expect(r[0].from).toBe('Idle');
  });

  test('方向指定・色指定つきの矢印も拾う', function() {
    expect(DG.arrowDir('-left->')).toBe('forward');
    expect(DG.arrowDir('<-[#red]-')).toBe('back');
    expect(DG.arrowDir('--')).toBe('none');
    var r = DG.relations(uml(['A -down-> B']));
    expect(r.length).toBe(1);
    expect(r[0].to).toBe('B');
  });
});

describe('depGraph.build / forName', function() {
  var g = DG.build(DOCS);

  test('同じ名前は図をまたいで 1 ノートになり、出た図を全部持つ', function() {
    expect(g.nodes['Spi_Driver'].docs).toEqual(['spi_component', 'spi_sequence']);
  });

  test('参照先と参照元が向き付きで分かれる', function() {
    var v = DG.forName(g, 'Spi_Driver');
    expect(v.outgoing.map(function(r) { return r.name; })).toEqual(['DmaCtrl', 'Power_Ctrl']);
    expect(v.incoming.map(function(r) { return r.name; })).toEqual(['App']);
  });

  test('参照は図の名前と行番号まで辿れる', function() {
    var v = DG.forName(g, 'Spi_Driver');
    var dma = v.outgoing[0];
    expect(dma.count).toBe(2);
    expect(dma.refs[0].doc).toBe('spi_component');
    expect(dma.refs[0].line).toBeGreaterThan(0);
  });

  test('知らない名前は null', function() {
    expect(DG.forName(g, 'NoSuchName')).toBeNull();
  });

  test('names は参照の多い順', function() {
    var list = DG.names(g);
    expect(list[0].name).toBe('Spi_Driver');
    expect(list[0].docs.length).toBe(2);
  });
});

// 矢印を 1 本も持たない図。名前は宣言されているだけ。
var DECL_ONLY = uml([
  'class Spi_Driver {',
  '  + Init() : void',
  '}',
  'class Can_Driver',
]);

describe('depGraph.declared', function() {
  test('宣言行から部品名を拾う', function() {
    expect(DG.declared(DECL_ONLY)).toEqual(['Spi_Driver', 'Can_Driver']);
  });

  test('関係行やノートは宣言に数えない', function() {
    expect(DG.declared(uml(['A -> B : x', 'note left : class C']))).toEqual([]);
  });

  test('矢印が無い図でも、その名前を持つ図として数える (改名の対象から落とさない)', function() {
    var g = DG.build(DOCS.concat([{ id: 9, name: 'common_class', dsl: DECL_ONLY }]));
    expect(g.nodes['Spi_Driver'].docs).toContain('common_class');
    var rows = DG.impactDocs(g, 'Spi_Driver', 0).map(function(r) { return r.doc; });
    expect(rows).toContain('common_class');
  });

  test('宣言しか無い名前も選べる (参照の本数は 0)', function() {
    var g = DG.build([{ id: 9, name: 'common_class', dsl: DECL_ONLY }]);
    var list = DG.names(g).map(function(n) { return n.name; });
    expect(list).toContain('Can_Driver');
    expect(g.nodes['Can_Driver'].outDeg + g.nodes['Can_Driver'].inDeg).toBe(0);
  });
});

describe('depGraph.impactDocs', function() {
  var g = DG.build(DOCS);

  test('直接出る図は hop 0', function() {
    var rows = DG.impactDocs(g, 'Spi_Driver', 2);
    var zero = rows.filter(function(r) { return r.hop === 0; }).map(function(r) { return r.doc; });
    expect(zero).toEqual(['spi_component', 'spi_sequence']);
  });

  test('隣の名前を経由した図が連鎖として出る', function() {
    var rows = DG.impactDocs(g, 'Spi_Driver', 2);
    var chain = rows.filter(function(r) { return r.doc === 'dma_class'; })[0];
    expect(chain.hop).toBe(1);
    expect(chain.via).toContain('DmaCtrl');
  });

  test('繋がっていない図は出ない (置換の的を広げない)', function() {
    var rows = DG.impactDocs(g, 'Spi_Driver', 2).map(function(r) { return r.doc; });
    expect(rows).not.toContain('adc_component');
  });

  test('hop 0 に絞れば直接の図だけ', function() {
    var rows = DG.impactDocs(g, 'Spi_Driver', 0).map(function(r) { return r.doc; });
    expect(rows).toEqual(['spi_component', 'spi_sequence']);
  });
});

describe('depGraph.summaryText / layout', function() {
  var g = DG.build(DOCS);

  test('見出しに参照先・参照元・連鎖の数が出る', function() {
    var v = DG.forName(g, 'Spi_Driver');
    var t = DG.summaryText(v, DG.impactDocs(g, 'Spi_Driver', 2));
    expect(t).toContain('参照先 2');
    expect(t).toContain('参照元 1');
    expect(t).toContain('連鎖で影響');
  });

  test('選ぶ前は選び方を出す', function() {
    expect(DG.summaryText(null, [])).toContain('部品名を選ぶ');
  });

  test('参照元は中央より左、参照先は右に並ぶ', function() {
    var v = DG.forName(g, 'Spi_Driver');
    var lay = DG.layout(v);
    var center = lay.nodes.filter(function(n) { return n.side === 'center'; })[0];
    lay.nodes.forEach(function(n) {
      if (n.side === 'in') expect(n.x).toBeLessThan(center.x);
      if (n.side === 'out') expect(n.x).toBeGreaterThan(center.x);
    });
    expect(lay.edges.length).toBe(3);
  });

  test('矢印は参照元 → 名前 → 参照先の向きで引かれる', function() {
    var v = DG.forName(g, 'Spi_Driver');
    var lay = DG.layout(v);
    var into = lay.edges.filter(function(e) { return e.to === 'Spi_Driver'; });
    expect(into.length).toBe(1);
    expect(into[0].from).toBe('App');
  });
});
