'use strict';
// TICKET-junior-20261122-1001-wish: DSL エディタで複数行を選んで Alt+↑ / Alt+↓ を押すと、
// 選んだ行の塊をまとめて 1 行上 / 下へ動かす。純関数 dslUpdater.moveLinesUp / moveLinesDown。
var DUR = (typeof window !== 'undefined' && window.MA && window.MA.dslUpdater)
  || (global.window && global.window.MA && global.window.MA.dslUpdater);

var SRC = ['@startuml', 'Ctl -> Srv : a', 'Srv -> Dev : b', '  Dev --> Srv : c', 'Srv --> Ctl : d', '@enduml'];

describe('dslUpdater.moveLinesUp / moveLinesDown (行の塊を動かす)', function() {
  test('3 行の塊 (3〜5 行目) を 1 行上へ。上の 1 行が塊の下へ回るだけ', function() {
    var out = DUR.moveLinesUp(SRC.join('\n'), 3, 5);
    expect(out.split('\n')).toEqual(['@startuml', 'Srv -> Dev : b', '  Dev --> Srv : c', 'Srv --> Ctl : d', 'Ctl -> Srv : a', '@enduml']);
  });

  test('3 行の塊 (2〜4 行目) を 1 行下へ。下の 1 行が塊の上へ回るだけ', function() {
    var out = DUR.moveLinesDown(SRC.join('\n'), 2, 4);
    expect(out.split('\n')).toEqual(['@startuml', 'Srv --> Ctl : d', 'Ctl -> Srv : a', 'Srv -> Dev : b', '  Dev --> Srv : c', '@enduml']);
  });

  test('上へ動かして下へ戻すと元のバイト列', function() {
    var t = SRC.join('\n');
    expect(DUR.moveLinesDown(DUR.moveLinesUp(t, 3, 5), 2, 4)).toBe(t);
  });

  test('CRLF の本文は CRLF のまま。行の中に \\r を残さない', function() {
    var t = SRC.join('\r\n') + '\r\n';
    var out = DUR.moveLinesUp(t, 3, 5);
    expect(out).toBe(['@startuml', 'Srv -> Dev : b', '  Dev --> Srv : c', 'Srv --> Ctl : d', 'Ctl -> Srv : a', '@enduml'].join('\r\n') + '\r\n');
    expect(out.replace(/\r\n/g, '').indexOf('\r')).toBe(-1);
    expect(out.match(/\r\n/g).length).toBe(t.match(/\r\n/g).length);
  });

  test('LF の本文は LF のまま (末尾の改行も保つ)', function() {
    var t = SRC.join('\n') + '\n';
    var out = DUR.moveLinesDown(t, 2, 4);
    expect(out.indexOf('\r')).toBe(-1);
    expect(out.charAt(out.length - 1)).toBe('\n');
    expect(out.split('\n').length).toBe(t.split('\n').length);
  });

  test('端では入力をそのまま返す (塊が 1 行目に掛かる上 / 最終行に掛かる下)', function() {
    var t = SRC.join('\n');
    expect(DUR.moveLinesUp(t, 1, 3)).toBe(t);
    expect(DUR.moveLinesDown(t, 4, 6)).toBe(t);
  });

  test('範囲外・逆順の範囲では入力をそのまま返す', function() {
    var t = SRC.join('\n');
    expect(DUR.moveLinesUp(t, 4, 3)).toBe(t);
    expect(DUR.moveLinesUp(t, 3, 99)).toBe(t);
    expect(DUR.moveLinesDown(t, 0, 2)).toBe(t);
  });

  test('1 行の塊は従来の moveLineUp / moveLineDown と同じ結果', function() {
    var t = SRC.join('\n');
    expect(DUR.moveLinesUp(t, 3, 3)).toBe(DUR.moveLineUp(t, 3));
    expect(DUR.moveLinesDown(t, 3, 3)).toBe(DUR.moveLineDown(t, 3));
  });
});
