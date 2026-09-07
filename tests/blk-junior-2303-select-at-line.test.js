'use strict';
// BLK-junior-20260907-2303: 行番号から要素を選ぶ。
//
// プレビュー上の座標は遷移を 1 本足しただけで動くが、DSL の行番号は動かない。
// 構造タブの行クリックと Ctrl+K のジャンプが、この 1 つの規則で同じ要素を選ぶ。

var W = (typeof window !== 'undefined' && window) || global.window;
var SAL = W.MA.selectAtLine;

var LIST = [
  { type: 'state', id: 'Idle', line: 3 },
  { type: 'state', id: 'Running', line: 4 },
  { type: 'state', id: 'Error', line: 5 },
  { type: 'transition', id: '__t_1', line: 7 },
];

describe('行番号から要素を選ぶ', function() {
  test('その行の要素を返す', function() {
    expect(SAL.pick(LIST, 5)).toEqual({ type: 'state', id: 'Error', line: 5 });
    expect(SAL.pick(LIST, 7)).toEqual({ type: 'transition', id: '__t_1', line: 7 });
  });

  test('文字列の行番号も受ける (data 属性から来る)', function() {
    expect(SAL.pick(LIST, '5')).toEqual({ type: 'state', id: 'Error', line: 5 });
  });

  test('要素の無い行 (@startuml など) は null', function() {
    expect(SAL.pick(LIST, 1)).toBe(null);
    expect(SAL.pick(LIST, 99)).toBe(null);
  });

  test('行番号が数値でなければ null', function() {
    expect(SAL.pick(LIST, undefined)).toBe(null);
    expect(SAL.pick(LIST, NaN)).toBe(null);
  });

  test('候補が無ければ null (図が空でも例外にしない)', function() {
    expect(SAL.pick([], 3)).toBe(null);
    expect(SAL.pick(null, 3)).toBe(null);
  });

  test('type が無い候補は message として選ぶ', function() {
    expect(SAL.pick([{ id: 'r1', line: 6 }], 6)).toEqual({ type: 'message', id: 'r1', line: 6 });
  });
});

describe('関係しか持たない図の既定リスト', function() {
  test('message の関係だけを行つきで並べる', function() {
    var parsed = { relations: [
      { kind: 'message', id: 'm1', line: 6 },
      { kind: 'note', id: 'n1', line: 8 },
      { kind: 'message', id: 'm2', line: 7 },
    ] };
    expect(SAL.messageSelectables(parsed)).toEqual([
      { type: 'message', id: 'm1', line: 6 },
      { type: 'message', id: 'm2', line: 7 },
    ]);
  });

  test('parsed が無くても空配列', function() {
    expect(SAL.messageSelectables(null)).toEqual([]);
    expect(SAL.messageSelectables({})).toEqual([]);
  });
});
