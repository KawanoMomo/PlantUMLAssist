'use strict';
// BLK-junior-20260915-0406: 1 枚書き出し (SVG / PNG) のファイル名を、title ではなく
// .puml の保存名 (図の名前) に揃える。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/workspace.js')]; } catch (e) {}
require('../src/core/workspace.js');
try { delete require.cache[require.resolve('../src/core/export-name.js')]; } catch (e) {}
require('../src/core/export-name.js');
var en = global.window.MA.exportName;

var META = { title: 'SPI ドライバ 状態遷移' };

describe('exportName.baseOf', function() {
  test('図の名前 (.puml の保存名) を使い、title は使わない', function() {
    expect(en.baseOf({ id: 'd1', name: 'spi_state' }, META)).toBe('spi_state');
  });

  test('図の名前が無いときだけ title に落ちる', function() {
    expect(en.baseOf(null, META)).toBe('SPI ドライバ 状態遷移');
    expect(en.baseOf({ id: 'd1', name: '' }, META)).toBe('SPI ドライバ 状態遷移');
    expect(en.baseOf({ id: 'd1', name: '   ' }, META)).toBe('SPI ドライバ 状態遷移');
  });

  test('図の名前も title も無ければ untitled', function() {
    expect(en.baseOf(null, null)).toBe('untitled');
    expect(en.baseOf({ id: 'd1', name: '' }, { title: '' })).toBe('untitled');
  });

  test('ファイル名に使えない名前で開いている図は title に落ちる', function() {
    expect(en.baseOf({ id: 'd1', name: 'a/b:c' }, META)).toBe('SPI ドライバ 状態遷移');
  });

  test('日本語・空白・括弧の図名はそのまま使う (workspace の規則と同じ)', function() {
    expect(en.baseOf({ id: 'd1', name: 'SPI 状態 (下書き)' }, META)).toBe('SPI 状態 (下書き)');
  });
});

describe('exportName.fileName', function() {
  test('svg / png の拡張子を付ける', function() {
    var doc = { id: 'd1', name: 'spi_state' };
    expect(en.fileName(doc, META, 'svg')).toBe('spi_state.svg');
    expect(en.fileName(doc, META, 'png')).toBe('spi_state.png');
    expect(en.fileName(doc, META, '.svg')).toBe('spi_state.svg');
  });

  test('同じ図の .puml と画像でファイル名の幹が揃う', function() {
    var doc = { id: 'd1', name: 'spi_state' };
    expect(en.fileName(doc, META, 'svg').replace(/\.svg$/, ''))
      .toBe(global.window.MA.saveTarget
        ? global.window.MA.saveTarget.decide({ backend: 'file', fileDir: './autosave' }, doc, 'untitled').name
        : doc.name);
  });
});
