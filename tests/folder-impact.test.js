'use strict';
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/bulk-rename.js')]; } catch (e) {}
require('../src/core/bulk-rename.js');
try { delete require.cache[require.resolve('../src/core/folder-impact.js')]; } catch (e) {}
require('../src/core/folder-impact.js');
var fi = global.window.MA.folderImpact;

function seq(name) {
  return ['@startuml', 'participant ' + name, 'participant Mcu',
          name + ' -> Mcu : init()', '@enduml'].join('\n');
}

function openDocs() { return [{ id: 'd1', name: 'diagram1', dsl: seq('SpiDrv') }]; }
function files() {
  return [
    { name: 'diagram1', dsl: '古い版 (開いているタブが勝つ)' },
    { name: 'spi', dsl: seq('SpiDrv') },
    { name: 'adc', dsl: seq('AdcDrv') },
    { name: 'plantuml-sequence', dsl: seq('SpiDrv') },
  ];
}
var ROLES = { 'plantuml-sequence': { role: 'template' }, spi: { role: 'data' } };

function merged() { return fi.merge(openDocs(), files(), ROLES); }

describe('folderImpact.merge', function() {
  test('同名は開いているタブを採り、フォルダの古い版は落とす', function() {
    var rows = merged();
    expect(rows.length).toBe(4);
    expect(rows[0].name).toBe('diagram1');
    expect(rows[0].open).toBe(true);
    expect(rows[0].dsl).toBe(seq('SpiDrv'));
    expect(rows[1].open).toBe(false);
  });

  test('role はフォルダの宣言から付く', function() {
    var byName = {};
    merged().forEach(function(r) { byName[r.name] = r; });
    expect(byName.spi.role).toBe('data');
    expect(byName['plantuml-sequence'].role).toBe('template');
    expect(byName.adc.role).toBe('unset');
  });

  test('壊れた入力で落ちない', function() {
    expect(fi.merge(null, null, null)).toEqual([]);
    expect(fi.merge([null, { name: '' }], [undefined], {})).toEqual([]);
  });
});

describe('folderImpact.preview / summarize', function() {
  test('未オープンの図もヒット件数に入る', function() {
    var s = fi.summarize(fi.preview(merged(), 'SpiDrv'));
    expect(s.files).toBe(4);
    expect(s.hitDocs).toBe(3);      // diagram1 / spi / plantuml-sequence
    expect(s.missDocs).toBe(1);     // adc
    expect(s.total).toBe(6);        // 2 件 × 3 枚
    expect(s.openHitDocs).toBe(1);
    expect(s.unopenedHitDocs).toBe(2);
  });

  test('テンプレは数えるが置換の的にはしない', function() {
    var s = fi.summarize(fi.preview(merged(), 'SpiDrv'));
    expect(s.templateHitDocs).toBe(1);
    expect(s.applyDocs).toBe(2);
    expect(s.applyTotal).toBe(4);
    var names = fi.applyTargets(merged(), 'SpiDrv').map(function(r) { return r.name; });
    expect(names).toEqual(['diagram1', 'spi']);
  });

  test('置換前が空なら 0 件 (全図を的にしない)', function() {
    var s = fi.summarize(fi.preview(merged(), ''));
    expect(s.total).toBe(0);
    expect(s.hitDocs).toBe(0);
    expect(fi.applyTargets(merged(), '')).toEqual([]);
  });

  test('出現なしと未読み込みを言い分ける', function() {
    expect(fi.summaryText(fi.summarize([]))).toBe('保存フォルダを読み込んでいません');
    var s = fi.summarize(fi.preview(fi.merge([], files(), ROLES), 'NoSuchName'));
    expect(fi.summaryText(s)).toBe('4 枚を調べて出現なし');
  });

  test('要約は未オープンの枚数とテンプレ除外を書く', function() {
    var text = fi.summaryText(fi.summarize(fi.preview(merged(), 'SpiDrv')));
    expect(text).toContain('4 枚中 3 枚に 6 件');
    expect(text).toContain('未オープン 2 枚');
    expect(text).toContain('テンプレ 1 枚は置換しない');
  });

  test('壊れた入力で落ちない', function() {
    expect(fi.preview(null, 'X')).toEqual([]);
    expect(fi.summarize(null).files).toBe(0);
    expect(fi.sortForDisplay(null)).toEqual([]);
  });
});

describe('folderImpact.sortForDisplay', function() {
  test('ヒットした図が先、件数の多い順', function() {
    var docs = [
      { name: 'a', dsl: seq('X') },
      { name: 'b', dsl: '@startuml\nX -> Y : 1\nX -> Y : 2\nX -> Y : 3\n@enduml' },
      { name: 'c', dsl: seq('Z') },
    ];
    var order = fi.sortForDisplay(fi.preview(fi.merge([], docs, {}), 'X'))
      .map(function(r) { return r.name + ':' + r.count; });
    expect(order).toEqual(['b:3', 'a:2', 'c:0']);
  });
});
