'use strict';
// BLK-primary-20260909-0103-wish: 一括置換の影響は「文字列としてのヒット数」しか
// 出さず、その名前が「どの図の何 (状態遷移のイベント名 / クラスのメソッド宣言 /
// シーケンスのメッセージ)」に効くかは種類別に出ない。出現 1 個ずつを意味で
// 呼び分け、役割ごとに参照元の図を並べられることを守る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/dsl-utils.js', '../src/core/impact-scan.js', '../src/core/semantic-refs.js']
  .forEach(function(m) {
    try { delete require.cache[require.resolve(m)]; } catch (e) {}
    require(m);
  });

const SR = global.window.MA.semanticRefs;

const STATE = '@startuml\nstate Idle\nstate Busy\n[*] --> Idle\nIdle --> Busy : Spi_Init\nBusy --> Idle : done\n@enduml';
const CLASS = '@startuml\nclass SpiDrv {\n  +Spi_Init() : void\n  +count : int\n}\nDriverBase <|-- SpiDrv\n@enduml';
const SEQ = '@startuml\nparticipant App\nparticipant SpiDrv\nApp -> SpiDrv : Spi_Init\n@enduml';

const DOCS = [
  { id: 's', name: 'spi_state.puml', dsl: STATE },
  { id: 'c', name: 'driver_common_class.puml', dsl: CLASS },
  { id: 'q', name: 'spi_init_sequence.puml', dsl: SEQ },
];

function roleOf(res, role) {
  return res.roles.filter(function(g) { return g.role === role; })[0];
}

describe('意味的な参照 (BLK-primary-20260909-0103-wish)', function() {
  test('状態遷移のイベント名は、状態そのものと別の役割になる', function() {
    const res = SR.collect([DOCS[0]], 'Spi_Init');
    expect(res.total).toBe(1);
    expect(roleOf(res, 'event').count).toBe(1);
    expect(roleOf(res, 'stateNode')).toBe(undefined);

    const idle = SR.collect([DOCS[0]], 'Idle');
    expect(roleOf(idle, 'stateNode').count).toBe(3);   // [*] --> Idle / Idle --> Busy / Busy --> Idle
    expect(roleOf(idle, 'decl').count).toBe(1);
    expect(roleOf(idle, 'event')).toBe(undefined);
  });

  test('クラス本体のメソッド宣言と属性宣言を、宣言・端点と呼び分ける', function() {
    const res = SR.collect([DOCS[1]], 'Spi_Init');
    expect(roleOf(res, 'method').count).toBe(1);

    const drv = SR.collect([DOCS[1]], 'SpiDrv');
    expect(roleOf(drv, 'decl').count).toBe(1);
    expect(roleOf(drv, 'inherit').count).toBe(1);

    const cnt = SR.collect([DOCS[1]], 'count');
    expect(roleOf(cnt, 'field').count).toBe(1);
  });

  test('シーケンスのメッセージ名と呼び出しの相手を分ける', function() {
    const res = SR.collect([DOCS[2]], 'Spi_Init');
    expect(roleOf(res, 'message').count).toBe(1);
    const drv = SR.collect([DOCS[2]], 'SpiDrv');
    expect(roleOf(drv, 'participantRef').count).toBe(1);
    expect(roleOf(drv, 'decl').count).toBe(1);
  });

  test('「どの図の何から参照されているか」を 1 文で言う', function() {
    const res = SR.collect(DOCS, 'Spi_Init');
    expect(res.docs).toBe(3);
    expect(res.sentence).toContain('spi_state.puml の遷移イベント');
    expect(res.sentence).toContain('driver_common_class.puml のメソッド宣言');
    expect(res.sentence).toContain('spi_init_sequence.puml のメッセージ名');
  });

  test('出現が無ければ黙らず「参照している図はありません」と言う', function() {
    const res = SR.collect(DOCS, 'CanDrv');
    expect(res.total).toBe(0);
    expect(res.roles).toEqual([]);
    expect(res.sentence).toContain('参照している図はありません');
  });

  test('役割の合計はヒット数 (識別子境界の出現数) と一致する', function() {
    const is = global.window.MA.impactScan;
    const res = SR.collect(DOCS, 'SpiDrv');
    const hits = DOCS.reduce(function(n, d) { return n + is.scanDoc(d.dsl, 'SpiDrv').total; }, 0);
    expect(res.total).toBe(hits);
  });

  test('題やノートだけの図は「置換後に開いて確かめる図」に挙げない', function() {
    const docs = DOCS.concat([
      { id: 't', name: 'memo.puml', dsl: '@startuml\ntitle Spi_Init の覚書\nnote left : Spi_Init はここでは使わない\n@enduml' },
    ]);
    const res = SR.collect(docs, 'Spi_Init');
    expect(roleOf(res, 'title').count).toBe(1);
    expect(roleOf(res, 'note').count).toBe(1);
    const check = SR.docsToCheck(res).map(function(c) { return c.docName; });
    // 並びは役割の重い順 (メソッド宣言 → 遷移イベント → メッセージ名)。
    expect(check).toEqual(['driver_common_class.puml', 'spi_state.puml', 'spi_init_sequence.puml']);
  });
});
