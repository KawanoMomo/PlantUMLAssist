'use strict';
// TICKET-owner-20261115-1900-1: 「末尾に追加」で 1 件足した直後、手が欄に残ったまま Ctrl+Z を押すと
// 図の Undo が効かなかった (欄のネイティブ undo に回り、欄は空で何も起きない)。
// 足した直後・欄にまだ打っていない間は図の履歴へ。打ち始めた後は今どおり欄へ。

var W = (typeof window !== 'undefined' && window) || global.window;
var UR = W.MA.undoRoute;
var H = W.MA.history;

describe('undo-route — Ctrl+Z の行き先', function() {
  test('本文欄と、欄以外にフォーカスがあるときは図の履歴', function() {
    var st = UR.create();
    expect(UR.route(st, { inEditor: true, inField: true, inForm: false })).toBe('history');
    expect(UR.route(st, { inEditor: false, inField: false, inForm: true })).toBe('history');
  });

  test('右パネルで足した直後、欄にまだ打っていなければ図の履歴', function() {
    var st = UR.create();
    UR.onPush(st, true);
    expect(UR.route(st, { inEditor: false, inField: true, inForm: true })).toBe('history');
    // 続けて押しても (Ctrl+Y も) 図の履歴のまま
    expect(UR.route(st, { inEditor: false, inField: true, inForm: true })).toBe('history');
  });

  test('欄に 1 字打った後は欄のネイティブ undo', function() {
    var st = UR.create();
    UR.onPush(st, true);
    UR.onFieldInput(st);
    expect(UR.route(st, { inEditor: false, inField: true, inForm: true })).toBe('native');
  });

  test('直前の操作が右パネルから来ていなければ欄に任せる', function() {
    var st = UR.create();
    UR.onPush(st, false);
    expect(UR.route(st, { inEditor: false, inField: true, inForm: true })).toBe('native');
  });

  test('右パネルの外の欄 (絞り込み欄など) は足した直後でも欄に任せる', function() {
    var st = UR.create();
    UR.onPush(st, true);
    expect(UR.route(st, { inEditor: false, inField: true, inForm: false })).toBe('native');
  });
});

describe('history — 積んだときに onPush を呼ぶ', function() {
  test('pushHistory のたびに 1 回呼ばれ、undo / redo では呼ばれない', function() {
    var text = 'a';
    var pushes = 0;
    H.init({
      getMmdText: function() { return text; },
      setMmdText: function(t) { text = t; },
      getKey: function() { return 'undo-route-test'; },
      onPush: function() { pushes++; },
    });
    H.pushHistory();
    text = 'b';
    expect(pushes).toBe(1);
    H.undo();
    expect(text).toBe('a');
    H.redo();
    expect(text).toBe('b');
    expect(pushes).toBe(1);
    H.forget('undo-route-test');
  });
});
