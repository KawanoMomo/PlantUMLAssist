'use strict';
// BLK-junior-20260915-2346: 同じ図を 1 run で何度も開き直すのに「直前に開いていた図」が
// どこにも残らず、出戻りのたびに 📂 一覧で名前を目で探し直していた。
// 履歴の並べ替え・重複除去・消えた図の除外だけを純関数として持つ (描画は app.js)。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/recent-files.js')]; } catch (e) {}
require('../src/core/recent-files.js');
var rf = global.window.MA.recentFiles;

describe('recentFiles.push', () => {
  test('開いた図が先頭に積まれる', () => {
    expect(rf.push([], 'spi_usecase.puml')).toEqual(['spi_usecase.puml']);
    expect(rf.push(['a.puml'], 'b.puml')).toEqual(['b.puml', 'a.puml']);
  });

  test('同じ図を開き直すと重複せず先頭へ戻る', () => {
    var list = rf.push(rf.push(rf.push([], 'a.puml'), 'b.puml'), 'c.puml');
    expect(list).toEqual(['c.puml', 'b.puml', 'a.puml']);
    expect(rf.push(list, 'a.puml')).toEqual(['a.puml', 'c.puml', 'b.puml']);
  });

  test('既定は 5 件までで、古いものから落ちる', () => {
    var list = [];
    ['1', '2', '3', '4', '5', '6'].forEach(function(n) { list = rf.push(list, n + '.puml'); });
    expect(list).toEqual(['6.puml', '5.puml', '4.puml', '3.puml', '2.puml']);
    expect(list.length).toBe(rf.LIMIT);
  });

  test('件数の上限は指定できる', () => {
    expect(rf.push(['a.puml', 'b.puml'], 'c.puml', 2)).toEqual(['c.puml', 'a.puml']);
  });

  test('空の名前・壊れた履歴でも例外を投げない', () => {
    expect(rf.push(null, null)).toEqual([]);
    expect(rf.push(['a.puml', 'a.puml', '', null], 'a.puml')).toEqual(['a.puml']);
    expect(rf.push(undefined, 'a.puml')).toEqual(['a.puml']);
  });
});

describe('recentFiles.visible', () => {
  var ENTRIES = [{ name: 'a.puml' }, { name: 'b.puml' }];

  test('保存フォルダに残っている図だけを順序を保って返す', () => {
    expect(rf.visible(['b.puml', 'gone.puml', 'a.puml'], ENTRIES)).toEqual(['b.puml', 'a.puml']);
  });

  test('名前の配列でも判定できる', () => {
    expect(rf.visible(['a.puml', 'x.puml'], ['a.puml'])).toEqual(['a.puml']);
  });

  // server の一覧は名前を type で返す (name を持たない)。ここを取り違えると
  // 履歴が毎回すべて「消えた図」と判定され、最近開いた図の行が出なくなる。
  test('server の一覧 (type) でも判定できる', () => {
    expect(rf.visible(['a.puml', 'x.puml'], [{ type: 'a.puml' }])).toEqual(['a.puml']);
  });

  test('一覧が空なら履歴も出さない', () => {
    expect(rf.visible(['a.puml'], [])).toEqual([]);
    expect(rf.visible(['a.puml'], null)).toEqual([]);
  });

  test('prune は visible と同じ判定', () => {
    expect(rf.prune(['a.puml', 'gone.puml'], ENTRIES)).toEqual(['a.puml']);
  });
});

describe('recentFiles.label / paletteTitle', () => {
  test('拡張子を落として読ませる', () => {
    expect(rf.label('spi_usecase.puml')).toBe('spi_usecase');
    expect(rf.label('spi.PUML')).toBe('spi');
    expect(rf.label('no_ext')).toBe('no_ext');
    expect(rf.label(null)).toBe('');
  });

  test('Ctrl+K の見出しは最近開いた図と分かる', () => {
    expect(rf.paletteTitle('spi_usecase.puml')).toBe('最近開いた図: spi_usecase');
  });
});
