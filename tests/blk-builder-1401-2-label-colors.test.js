'use strict';
// BLK-builder-20260907-1401-2 / design 2b「本文 / Label」の色パネル。
//
// 仕様: ツールバーは B I U ··· creole。色は `···` の内側に畳み、
// パネルは「文字色 / Text color」→「最近使った色」→「色を外す」→「Esc で閉じる」。

var W = (typeof window !== 'undefined' && window) || global.window;
var LC = W.MA.labelColors;

describe('色として使える値', function() {
  test('#rrggbb と #rgb を受ける', function() {
    expect(LC.isColor('#f74a4a')).toBe(true);
    expect(LC.isColor('#f00')).toBe(true);
  });

  test('PlantUML の色名も受ける', function() {
    expect(LC.isColor('red')).toBe(true);
  });

  test('空・非文字列・記号混じりは受けない', function() {
    expect(LC.isColor('')).toBe(false);
    expect(LC.isColor(null)).toBe(false);
    expect(LC.isColor('#12')).toBe(false);
    expect(LC.isColor('<script>')).toBe(false);
  });
});

describe('最近使った色', function() {
  test('使った色が先頭に積まれる', function() {
    expect(LC.push([], '#f00')).toEqual(['#f00']);
    expect(LC.push(['#f00'], '#0f0')).toEqual(['#0f0', '#f00']);
  });

  test('同じ色を使い直しても増えず、先頭に来る', function() {
    expect(LC.push(['#0f0', '#f00'], '#f00')).toEqual(['#f00', '#0f0']);
  });

  test('上限で古いものから落ちる', function() {
    var list = ['#1', '#2'];
    var five = LC.push(LC.push(LC.push(LC.push(LC.push([], 'a'), 'b'), 'c'), 'd'), 'e');
    expect(five.length).toBe(LC.RECENT_MAX);
    expect(LC.push(five, 'f').length).toBe(LC.RECENT_MAX);
    expect(LC.push(five, 'f')[0]).toBe('f');
    expect(list.length).toBe(2); // 元の配列は変えない
  });

  test('色として読めない値は積まない', function() {
    expect(LC.push(['#f00'], '')).toEqual(['#f00']);
  });
});

describe('保存と読み出し', function() {
  function fakeStorage(initial) {
    var v = initial;
    return {
      getItem: function() { return v; },
      setItem: function(k, x) { v = x; },
      read: function() { return v; },
    };
  }

  test('保存した並びがそのまま戻る', function() {
    var st = fakeStorage(null);
    LC.save(st, LC.RECENT_KEY, ['#f00', '#0f0']);
    expect(LC.load(st, LC.RECENT_KEY)).toEqual(['#f00', '#0f0']);
  });

  test('未保存なら空', function() {
    expect(LC.load(fakeStorage(null), LC.RECENT_KEY)).toEqual([]);
  });

  test('壊れた JSON でも空を返すだけで例外にしない', function() {
    expect(LC.load(fakeStorage('{not json'), LC.RECENT_KEY)).toEqual([]);
  });

  test('保存値に紛れた色でない値は捨てる', function() {
    var st = fakeStorage(JSON.stringify(['#f00', 42, '<b>', '#0f0']));
    expect(LC.load(st, LC.RECENT_KEY)).toEqual(['#f00', '#0f0']);
  });

  test('storage が無くても例外にしない', function() {
    expect(LC.load(null, LC.RECENT_KEY)).toEqual([]);
    expect(function() { LC.save(null, LC.RECENT_KEY, ['#f00']); }).not.toThrow();
  });
});

describe('色を外す', function() {
  test('色指定だけを剥がして本文は残す', function() {
    expect(LC.stripColor('<color:#f00>危険</color>')).toBe('危険');
  });

  test('太字などの他のタグは残す', function() {
    expect(LC.stripColor('<b><color:red>x</color></b>')).toBe('<b>x</b>');
  });

  test('色が無い文字列はそのまま', function() {
    expect(LC.stripColor('ふつうの本文')).toBe('ふつうの本文');
    expect(LC.stripColor(null)).toBe('');
  });
});
