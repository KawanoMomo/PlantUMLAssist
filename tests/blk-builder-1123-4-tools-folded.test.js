'use strict';
// BLK-builder-20260908-1123-4 (design 7a/7b): タブ列の既定は「ツールを畳んだ状態」。
// 畳む手段はあっても既定が畳まないままだと、7a/7b が直そうとした
// 「機能ボタン 25 個で横スクロールするタブ列」がそのまま残る。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/tool-menu.js')]; } catch (e) {}
require('../src/core/tool-menu.js');

const tm = global.window.MA.toolMenu;

describe('タブ列の既定は畳んだ状態 (BLK-builder-20260908-1123-4)', function() {
  test('設定が無ければ畳む', function() {
    expect(tm.foldedAtStart(null)).toBe(true);
    expect(tm.foldedAtStart(undefined)).toBe(true);
    expect(tm.foldedAtStart('')).toBe(true);
  });

  test('自分で「タブ列に戻す」を選んだ人はその選択が残る', function() {
    expect(tm.foldedAtStart('0')).toBe(false);
  });

  test('自分で畳んだ人も畳んだまま', function() {
    expect(tm.foldedAtStart('1')).toBe(true);
  });

  test('畳んでもタブ列に残るのは図の出し入れだけ', function() {
    expect(tm.keepIds()).toContain('btn-tab-new');
    expect(tm.keepIds()).toContain('btn-tab-folder');
    // 機能ボタンは畳む対象。
    expect(tm.isFoldable('btn-tab-compare')).toBe(true);
    expect(tm.isFoldable('btn-tab-new')).toBe(false);
  });
});
