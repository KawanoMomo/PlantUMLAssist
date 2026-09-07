'use strict';
// BLK-primary-20260907-1203-design (design 5a): 図の要素を選んだとき、DSL の該当行へ
// エディタを動かす。行番号 → 文字オフセット / スクロール位置の翻訳をここで固定する。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/editor-jump.js')]; } catch (e) {}
require('../src/core/editor-jump.js');
var EJ = global.window.MA.editorJump;

try { delete require.cache[require.resolve('../src/core/settings-tabs.js')]; } catch (e) {}
require('../src/core/settings-tabs.js');
var ST = global.window.MA.settingsTabs;

var TEXT = ['@startuml', 'state Idle', 'state Running', 'Idle --> Running : start', '@enduml'].join('\n');

describe('lineRange', function() {
  test('1 行目は先頭から', function() {
    expect(EJ.lineRange(TEXT, 1)).toEqual({ start: 0, end: 9, line: 1 });
  });

  test('途中の行は改行ぶんを足した位置', function() {
    var r = EJ.lineRange(TEXT, 4);
    expect(TEXT.slice(r.start, r.end)).toBe('Idle --> Running : start');
  });

  test('最終行も末尾まで取れる', function() {
    var r = EJ.lineRange(TEXT, 5);
    expect(TEXT.slice(r.start, r.end)).toBe('@enduml');
    expect(r.end).toBe(TEXT.length);
  });

  test('範囲外の行番号は近い方へ丸める (例外にしない)', function() {
    expect(EJ.lineRange(TEXT, 99).line).toBe(5);
    expect(EJ.lineRange(TEXT, 0).line).toBe(1);
    expect(EJ.lineRange(TEXT, -3).line).toBe(1);
  });

  test('行番号でなければ null', function() {
    expect(EJ.lineRange(TEXT, null)).toBe(null);
    expect(EJ.lineRange(TEXT, 'abc')).toBe(null);
  });

  test('空文字でも落ちない', function() {
    expect(EJ.lineRange('', 1)).toEqual({ start: 0, end: 0, line: 1 });
  });
});

describe('scrollTopFor', function() {
  var OPTS = { lineHeight: 20, viewportHeight: 200 };

  test('既に見えている行では動かさない', function() {
    // scrollTop=0 のとき 1〜10 行目が見えている
    expect(EJ.scrollTopFor(5, Object.assign({}, OPTS, { scrollTop: 0 }))).toBe(0);
  });

  test('下にはみ出た行はその行が中央に来るまで送る', function() {
    expect(EJ.scrollTopFor(40, Object.assign({}, OPTS, { scrollTop: 0 }))).toBe(690);
  });

  test('上にはみ出た行にも戻る', function() {
    expect(EJ.scrollTopFor(2, Object.assign({}, OPTS, { scrollTop: 600 }))).toBe(0);
  });

  test('負のスクロールにはならない', function() {
    expect(EJ.scrollTopFor(1, Object.assign({}, OPTS, { scrollTop: 500 }))).toBe(0);
  });

  test('高さが分からなければ行の先頭に合わせる', function() {
    expect(EJ.scrollTopFor(4, { lineHeight: 20, viewportHeight: 0, scrollTop: 0 })).toBe(60);
  });
});

describe('targetLine', function() {
  test('1 つ選んでいればその行', function() {
    expect(EJ.targetLine([{ type: 'state', id: 'Idle', line: 2 }])).toBe(2);
  });

  test('複数選択では DSL の並びで一番上の行 (選んだ順に依らない)', function() {
    var a = [{ line: 7 }, { line: 3 }];
    var b = [{ line: 3 }, { line: 7 }];
    expect(EJ.targetLine(a)).toBe(3);
    expect(EJ.targetLine(b)).toBe(3);
  });

  test('行を持たない選択・選択なしは null', function() {
    expect(EJ.targetLine([{ type: 'state', id: 'X', line: null }])).toBe(null);
    expect(EJ.targetLine([])).toBe(null);
    expect(EJ.targetLine(null)).toBe(null);
  });
});

describe('settingsTabs.normalizeEditorPrefs — clickToLine', function() {
  test('未設定なら有効 (design 5a のトグルは入りで on)', function() {
    expect(ST.normalizeEditorPrefs({}).clickToLine).toBe(true);
    expect(ST.normalizeEditorPrefs(null).clickToLine).toBe(true);
  });

  test('明示的に false を保存したら無効のまま', function() {
    expect(ST.normalizeEditorPrefs({ clickToLine: false }).clickToLine).toBe(false);
  });

  test('既存のフォントサイズ・折り返しの指定は変わらない', function() {
    var p = ST.normalizeEditorPrefs({ fontSize: 17, wrap: true, clickToLine: false });
    expect(p).toEqual({ fontSize: 17, wrap: true, clickToLine: false, indent: '2' });
  });
});
