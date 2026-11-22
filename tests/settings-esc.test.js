'use strict';
// TICKET-owner-20261116-0621-1: ⚙ 設定の窓は Esc で「キャンセル」と同じく保存せずに閉じる。
// 閉じない場合 (窓が閉じている・IME の変換中・他が先に処理した・ショートカットのキー待ち) を固定する。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/settings-tabs.js')]; } catch (e) {}
require('../src/core/settings-tabs.js');
var ST = global.window.MA.settingsTabs;

describe('escClosesSettings', function() {
  test('窓が開いていて Esc なら閉じる', function() {
    expect(ST.escClosesSettings({ key: 'Escape' }, true, false)).toBe(true);
  });
  test('窓が閉じていれば何もしない', function() {
    expect(ST.escClosesSettings({ key: 'Escape' }, false, false)).toBe(false);
  });
  test('Esc 以外のキーでは閉じない', function() {
    expect(ST.escClosesSettings({ key: 'Enter' }, true, false)).toBe(false);
    expect(ST.escClosesSettings({ key: 'Esc' }, true, false)).toBe(false);
  });
  test('IME の変換中の Esc は変換の取り消しで、窓は閉じない', function() {
    expect(ST.escClosesSettings({ key: 'Escape', isComposing: true }, true, false)).toBe(false);
  });
  test('他が先に処理した Esc では閉じない', function() {
    expect(ST.escClosesSettings({ key: 'Escape', defaultPrevented: true }, true, false)).toBe(false);
  });
  test('ショートカットのキー待ち中の Esc はその取り消しだけで、窓は閉じない', function() {
    expect(ST.escClosesSettings({ key: 'Escape' }, true, true)).toBe(false);
  });
  test('ev が無ければ閉じない', function() {
    expect(ST.escClosesSettings(null, true, false)).toBe(false);
  });
});
