'use strict';
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var window = global.window;
try { delete require.cache[require.resolve('../src/core/dsl-visible-diff.js')]; } catch (e) {}
require('../src/core/dsl-visible-diff.js');

var VD = window.MA.dslVisibleDiff;

// BLK-reviewer-20260914-2106: stale の中身を「コメント等ソース変化のみ」と
// 「可視内容の食い違い」に割る。割れないと、1 枚ごとに render API を叩いて
// 文字列 diff を取る使い捨てスクリプトを書くことになる。
var BASE = [
  '@startuml',
  'participant Spi_Driver',
  'participant Mcu',
  'Spi_Driver -> Mcu: init',
  '@enduml',
].join('\n');

// svg に畳まれた DSL は @startuml/@enduml を持たず、行末の空白も落ちている。
var FOLDED = 'participant Spi_Driver\nparticipant Mcu\nSpi_Driver -> Mcu: init';

describe('dslVisibleDiff.compare — 描かれない行の差は same', function() {
  test('コメント行が増えただけなら same (見かけ上の stale)', function() {
    var now = BASE.replace('participant Spi_Driver',
      "'domain-verdict: ok\nparticipant Spi_Driver");
    var r = VD.compare(FOLDED, now);
    expect(r.verdict).toBe('same');
    expect(VD.verdictText(r.verdict)).toContain('コメント等ソース変化のみ');
  });

  test('ブロックコメント /\' … \'/ が増えただけでも same', function() {
    var now = BASE.replace('@enduml', "/' 見直し待ち\n   2 行目 '/\n@enduml");
    expect(VD.compare(FOLDED, now).verdict).toBe('same');
  });

  test('空行・行末の空白・@startuml の有無では差と言わない', function() {
    var now = '@startuml   \n\nparticipant Spi_Driver  \nparticipant Mcu\n\n'
      + 'Spi_Driver -> Mcu: init\n@enduml';
    expect(VD.compare(FOLDED, now).verdict).toBe('same');
  });
});

describe('dslVisibleDiff.compare — 描かれる行が違えば differ', function() {
  test('participant 名が変わったら、消えた行と増えた行を名指しする', function() {
    var now = BASE.replace('participant Spi_Driver', 'participant Spi_Drv');
    var r = VD.compare(FOLDED, now);
    expect(r.verdict).toBe('differ');
    expect(r.removed).toEqual(['participant Spi_Driver']);
    expect(r.added).toEqual(['participant Spi_Drv']);
  });

  test('skinparam は絵に出るので、増えたら differ (コメント扱いしない)', function() {
    var now = BASE.replace('@enduml', 'skinparam backgroundColor #eee\n@enduml');
    expect(VD.compare(FOLDED, now).verdict).toBe('differ');
  });

  test('矢印が 1 本増えたら differ', function() {
    var now = BASE.replace('@enduml', 'Mcu -> Spi_Driver: done\n@enduml');
    var r = VD.compare(FOLDED, now);
    expect(r.verdict).toBe('differ');
    expect(r.added).toEqual(['Mcu -> Spi_Driver: done']);
  });
});

describe('dslVisibleDiff.visibleLines — 絵に出る行だけを残す', function() {
  test('行頭の \' はコメント、行中の \' は本文として残す', function() {
    var rows = VD.visibleLines("'note\nMcu -> Spi: it's fine");
    expect(rows).toEqual(["Mcu -> Spi: it's fine"]);
  });

  test('1 行で閉じるブロックコメントで、その後の行まで落とさない', function() {
    var rows = VD.visibleLines("/' memo '/\nparticipant Mcu");
    expect(rows).toEqual(['participant Mcu']);
  });
});
