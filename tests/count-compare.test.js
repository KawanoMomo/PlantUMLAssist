'use strict';
// BLK-junior-20260907-1703-wish: 先輩の図と自分の図が「同じ形か」を数で突き合わせる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/dsl-utils.js')]; } catch (e) {}
require('../src/core/dsl-utils.js');
try { delete require.cache[require.resolve('../src/core/outline.js')]; } catch (e) {}
require('../src/core/outline.js');
try { delete require.cache[require.resolve('../src/core/count-compare.js')]; } catch (e) {}
require('../src/core/count-compare.js');
var cc = global.window.MA.countCompare;
var ol = global.window.MA.outline;

// 先輩の図 (Driver_Common 相当): クラス 4・関連 3
var SENIOR_CLASS = [
  '@startuml',
  'class Driver',
  'class GpioDrv',
  'class UartDrv',
  'class CanDrv',
  'Driver <|-- GpioDrv',
  'Driver <|-- UartDrv',
  'Driver <|-- CanDrv',
  '@enduml',
].join('\n');

describe('outline.countTerms — 語彙を 1 か所から配る', function() {
  test('クラス図は classes / relations', function() {
    expect(ol.countTerms('plantuml-class').map(function(t) { return t.key; }))
      .toEqual(['classes', 'relations']);
  });
  test('状態遷移図は states / relations で、複数形は transitions', function() {
    var t = ol.countTerms('plantuml-state');
    expect(t[0].key).toBe('states');
    expect(t[1].key).toBe('relations');
    expect(t[1].many).toBe('transitions');
  });
  test('知らない図種は elements / relations に落ちる', function() {
    expect(ol.countTerms('plantuml-sequence').map(function(t) { return t.key; }))
      .toEqual(['elements', 'relations']);
  });
});

describe('countCompare.compare — 数が合っているかを言う', function() {
  test('同じ数なら「同じ形です」と図種の語彙で出す', function() {
    var r = cc.compare({ classes: 4, relations: 3 }, { classes: 4, relations: 3 }, 'plantuml-class');
    expect(r.comparable).toBe(true);
    expect(r.same).toBe(true);
    expect(r.message).toBe('同じ形です (4 classes · 3 relations)');
    expect(cc.label(r)).toBe('✓ 同じ形です (4 classes · 3 relations)');
  });

  test('足りない側は「足りません」、多い側は「多いです」と言う', function() {
    var less = cc.compare({ classes: 4, relations: 2 }, { classes: 4, relations: 3 }, 'plantuml-class');
    expect(less.same).toBe(false);
    expect(less.message).toBe('relation が 1 足りません (自分 2 / 参照 3)');
    var more = cc.compare({ classes: 6, relations: 3 }, { classes: 4, relations: 3 }, 'plantuml-class');
    expect(more.message).toBe('classes が 2 多いです (自分 6 / 参照 4)');
  });

  test('両方ずれていれば両方言う', function() {
    var r = cc.compare({ classes: 3, relations: 5 }, { classes: 4, relations: 3 }, 'plantuml-class');
    expect(r.message).toBe('class が 1 足りません (自分 3 / 参照 4) · relations が 2 多いです (自分 5 / 参照 3)');
    expect(cc.label(r).charAt(0)).toBe('⚠');
  });

  test('rows に自分・参照・差を並べる (画面が引き算をやり直さない)', function() {
    var r = cc.compare({ classes: 4, relations: 2 }, { classes: 4, relations: 3 }, 'plantuml-class');
    expect(r.rows).toEqual([
      { key: 'classes', one: 'class', many: 'classes', self: 4, ref: 4, delta: 0 },
      { key: 'relations', one: 'relation', many: 'relations', self: 2, ref: 3, delta: -1 },
    ]);
  });

  test('状態遷移図は transitions という語で差を言う', function() {
    var r = cc.compare({ states: 3, relations: 4 }, { states: 3, relations: 6 }, 'plantuml-state');
    expect(r.message).toBe('transitions が 2 足りません (自分 4 / 参照 6)');
  });

  test('図種が違えば比べずにそう言う', function() {
    var r = cc.compare({ classes: 4 }, { states: 4 }, 'plantuml-class', 'plantuml-state');
    expect(r.comparable).toBe(false);
    expect(r.same).toBe(false);
    expect(r.message).toBe('図種が違うので数を比べられません (class と state)');
    expect(cc.label(r).charAt(0)).toBe('—');
  });

  test('同じ図種なら refDiagramType を渡しても比べる', function() {
    expect(cc.compare({ classes: 1 }, { classes: 1 }, 'plantuml-class', 'plantuml-class').comparable).toBe(true);
  });

  test('counts が無くても 0 として扱い、例外を投げない', function() {
    var r = cc.compare(null, null, 'plantuml-class');
    expect(r.same).toBe(true);
    expect(r.message).toBe('同じ形です (0 classes · 0 relations)');
  });

  test('数が 1 のときは単数形', function() {
    var r = cc.compare({ classes: 1, relations: 1 }, { classes: 1, relations: 1 }, 'plantuml-class');
    expect(r.message).toBe('同じ形です (1 class · 1 relation)');
  });

  test('label は結果が無ければ空', function() {
    expect(cc.label(null)).toBe('');
  });
});

describe('countCompare.compareDsl — DSL 2 本から直接', function() {
  test('先輩の図をそのまま真似られていれば同じ形', function() {
    var mine = SENIOR_CLASS.replace(/GpioDrv/g, 'CanDrv2');
    expect(cc.compareDsl(mine, SENIOR_CLASS, 'plantuml-class', 'plantuml-class').same).toBe(true);
  });

  test('関連を 1 本書き忘れていれば足りないと言う', function() {
    var mine = SENIOR_CLASS.replace('Driver <|-- CanDrv\n', '');
    var r = cc.compareDsl(mine, SENIOR_CLASS, 'plantuml-class', 'plantuml-class');
    expect(r.same).toBe(false);
    expect(r.message).toContain('relation が 1 足りません');
  });

  test('outline.build と同じ数え方をする (数える規則は 1 本)', function() {
    var r = cc.compareDsl(SENIOR_CLASS, SENIOR_CLASS, 'plantuml-class', 'plantuml-class');
    var c = ol.build(SENIOR_CLASS).counts;
    expect(r.rows[0].self).toBe(c.classes);
    expect(r.rows[1].self).toBe(c.relations);
  });

  test('参照側が空でも落ちない', function() {
    expect(cc.compareDsl(SENIOR_CLASS, '', 'plantuml-class', 'plantuml-class').same).toBe(false);
  });
});
