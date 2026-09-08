'use strict';
// BLK-primary-20260908-1603 — 選ぶ前に DSL 行と SVG 図形の対応を見せる (peek)。
//
// 遷移ラベルを直すとき、書き換えそのものより「どの矢印が DSL の何行目か」を
// SVG 上で目で探す段階が手間だった。overlay の rect は data-line を持つのに、
// 選択するまで表示上の手掛かりが無い。キャレット行に対応する rect を薄く光らせる。

var W = (typeof window !== 'undefined' && window) || global.window;
var LP = W.MA.linePeek;
// apply/clear は overlayEl の querySelectorAll しか使わないので、global を
// 差し替えずにこの test 専用の jsdom document で rect を組み立てる。
var D = new (require('jsdom').JSDOM)('<!DOCTYPE html><html><body></body></html>').window.document;

describe('キャレット位置から行番号', function() {
  var text = 'a\nbb\nccc';

  test('先頭は 1 行目', function() {
    expect(LP.lineAtCaret(text, 0)).toBe(1);
  });

  test('改行の直後は次の行', function() {
    expect(LP.lineAtCaret(text, 2)).toBe(2);
    expect(LP.lineAtCaret(text, 5)).toBe(3);
  });

  test('行末に居てもその行のまま (改行の手前)', function() {
    expect(LP.lineAtCaret(text, 1)).toBe(1);
    expect(LP.lineAtCaret(text, 4)).toBe(2);
  });

  test('末尾を超えた位置は末尾の行に丸める', function() {
    expect(LP.lineAtCaret(text, 999)).toBe(3);
  });

  test('テキストや位置が数でなければ null (何も光らせない)', function() {
    expect(LP.lineAtCaret(null, 0)).toBe(null);
    expect(LP.lineAtCaret(text, 'abc')).toBe(null);
    expect(LP.lineAtCaret(text, -1)).toBe(null);
  });
});

describe('行番号から rect のセレクタ', function() {
  test('data-line で引く', function() {
    expect(LP.selectorFor(9)).toBe('rect.selectable[data-line="9"]');
  });

  test('文字列の行番号も受ける (data 属性から来る)', function() {
    expect(LP.selectorFor('9')).toBe('rect.selectable[data-line="9"]');
  });

  test('行番号が無ければ null', function() {
    expect(LP.selectorFor(null)).toBe(null);
    expect(LP.selectorFor(0)).toBe(null);
    expect(LP.selectorFor('abc')).toBe(null);
  });
});

function buildOverlay() {
  var ov = D.createElement('div');
  [
    { line: 9, id: 't1' },
    { line: 9, id: 't1b' },   // 同じ行から 2 つ引ける図形 (ラベルと矢印)
    { line: 12, id: 't2' },
  ].forEach(function(r) {
    var rect = D.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.classList.add('selectable');
    rect.setAttribute('data-line', String(r.line));
    rect.setAttribute('data-id', r.id);
    ov.appendChild(rect);
  });
  return ov;
}

function peeked(ov) {
  return Array.prototype.map.call(ov.querySelectorAll('rect.peek'), function(r) {
    return r.getAttribute('data-id');
  });
}

describe('overlay に peek を付ける', function() {
  test('その行の rect だけに付く (同じ行の複数にも全部付く)', function() {
    var ov = buildOverlay();
    expect(LP.apply(ov, 9)).toBe(2);
    expect(peeked(ov)).toEqual(['t1', 't1b']);
  });

  test('行を移すと前の行の peek は外れる', function() {
    var ov = buildOverlay();
    LP.apply(ov, 9);
    expect(LP.apply(ov, 12)).toBe(1);
    expect(peeked(ov)).toEqual(['t2']);
  });

  test('対応する図形が無い行 (title 行など) では 0 件', function() {
    var ov = buildOverlay();
    expect(LP.apply(ov, 1)).toBe(0);
    expect(peeked(ov)).toEqual([]);
  });

  test('clear で全部外れる', function() {
    var ov = buildOverlay();
    LP.apply(ov, 9);
    expect(LP.clear(ov)).toBe(0);
    expect(peeked(ov)).toEqual([]);
  });

  test('選択 (selected) には触らない — 選び直さずに見比べられる', function() {
    var ov = buildOverlay();
    ov.querySelector('[data-id="t2"]').classList.add('selected');
    LP.apply(ov, 9);
    expect(ov.querySelector('[data-id="t2"]').classList.contains('selected')).toBe(true);
    LP.clear(ov);
    expect(ov.querySelector('[data-id="t2"]').classList.contains('selected')).toBe(true);
  });

  test('overlay が無くても落ちない', function() {
    expect(LP.apply(null, 9)).toBe(0);
  });
});
