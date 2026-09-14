'use strict';
// BLK-primary-20260909-0303-wish: レビュー会議で「この図、変わった?」に答えるには
// 件数だけでは足りず、消えた行と入った行そのものを見せる必要がある。
// 参照ペインの「± 差分」タブが出す行差分を守る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/save-diff.js')]; } catch (e) {}
require('../src/core/save-diff.js');
var _store = {};
Object.defineProperty(global.window, 'localStorage', {
  configurable: true,
  value: {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
    setItem: function(k, v) { _store[k] = String(v); },
    removeItem: function(k) { delete _store[k]; },
  },
});

var SD = global.window.MA.saveDiff;

var BEFORE = ['@startuml', 'participant SpiDrv', 'SpiDrv -> Hal : Spi_Init()', '@enduml'].join('\n');
var AFTER = ['@startuml', 'participant Spi_Driver', 'Spi_Driver -> Hal : Spi_Init()', '@enduml'].join('\n');

function marks(rows) { return rows.map(function(r) { return r.mark; }).join(''); }
function textOf(rows, mark) {
  return rows.filter(function(r) { return r.mark === mark; }).map(function(r) { return r.text; });
}

describe('save-diff diffLines (変更前後を行で見せる)', function() {
  beforeEach(function() { SD.reset(); });

  test('基準が無ければ全行が追加として出る', function() {
    var rows = SD.diffLines('spi', AFTER);
    expect(marks(rows)).toBe('++++');
  });

  test('改名した行だけが − と + で出て、変わらない行は残る', function() {
    SD.mark('spi', BEFORE);
    var rows = SD.diffLines('spi', AFTER);
    expect(textOf(rows, '-')).toEqual(['participant SpiDrv', 'SpiDrv -> Hal : Spi_Init()']);
    expect(textOf(rows, '+')).toEqual(['participant Spi_Driver', 'Spi_Driver -> Hal : Spi_Init()']);
    expect(textOf(rows, ' ')).toEqual(['@startuml', '@enduml']);
  });

  test('変更が無ければ 1 行も出ない (会議で「変わっていない」と言い切れる)', function() {
    SD.mark('spi', AFTER);
    expect(SD.diffLines('spi', AFTER)).toEqual([]);
  });

  test('離れた変更点の間の未変更行はまとめられ、前後 1 行だけ残る', function() {
    var base = ['@startuml', 'a', 'b', 'c', 'd', 'e', 'f', '@enduml'].join('\n');
    var now = ['@startuml', 'a2', 'b', 'c', 'd', 'e', 'f2', '@enduml'].join('\n');
    SD.mark('spi', base);
    var rows = SD.diffLines('spi', now);
    var skip = rows.filter(function(r) { return r.mark === '…'; });
    expect(skip.length).toBe(1);
    expect(skip[0].text).toBe('変更なし 2 行');
    expect(textOf(rows, '+')).toEqual(['a2', 'f2']);
    expect(textOf(rows, '-')).toEqual(['a', 'f']);
  });

  test('行末の空白や改行コードの違いは差分に出ない', function() {
    SD.mark('spi', BEFORE);
    var noisy = BEFORE.replace(/\n/g, '\r\n') + '  \n\n';
    expect(SD.diffLines('spi', noisy)).toEqual([]);
  });
});
