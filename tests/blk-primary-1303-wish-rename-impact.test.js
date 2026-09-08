'use strict';
// BLK-primary-20260908-1303-wish: ⇄ 一括置換を適用する前に、ヒットした図の該当行が
// どう変わるかを並べて見る。ヒット件数 (N 件) だけでは想定外の行に当たっていても
// 適用してから気付くので、before/after の行まで組み立てておく。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/bulk-rename.js')]; } catch (e) {}
require('../src/core/bulk-rename.js');

const br = global.window.MA.bulkRename;

const DOCS = [
  { id: 'a', name: 'spi_init.puml', dsl: '@startuml\nparticipant SpiDrv\nApp -> SpiDrv : Init()\n@enduml' },
  { id: 'b', name: 'gpio.puml', dsl: '@startuml\nparticipant GpioDrv\n@enduml' },
  { id: 'c', name: 'spi_state.puml', dsl: '@startuml\nstate SpiDrv\n@enduml', unopened: true },
];

describe('置換の影響を適用前に見る (BLK-primary-20260908-1303-wish)', function() {
  test('当たった図だけを、置換前後の DSL 付きで返す', function() {
    const res = br.impact(DOCS, 'SpiDrv', 'Spi_Driver');
    expect(res.entries.map(function(e) { return e.name; }))
      .toEqual(['spi_init.puml', 'spi_state.puml']);
    expect(res.total).toBe(3);
    expect(res.docs).toBe(2);
    expect(res.entries[0].after).toContain('participant Spi_Driver');
    expect(res.entries[0].after).toContain('App -> Spi_Driver : Init()');
    expect(res.entries[0].before).toContain('participant SpiDrv');
  });

  test('未オープンの図には印が付き、件数も数える', function() {
    const res = br.impact(DOCS, 'SpiDrv', 'Spi_Driver');
    expect(res.unopened).toBe(1);
    expect(res.entries[1].unopened).toBe(true);
    expect(res.entries[0].unopened).toBe(false);
  });

  test('置換後が未入力なら、当たった行だけ見せて変更後は作らない', function() {
    const res = br.impact(DOCS, 'SpiDrv', '');
    expect(res.valid).toBe(false);
    expect(res.docs).toBe(2);
    expect(res.entries[0].after).toBe(res.entries[0].before);
  });

  test('置換後が不正・置換前と同じなら変更後は作らない', function() {
    expect(br.impact(DOCS, 'SpiDrv', 'Spi Driver').valid).toBe(false);
    expect(br.impact(DOCS, 'SpiDrv', 'SpiDrv').valid).toBe(false);
  });

  test('識別子単位で当たる。SpiDrvTest は巻き込まない', function() {
    const res = br.impact([{ id: 'x', name: 'x', dsl: 'SpiDrvTest -> SpiDrv : go' }], 'SpiDrv', 'S2');
    expect(res.total).toBe(1);
    expect(res.entries[0].after).toBe('SpiDrvTest -> S2 : go');
  });

  test('見出しは適用ボタンと同じ数え方で出す', function() {
    const res = br.impact(DOCS, 'SpiDrv', 'Spi_Driver');
    expect(br.impactText(res, 'SpiDrv', 'Spi_Driver'))
      .toBe('3 件 / 2 枚 (うち未オープン 1 枚) を「SpiDrv」→「Spi_Driver」に置換します');
    const none = br.impact(DOCS, 'Nope', 'X');
    expect(br.impactText(none, 'Nope', 'X')).toBe('「Nope」は見つかりません');
    const pending = br.impact(DOCS, 'GpioDrv', '');
    expect(br.impactText(pending, 'GpioDrv', ''))
      .toBe('1 件 / 1 枚 に当たっています (置換後の名前を入れると変更後が出ます)');
  });

  test('docs が配列でなくても落ちない', function() {
    expect(br.impact(null, 'A', 'B').docs).toBe(0);
  });
});
