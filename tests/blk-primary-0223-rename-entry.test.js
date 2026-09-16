'use strict';
// BLK-primary-20260917-0223-friction: 畳まれた ⇄ 一括置換を Ctrl+K で名前を打って開く迂回が
// 毎回乗っていた。パレットの行に Ctrl+H を出して単独キーに気付けるようにし、
// エディタで選んだ部品名を置換前の欄に入れて打鍵を減らす。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
['../src/core/html-utils.js', '../src/core/bulk-rename.js', '../src/core/command-palette.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var BR = global.window.MA.bulkRename;
var CP = global.window.MA.commandPalette;

describe('BLK-primary-20260917-0223 一括置換の入口', function() {
  test('パレットの一括置換の行は、いま効いているキーを出す', function() {
    var keys = function(id) { return id === 'bulk-rename' ? 'Ctrl+H' : ''; };
    expect(CP.shortcutHint({ id: 'edit:tab-rename', hint: '部品名を一括置換' }, keys)).toBe('部品名を一括置換 · Ctrl+H');
    expect(CP.shortcutHint({ id: 'tab-rename' }, keys)).toBe('Ctrl+H');
  });
  test('キーが差し替えられていれば差し替え後のキーを出す', function() {
    expect(CP.shortcutHint({ id: 'tab-rename', hint: 'Tabs' }, function() { return 'Alt+R'; })).toBe('Tabs · Alt+R');
  });
  test('単独キーの無いコマンドは従来の hint のまま', function() {
    expect(CP.shortcutHint({ id: 'tab-folder', hint: 'Tabs' }, function() { return 'Ctrl+H'; })).toBe('Tabs');
    expect(CP.shortcutHint({ id: 'x' }, null)).toBe('');
  });
  test('エディタで選んだ 1 語は置換前の初期値になる', function() {
    expect(BR.seedFromSelection(' SpiDrv ')).toBe('SpiDrv');
  });
  test('空・複数語・行をまたぐ選択は使わない', function() {
    expect(BR.seedFromSelection('')).toBe('');
    expect(BR.seedFromSelection('SpiDrv -> Mcu')).toBe('');
    expect(BR.seedFromSelection('a\nb')).toBe('');
    expect(BR.seedFromSelection(undefined)).toBe('');
  });
});
