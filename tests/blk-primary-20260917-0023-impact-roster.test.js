'use strict';
// BLK-primary-20260917-0023: 置換の影響範囲は「何枚が変わるか」だけでなく
// 「残りは触らなくてよい」と言い切れてはじめて確認が終わる。impact() が
// 当たらなかった図も仕分けて返し、行のどこが当たっているかを位置で示す。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/bulk-rename.js')]; } catch (e) {}
require('../src/core/bulk-rename.js');
var br = global.window.MA.bulkRename;

function docs() {
  return [
    { id: 'd1', name: 'spi_init_sequence', dsl: '@startuml\nparticipant SpiDrv\nSpiDrv -> Mcu : init\n@enduml' },
    { id: 'd2', name: 'diagram1', dsl: '@startuml\nA -> B : x\n@enduml' },
    { id: 'd3', name: 'spi_state', dsl: '@startuml\nstate SpiDrv\n@enduml' },
    { id: '', name: 'driver_common_class', unopened: true, dsl: '@startuml\nclass SpiDrv\n@enduml' },
  ];
}

describe('impact の仕分け (変更あり / 変更なし)', function() {
  test('当たらなかった図も none に並び、走査した枚数が出る', function() {
    var res = br.impact(docs(), 'SpiDrv', 'Spi_Driver');
    expect(res.docs).toBe(3);
    expect(res.scanned).toBe(4);
    expect(res.none.map(function(d) { return d.name; })).toEqual(['diagram1']);
  });

  test('未オープンの図も変更なし側で未オープンと分かる', function() {
    var list = docs();
    list.push({ id: '', name: 'clock_seq', unopened: true, dsl: '@startuml\nA -> B\n@enduml' });
    var res = br.impact(list, 'SpiDrv', 'Spi_Driver');
    var none = res.none.filter(function(d) { return d.name === 'clock_seq'; })[0];
    expect(none.name).toBe('clock_seq');
    expect(none.unopened).toBe(true);
  });

  test('1 枚も当たらなければ none が全枚数になる', function() {
    var res = br.impact(docs(), 'NoSuchName', 'X');
    expect(res.docs).toBe(0);
    expect(res.none.length).toBe(4);
    expect(br.rosterText(res)).toBe('4 枚中 0 枚に変更あり / 4 枚は変更なし');
  });

  test('rosterText が「何枚中何枚」を 1 行で言う', function() {
    expect(br.rosterText(br.impact(docs(), 'SpiDrv', 'Spi_Driver')))
      .toBe('4 枚中 3 枚に変更あり / 1 枚は変更なし');
  });
});

describe('hitRanges (当たった位置)', function() {
  test('識別子境界の出現だけを位置で返す', function() {
    var line = 'SpiDrv -> SpiDrvTest : SpiDrv';
    var rs = br.hitRanges(line, 'SpiDrv');
    expect(rs.length).toBe(2);
    expect(line.slice(rs[0].start, rs[0].end)).toBe('SpiDrv');
    expect(rs[0].start).toBe(0);
    expect(rs[1].start).toBe(23);
  });

  test('出現が無ければ空、空の needle でも落ちない', function() {
    expect(br.hitRanges('A -> B', 'SpiDrv')).toEqual([]);
    expect(br.hitRanges('A -> B', '')).toEqual([]);
    expect(br.hitRanges(null, 'A')).toEqual([]);
  });
});
