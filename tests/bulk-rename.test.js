'use strict';
// ランナーは全テストを 1 プロセスで動かす。global.window を差し替えると
// 先に読み込まれたモジュールが載っている window ごと消えるので、既にあれば使う。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/bulk-rename.js')]; } catch (e) {}
require('../src/core/bulk-rename.js');
var br = global.window.MA.bulkRename;

var SEQ = [
  '@startuml',
  'participant SpiDrv',
  'participant Mcu',
  'SpiDrv -> Mcu : Spi_Init()',
  'Mcu --> SpiDrv : ok',
  '@enduml',
].join('\n');

var CLS = [
  '@startuml',
  'class SpiDrv {',
  '  +init()',
  '}',
  'class SpiDrvTest',
  'SpiDrv <|-- SpiDrvTest',
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
    { id: 'd1', name: 'SPI_seq', dsl: SEQ },
    { id: 'd2', name: 'SPI_class', dsl: CLS },
    { id: 'd3', name: 'SPI_state', dsl: STATE },
  ];
}

describe('bulkRename public API', function() {
  test('exports the documented API', function() {
    ['countIn', 'replaceIn', 'isValidTarget', 'preview', 'totalCount', 'apply', 'identifiers']
      .forEach(function(k) { expect(typeof br[k]).toBe('function'); });
  });
});

describe('countIn / replaceIn', function() {
  test('counts identifier occurrences on word boundaries', function() {
    expect(br.countIn(SEQ, 'SpiDrv')).toBe(3);
  });

  test('does not match a longer identifier containing the needle', function() {
    // SpiDrvTest / mySpiDrv は別の部品なので巻き込まない
    expect(br.countIn(CLS, 'SpiDrv')).toBe(2);
    expect(br.countIn('mySpiDrv = 1', 'SpiDrv')).toBe(0);
    expect(br.countIn('SpiDrv_Start', 'SpiDrv')).toBe(0);
  });

  test('replaces only the whole-identifier occurrences', function() {
    var out = br.replaceIn(CLS, 'SpiDrv', 'Spi_Driver');
    expect(out).toContain('class Spi_Driver {');
    expect(out).toContain('class SpiDrvTest');
    expect(out).toContain('Spi_Driver <|-- SpiDrvTest');
  });

  test('returns the text unchanged when there is no hit', function() {
    expect(br.replaceIn(SEQ, 'CanDrv', 'Can_Driver')).toBe(SEQ);
  });

  test('handles empty / null input safely', function() {
    expect(br.countIn(null, 'X')).toBe(0);
    expect(br.countIn(SEQ, '')).toBe(0);
    expect(br.replaceIn(SEQ, '', 'X')).toBe(SEQ);
  });

  test('escapes regex metacharacters in the search term', function() {
    var t = 'class A.B\nA.B --> C';
    expect(br.countIn(t, 'A.B')).toBe(2);
    expect(br.countIn('AxB', 'A.B')).toBe(0);
  });

  test('matches identifiers inside quoted names', function() {
    expect(br.countIn('participant "SpiDrv" as S', 'SpiDrv')).toBe(1);
  });
});

describe('isValidTarget', function() {
  test('accepts identifier-safe names', function() {
    ['Spi_Driver', 'A', 'a1', 'Spi-Drv', 'Spi.Drv'].forEach(function(n) {
      expect(br.isValidTarget(n)).toBe(true);
    });
  });
  test('rejects names that would break the DSL', function() {
    ['', ' ', 'Spi Driver', '-Spi', 'Spi>Drv', null, 3].forEach(function(n) {
      expect(br.isValidTarget(n)).toBe(false);
    });
  });
});

describe('preview / totalCount', function() {
  test('reports per-document hit counts including zeros', function() {
    var rows = br.preview(docs(), 'SpiDrv');
    expect(rows.length).toBe(3);
    expect(rows[0]).toEqual({ id: 'd1', name: 'SPI_seq', count: 3 });
    expect(rows[1].count).toBe(2);
    expect(rows[2].count).toBe(0);
  });

  test('totalCount sums every document', function() {
    expect(br.totalCount(docs(), 'SpiDrv')).toBe(5);
    expect(br.totalCount(docs(), 'Nope')).toBe(0);
  });

  test('tolerates a non-array argument', function() {
    expect(br.preview(null, 'X')).toEqual([]);
    expect(br.totalCount(undefined, 'X')).toBe(0);
  });
});

describe('apply', function() {
  test('rewrites every document that contains the name', function() {
    var res = br.apply(docs(), 'SpiDrv', 'Spi_Driver');
    expect(res.docs).toBe(2);
    expect(res.total).toBe(5);
    expect(res.changed.length).toBe(2);
    expect(res.changed[0].id).toBe('d1');
    expect(res.changed[0].dsl).toContain('participant Spi_Driver');
    expect(res.changed[0].dsl).not.toContain('participant SpiDrv\n');
    expect(res.changed[1].dsl).toContain('class SpiDrvTest');
  });

  test('skips documents without a hit', function() {
    var res = br.apply(docs(), 'SpiDrv', 'Spi_Driver');
    var ids = res.changed.map(function(c) { return c.id; });
    expect(ids).not.toContain('d3');
  });

  test('refuses an invalid or identical target', function() {
    expect(br.apply(docs(), 'SpiDrv', 'Spi Driver').docs).toBe(0);
    expect(br.apply(docs(), 'SpiDrv', '').docs).toBe(0);
    expect(br.apply(docs(), 'SpiDrv', 'SpiDrv').docs).toBe(0);
    expect(br.apply(docs(), '', 'X').docs).toBe(0);
  });

  test('is idempotent — applying twice changes nothing the second time', function() {
    var first = br.apply(docs(), 'SpiDrv', 'Spi_Driver');
    var next = first.changed.map(function(c) { return { id: c.id, name: c.name, dsl: c.dsl }; });
    expect(br.apply(next, 'SpiDrv', 'Spi_Driver').docs).toBe(0);
  });

  test('does not mutate the input documents', function() {
    var input = docs();
    br.apply(input, 'SpiDrv', 'Spi_Driver');
    expect(input[0].dsl).toBe(SEQ);
  });
});

describe('identifiers', function() {
  test('collects declared participants, classes and states', function() {
    var ids = br.identifiers(docs());
    ['SpiDrv', 'Mcu', 'SpiDrvTest', 'Busy', 'Idle'].forEach(function(n) {
      expect(ids).toContain(n);
    });
  });

  test('is sorted and free of duplicates', function() {
    var ids = br.identifiers(docs());
    var sorted = ids.slice().sort();
    expect(ids).toEqual(sorted);
    expect(ids.length).toBe(new Set(ids).size);
  });

  test('does not pick up DSL keywords as部品名', function() {
    var ids = br.identifiers([{ id: 'x', name: 'x', dsl: '@startuml\nalt ok\nA -> B : m\nelse ng\nend\n@enduml' }]);
    expect(ids).not.toContain('alt');
    expect(ids).not.toContain('end');
    expect(ids).toContain('A');
  });

  test('returns [] for empty input', function() {
    expect(br.identifiers([])).toEqual([]);
    expect(br.identifiers(null)).toEqual([]);
  });
});
