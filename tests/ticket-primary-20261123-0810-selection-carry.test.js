'use strict';
// TICKET-primary-20261123-0810-wish: 「変更を反映」の後も、直した要素 (同じ行) を選んだままにする。
//
// 選択の持ち越しは図種ごとに塞がず、本文の差分で「選んでいた行」を新しい本文の行に辿り、
// その行にある同じ種類の要素を選び直す (MA.selectionCarry)。辿れなければ選ばない。

var SC = require('./load-ma').loadMA().MA.selectionCarry;

describe('mapLine: 古い本文の行が新しい本文の何行目になったか', function() {
  var OLD = ['@startuml', 'component A', 'component B', 'A --> B', 'B --> A', '@enduml'].join('\n');

  test('本文が同じならその行', function() {
    expect(SC.mapLine(OLD, OLD, 4)).toBe(4);
  });

  test('その行だけを書き換えた (ラベル・名前の反映) ならその行', function() {
    var next = OLD.replace('A --> B', 'A --> B : uses');
    expect(SC.mapLine(OLD, next, 4)).toBe(4);
    var renamed = OLD.replace('component A', 'component "A" as A2');
    expect(SC.mapLine(OLD, renamed, 2)).toBe(2);
  });

  test('前に行が足されたら、ずれた分だけ動く', function() {
    var next = OLD.replace('component A', "' note\ncomponent A");
    expect(SC.mapLine(OLD, next, 4)).toBe(5);
    expect(SC.mapLine(OLD, next, 6)).toBe(7);
  });

  test('後ろに行が足されても動かない', function() {
    var next = OLD.replace('@enduml', 'C --> A\n@enduml');
    expect(SC.mapLine(OLD, next, 4)).toBe(4);
  });

  test('行を上へ動かしたら、動いた先の行 (並べ替え)', function() {
    var next = ['@startuml', 'component A', 'component B', 'B --> A', 'A --> B', '@enduml'].join('\n');
    expect(SC.mapLine(OLD, next, 5)).toBe(4);
    expect(SC.mapLine(OLD, next, 4)).toBe(5);
  });

  test('字下げだけ変えて別の所へ動いた行 (境界の中へ移す)', function() {
    var next = ['@startuml', 'component B', 'package P {', '  component A', '}', 'A --> B', 'B --> A', '@enduml'].join('\n');
    expect(SC.mapLine(OLD, next, 2)).toBe(4);
  });

  test('その行を消したら辿れない (null)', function() {
    var next = OLD.replace('A --> B\n', '');
    expect(SC.mapLine(OLD, next, 4)).toBe(null);
  });

  test('1 行を複数行に書き直したら、その塊の先頭の行', function() {
    var next = OLD.replace('A --> B', 'A --> B\nA ..> B');
    expect(SC.mapLine(OLD, next, 4)).toBe(4);
    var edited = OLD.replace('A --> B', 'A -> B\nA ..> B');
    expect(SC.mapLine(OLD, edited, 4)).toBe(4);
  });

  test('行数の変わる書き換えの塊の途中の行は辿れない (null)', function() {
    // 4・5 行目の 2 行を 3 行に書き直した: 5 行目 (塊の 2 行目) はどこになったか分からない
    var edited = OLD.replace('A --> B\nB --> A', 'A -> B\nX\nY');
    expect(SC.mapLine(OLD, edited, 4)).toBe(4);
    expect(SC.mapLine(OLD, edited, 5)).toBe(null);
  });

  test('範囲外・数でない行は null', function() {
    expect(SC.mapLine(OLD, OLD, 0)).toBe(null);
    expect(SC.mapLine(OLD, OLD, 99)).toBe(null);
    expect(SC.mapLine(OLD, OLD, 'x')).toBe(null);
  });

  test('CRLF の本文も行で数える', function() {
    var crlf = OLD.replace(/\n/g, '\r\n');
    expect(SC.mapLine(crlf, crlf.replace('A --> B', 'A --> B : x'), 4)).toBe(4);
  });
});

describe('carry: 反映の後の選択', function() {
  function compParsed(rels, elems) {
    return {
      elements: elems.map(function(e) { return { kind: 'component', id: e[0], line: e[1] }; }),
      relations: rels.map(function(r, i) { return { id: '__r_' + i, kind: 'dependency', line: r }; }),
      groups: [],
    };
  }
  var OLD = ['@startuml', 'component A', 'component B', 'A ..> B', 'B ..> A', '@enduml'].join('\n');
  var P0 = compParsed([4, 5], [['A', 2], ['B', 3]]);

  test('同じ id が同じ行に居れば keep (ラベルの反映)', function() {
    var next = OLD.replace('A ..> B', 'A ..> B : r1');
    var r = SC.carry([{ type: 'relation', id: '__r_0', line: 4 }], P0, OLD, compParsed([4, 5], [['A', 2], ['B', 3]]), next);
    expect(r).toEqual({ action: 'keep' });
  });

  test('名前を直して id が変わったら、同じ行の新しい id を選ぶ', function() {
    var next = OLD.replace('component A', 'component "A" as A2');
    var P1 = compParsed([4, 5], [['A2', 2], ['B', 3], ['A', 4]]);
    var r = SC.carry([{ type: 'component', id: 'A', line: 2 }], P0, OLD, P1, next);
    expect(r.action).toBe('set');
    expect(r.selection).toEqual([{ type: 'component', id: 'A2', line: 2 }]);
  });

  test('前に行が入って番号の id が別の関係を指すなら、動いた先の同じ関係を選ぶ', function() {
    var next = OLD.replace('A ..> B', 'A --> A\nA ..> B');
    var P1 = compParsed([4, 5, 6], [['A', 2], ['B', 3]]);
    var r = SC.carry([{ type: 'relation', id: '__r_1', line: 5 }], P0, OLD, P1, next);
    expect(r.action).toBe('set');
    expect(r.selection).toEqual([{ type: 'relation', id: '__r_2', line: 6 }]);
  });

  test('並べ替えで動いた関係を追う (番号が入れ替わる)', function() {
    var next = ['@startuml', 'component A', 'component B', 'B ..> A', 'A ..> B', '@enduml'].join('\n');
    var r = SC.carry([{ type: 'relation', id: '__r_1', line: 5 }], P0, OLD, compParsed([4, 5], [['A', 2], ['B', 3]]), next);
    expect(r.action).toBe('set');
    expect(r.selection).toEqual([{ type: 'relation', id: '__r_0', line: 4 }]);
  });

  test('選んでいた行が消えたら clear (押していない要素を選ばない)', function() {
    var next = OLD.replace('B ..> A\n', '');
    var r = SC.carry([{ type: 'relation', id: '__r_1', line: 5 }], P0, OLD, compParsed([4], [['A', 2], ['B', 3]]), next);
    expect(r).toEqual({ action: 'clear' });
  });

  test('辿った行に同じ種類の要素が無ければ clear', function() {
    var next = OLD.replace('component A', "' component A");
    var P1 = compParsed([4, 5], [['B', 3], ['A', 4]]);
    var r = SC.carry([{ type: 'component', id: 'A', line: 2 }], P0, OLD, P1, next);
    expect(r).toEqual({ action: 'clear' });
  });

  test('kind が選択の種類そのもののときは、同じ行の別の種類 (note) を選ばない', function() {
    var seqOld = ['@startuml', 'A -> B : hi', '@enduml'].join('\n');
    var seqNew = ['@startuml', 'note over A : hi', '@enduml'].join('\n');
    var p0 = { relations: [{ kind: 'message', id: 'm0', line: 2 }] };
    var p1 = { relations: [{ kind: 'note', id: 'n0', line: 2 }] };
    expect(SC.carry([{ type: 'message', id: 'm0', line: 2 }], p0, seqOld, p1, seqNew)).toEqual({ action: 'clear' });
  });

  test('関係の種別 (dependency → association) を変えても同じ関係のまま', function() {
    var next = OLD.replace('A ..> B', 'A --> B');
    var P1 = { elements: P0.elements, relations: [{ id: '__r_0', kind: 'association', line: 4 }, { id: '__r_1', kind: 'dependency', line: 5 }] };
    expect(SC.carry([{ type: 'relation', id: '__r_0', line: 4 }], P0, OLD, P1, next)).toEqual({ action: 'keep' });
  });

  test('一覧に無い種類の選択 (クラスのメンバー等) と複数選択はそのまま', function() {
    var next = OLD.replace('component A', 'component A2');
    expect(SC.carry([{ type: 'member', id: 'A::__m_0', line: 3 }], P0, OLD, P0, next)).toEqual({ action: 'keep' });
    expect(SC.carry([{ type: 'component', id: 'A', line: 2 }, { type: 'component', id: 'B', line: 3 }], P0, OLD, P0, next)).toEqual({ action: 'keep' });
    expect(SC.carry([], P0, OLD, P0, next)).toEqual({ action: 'keep' });
  });

  test('同じ id のまま行だけ動いたら line を直して set', function() {
    var next = OLD.replace('component A', "' c\ncomponent A");
    var P1 = compParsed([5, 6], [['A', 3], ['B', 4]]);
    var r = SC.carry([{ type: 'component', id: 'A', line: 2 }], P0, OLD, P1, next);
    expect(r.action).toBe('set');
    expect(r.selection).toEqual([{ type: 'component', id: 'A', line: 3 }]);
  });
});
