'use strict';
// BLK-primary-20260917-0523-wish — 部品名 / メソッド名から「使っている図の一覧」を引く。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/bulk-rename.js')]; } catch (e) {}
require('../src/core/bulk-rename.js');
try { delete require.cache[require.resolve('../src/core/name-search.js')]; } catch (e) {}
require('../src/core/name-search.js');
var ns = global.window.MA.nameSearch;

// 仕様変更「SPI 初期化にクロック確認手順を追加する」の影響範囲を洗う場面の材料。
var SPI_INIT = ['@startuml', 'title SPI 初期化', 'participant Spi_Driver',
                'participant ClockCtrl', 'Spi_Driver -> ClockCtrl : EnableClock()',
                'ClockCtrl --> Spi_Driver : ok', '@enduml'].join('\n');
var CAN_INIT = ['@startuml', 'title CAN 初期化', 'participant Can_Driver',
                'participant ClockCtrl', 'Can_Driver -> ClockCtrl : EnableClock()',
                '@enduml'].join('\n');
var ADC_INIT = ['@startuml', 'title ADC 初期化', 'participant Adc_Driver',
                'participant Hal', 'Adc_Driver -> Hal : init()', '@enduml'].join('\n');
var CLASS = ['@startuml', 'class ClockCtrl {', '  +EnableClock() : void',
             '}', 'class Spi_Driver', '@enduml'].join('\n');
var SPI_STATE = ['@startuml', '[*] --> Idle', 'Idle --> Ready : ClockCtrl.EnableClock',
                 '@enduml'].join('\n');
// 同じ綴りを含むだけの別名。識別子単位で数えることの確認用。
var OTHER = ['@startuml', 'participant EnableClockGuard',
             'EnableClockGuard -> Hal : run()', '@enduml'].join('\n');

function rows() {
  return [
    { id: 'd1', name: 'spi_init_sequence', dsl: SPI_INIT, open: true, role: 'data' },
    { id: 'file:can_init_sequence', name: 'can_init_sequence', dsl: CAN_INIT, open: false, role: 'data' },
    { id: 'file:adc_init_sequence', name: 'adc_init_sequence', dsl: ADC_INIT, open: false, role: 'data' },
    { id: 'file:driver_common_class', name: 'driver_common_class', dsl: CLASS, open: false, role: 'data' },
    { id: 'file:spi_state', name: 'spi_state', dsl: SPI_STATE, open: false, role: 'data' },
    { id: 'file:guard', name: 'guard', dsl: OTHER, open: false, role: 'data' },
  ];
}

function names(res) { return res.hits.map(function(h) { return h.name; }); }

describe('nameSearch.search — メソッド名から影響図を引く', function() {
  test('修飾なしのメソッド名は、呼び出し・宣言・遷移ラベルのどれにも当たる', function() {
    var res = ns.search(rows(), 'EnableClock');
    expect(res.files).toBe(6);
    expect(names(res).sort()).toEqual(
      ['can_init_sequence', 'driver_common_class', 'spi_init_sequence', 'spi_state'].sort());
    expect(res.hitDocs).toBe(4);
    expect(res.missDocs).toBe(2);
  });

  test('綴りを含むだけの別名 (EnableClockGuard) は当たらない', function() {
    expect(names(ns.search(rows(), 'EnableClock'))).not.toContain('guard');
  });

  test('修飾付きで打つと、その書き方の行だけに当たる', function() {
    var res = ns.search(rows(), 'ClockCtrl.EnableClock');
    expect(names(res)).toEqual(['spi_state']);
    expect(res.hits[0].at[0].line).toBe(3);
  });

  test('末尾の () は打っても打たなくても同じ結果になる', function() {
    expect(names(ns.search(rows(), 'EnableClock()'))).toEqual(names(ns.search(rows(), 'EnableClock')));
  });

  test('部品名でも同じように引ける', function() {
    var res = ns.search(rows(), 'ClockCtrl');
    expect(names(res).sort()).toEqual(
      ['can_init_sequence', 'driver_common_class', 'spi_init_sequence', 'spi_state'].sort());
  });

  test('宣言のある図が先頭に来る (影響範囲の起点)', function() {
    var res = ns.search(rows(), 'ClockCtrl');
    expect(res.hits[0].declared).toBe(true);
    expect(res.declDocs).toBeGreaterThan(0);
  });

  test('開いていない図の枚数が出る (開き直す手順の枚数)', function() {
    var res = ns.search(rows(), 'EnableClock');
    expect(res.openHitDocs).toBe(1);
    expect(res.unopenedHitDocs).toBe(3);
  });

  test('出現行は行番号・本文・役どころを持つ', function() {
    var res = ns.search(rows(), 'EnableClock');
    var spi = res.hits.filter(function(h) { return h.name === 'spi_init_sequence'; })[0];
    expect(spi.at.length).toBe(1);
    expect(spi.at[0].line).toBe(5);
    expect(spi.at[0].text).toBe('Spi_Driver -> ClockCtrl : EnableClock()');
    expect(spi.at[0].role).toBe('call');
    var cls = res.hits.filter(function(h) { return h.name === 'driver_common_class'; })[0];
    expect(cls.at[0].role).toBe('ref');
  });

  test('図の種別が本文から決まる', function() {
    var res = ns.search(rows(), 'ClockCtrl');
    var byName = {};
    res.hits.forEach(function(h) { byName[h.name] = h; });
    expect(byName.spi_init_sequence.kind).toBe('sequence');
    expect(byName.spi_state.kind).toBe('state');
    expect(byName.driver_common_class.kind).toBe('class');
  });

  test('コメント行は数えない', function() {
    var r = [{ id: 'x', name: 'x', dsl: '@startuml\n\' EnableClock は後で足す\n@enduml' }];
    expect(ns.search(r, 'EnableClock').hitDocs).toBe(0);
  });

  test('空の語・壊れた入力で落ちない', function() {
    expect(ns.search(rows(), '').hitDocs).toBe(0);
    expect(ns.search(null, 'EnableClock').hits).toEqual([]);
    expect(ns.search([null, { name: 'a' }], 'EnableClock').hits).toEqual([]);
  });
});

describe('nameSearch.summaryText', function() {
  test('押す前に「開いていない図が何枚か」まで読める', function() {
    var t = ns.summaryText(ns.search(rows(), 'EnableClock'));
    expect(t).toContain('6 枚中 4 枚');
    expect(t).toContain('開いていない図 3 枚');
  });

  test('1 枚も無いときはそう言い切る', function() {
    expect(ns.summaryText(ns.search(rows(), 'NoSuchName'))).toContain('どれにも出てきません');
  });

  test('語が空なら使い方を出す', function() {
    expect(ns.summaryText(ns.search(rows(), ''))).toContain('名前を入れると');
  });
});

describe('nameSearch.index / suggest — 打つ前に引けるものが見える', function() {
  test('宣言された部品名とメソッド名が索引に載る', function() {
    var idx = ns.index(rows());
    var byName = {};
    idx.forEach(function(e) { byName[e.name] = e; });
    expect(byName.ClockCtrl.kind).toBe('part');
    expect(byName.Spi_Driver.kind).toBe('part');
    expect(byName.EnableClock.kind).toBe('method');
    expect(byName['ClockCtrl.EnableClock'].kind).toBe('method');
  });

  test('横断している名前ほど上に来る', function() {
    var idx = ns.index(rows());
    expect(idx[0].docs.length >= idx[idx.length - 1].docs.length).toBe(true);
    var byName = {};
    idx.forEach(function(e) { byName[e.name] = e; });
    // 索引が数えるのは「その名前が現れた図」。spi_state は遷移ラベルの
    // `ClockCtrl.EnableClock` としてしか出ないので、そちらの語の側に載る
    // (索引は打つ語を思い出すためのもので、影響範囲の枚数は search が答える)。
    expect(byName.ClockCtrl.docs.length).toBe(3);
    expect(byName['ClockCtrl.EnableClock'].docs).toEqual(['spi_state']);
    expect(ns.search(rows(), 'ClockCtrl').hitDocs).toBe(4);
  });

  test('前方一致が部分一致より先に出る', function() {
    var idx = ns.index(rows());
    var s = ns.suggest(idx, 'Enable');
    expect(s.length).toBeGreaterThan(0);
    expect(s[0].name.indexOf('Enable')).toBe(0);
  });

  test('語が空なら索引の先頭を返す', function() {
    var idx = ns.index(rows());
    expect(ns.suggest(idx, '', 3).length).toBe(3);
  });

  test('壊れた入力で落ちない', function() {
    expect(ns.index(null)).toEqual([]);
    expect(ns.suggest(null, 'x')).toEqual([]);
  });
});
