'use strict';
// BLK-primary-20260908-0923-design (design 7b): タブ列にはボタンを 1 つも置かない。
// 7a で 25 個の機能ボタンを「ツール ▾」1 個に畳んだが、7b はその 1 個も置かず、
// タブ列を図のタブと ＋ / 一覧 だけにして、機能は Ctrl+K から引く。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/tool-menu.js')]; } catch (e) {}
require('../src/core/tool-menu.js');

const tm = global.window.MA.toolMenu;

describe('タブ列は図のタブだけ (BLK-primary-20260908-0923-design)', function() {
  test('設定が無ければ静か (ツール ▾ も置かない)', function() {
    expect(tm.quietAtStart(null)).toBe(true);
    expect(tm.quietAtStart(undefined)).toBe(true);
    expect(tm.quietAtStart('')).toBe(true);
  });

  test('自分で「ツール ▾ をタブ列に出す」を選んだ人はその選択が残る', function() {
    expect(tm.quietAtStart('0')).toBe(false);
  });

  test('自分で静かにした人も静かなまま', function() {
    expect(tm.quietAtStart('1')).toBe(true);
  });

  test('畳んでいて静かなら「ツール ▾」は出さない', function() {
    expect(tm.showsToolButton(true, true)).toBe(false);
  });

  test('畳んでいても静かでなければ「ツール ▾」は出す', function() {
    expect(tm.showsToolButton(true, false)).toBe(true);
  });

  test('機能ボタンが並んでいるときは、畳み直す入口として必ず出す', function() {
    // 静かの設定に関わらず出す。出さないと戻す手が画面から消える。
    expect(tm.showsToolButton(false, true)).toBe(true);
    expect(tm.showsToolButton(false, false)).toBe(true);
  });
});
