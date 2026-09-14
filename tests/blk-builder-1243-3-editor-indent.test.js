'use strict';
// BLK-builder-20260907-1243-3: design「1a 設定と網羅」5a の残り 2 項目 —
// エディタの「インデント幅 / 2 / 4 / Tab」と、レンダリングの
// 「描画エラーを図の上に重ねて表示」。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/editor-indent.js')]; } catch (e) {}
try { delete require.cache[require.resolve('../src/core/settings-tabs.js')]; } catch (e) {}
try { delete require.cache[require.resolve('../src/core/render-modes.js')]; } catch (e) {}
require('../src/core/editor-indent.js');
require('../src/core/settings-tabs.js');
require('../src/core/render-modes.js');
var EI = global.window.MA.editorIndent;
var ST = global.window.MA.settingsTabs;
var RM = global.window.MA.renderModes;

describe('editorIndent.normalize / unitFor', function() {
  test('5a の 3 択をそのまま持つ', function() {
    expect(EI.CHOICES.map(function(c) { return c.id; })).toEqual(['2', '4', 'tab']);
    expect(EI.CHOICES.map(function(c) { return c.label; })).toEqual(['2', '4', 'Tab']);
  });

  test('知らない値・未設定は 2 スペースに落ちる', function() {
    expect(EI.normalize(undefined)).toBe('2');
    expect(EI.normalize('8')).toBe('2');
    expect(EI.normalize(null)).toBe('2');
  });

  test('単位は id ごとに決まる', function() {
    expect(EI.unitFor('2')).toBe('  ');
    expect(EI.unitFor('4')).toBe('    ');
    expect(EI.unitFor('tab')).toBe('\t');
  });
});

describe('editorIndent.applyIndent', function() {
  test('2 のときはカーソル位置に 2 スペース', function() {
    var r = EI.applyIndent('ab', 1, 1, '2');
    expect(r.text).toBe('a  b');
    expect(r.caret).toBe(3);
  });

  test('4 のときは 4 スペース', function() {
    expect(EI.applyIndent('ab', 1, 1, '4').text).toBe('a    b');
  });

  test('Tab のときはタブ文字 1 つ', function() {
    var r = EI.applyIndent('ab', 1, 1, 'tab');
    expect(r.text).toBe('a\tb');
    expect(r.caret).toBe(2);
  });

  test('選択範囲があればそこを単位で置き換える (従来の挙動)', function() {
    expect(EI.applyIndent('abcd', 1, 3, '2').text).toBe('a  d');
  });
});

describe('editorIndent.applyOutdent', function() {
  test('行頭の 1 単位を外し、カーソルを詰める', function() {
    var text = 'x\n    y';
    var r = EI.applyOutdent(text, 6, '4');
    expect(r.text).toBe('x\ny');
    expect(r.caret).toBe(2);
    expect(r.changed).toBe(true);
  });

  test('2 設定の行で 4 スペースなら 2 だけ外す', function() {
    expect(EI.applyOutdent('    y', 5, '2').text).toBe('  y');
  });

  test('設定より浅い行はあるぶんだけ外す', function() {
    expect(EI.applyOutdent('  y', 3, '4').text).toBe('y');
  });

  test('設定がスペースでも行がタブならタブを外す', function() {
    expect(EI.applyOutdent('\ty', 2, '2').text).toBe('y');
  });

  test('Tab 設定でスペース書きの行も外せる', function() {
    expect(EI.applyOutdent('    y', 5, 'tab').text).toBe('y');
  });

  test('外すものが無ければ DSL を 1 文字も変えない', function() {
    var r = EI.applyOutdent('y', 1, '2');
    expect(r.text).toBe('y');
    expect(r.changed).toBe(false);
  });
});

describe('settingsTabs.normalizeEditorPrefs の indent', function() {
  test('未設定は 2', function() {
    expect(ST.normalizeEditorPrefs({}).indent).toBe('2');
  });

  test('保存済みの指定は残る', function() {
    expect(ST.normalizeEditorPrefs({ indent: 'tab' }).indent).toBe('tab');
  });

  test('壊れた値でも他の項目は生きる', function() {
    var p = ST.normalizeEditorPrefs({ indent: 'zzz', fontSize: 15, wrap: true });
    expect(p.indent).toBe('2');
    expect(p.fontSize).toBe(15);
    expect(p.wrap).toBe(true);
  });
});

describe('renderModes.normalizeErrorOverlay', function() {
  test('未設定は重ね表示 (図を消さない)', function() {
    expect(RM.normalizeErrorOverlay(null)).toBe(true);
    expect(RM.normalizeErrorOverlay(undefined)).toBe(true);
    expect(RM.normalizeErrorOverlay('')).toBe(true);
  });

  test('localStorage の文字列 "false" を false と読む', function() {
    expect(RM.normalizeErrorOverlay('false')).toBe(false);
    expect(RM.normalizeErrorOverlay('true')).toBe(true);
  });

  test('真偽値はそのまま', function() {
    expect(RM.normalizeErrorOverlay(false)).toBe(false);
    expect(RM.normalizeErrorOverlay(true)).toBe(true);
  });
});
