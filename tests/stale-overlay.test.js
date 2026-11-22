'use strict';
// TICKET-owner-20261116-0121-1 (data-loss): 本文を打った直後、描き直しが届く前に前の図の枠を押すと、
// 枠の順番の id が今の本文の別の要素に当たり、押していない行が書き換わっていた。
// 古い枠を押した回は、押した行の中身を憶えて、描き直した枠のうち同じ種類・同じ中身の行を選ぶ。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/stale-overlay.js')]; } catch (e) {}
require('../src/core/stale-overlay.js');
var SO = global.window.MA.staleOverlay;

var OLD = ['@startuml', 'A -> B : req', 'B --> A : res', '@enduml'].join('\n');
// 3 行目の後ではなく、req の前に ping を打った (順番の id が 1 つずれる)。
var NEW = ['@startuml', 'A -> B : ping', 'A -> B : req', 'B --> A : res', '@enduml'].join('\n');

describe('stale-overlay — 古い枠を押した回は、押した行を描き直した枠で引き当てる', function() {
  test('枠を作った本文と今の本文が違えば古い。まだ枠が無ければ古くない', function() {
    expect(SO.isStale(OLD, NEW)).toBe(true);
    expect(SO.isStale(OLD, OLD)).toBe(false);
    expect(SO.isStale(null, NEW)).toBe(false);
  });

  test('押した枠の行の中身を憶える (前の本文の行番号で引く)', function() {
    expect(SO.remember(OLD, 'message', 2)).toEqual({ type: 'message', line: 2, text: 'A -> B : req' });
    expect(SO.remember(OLD, 'message', 99)).toBe(null);
    expect(SO.remember(OLD, '', 2)).toBe(null);
  });

  test('前に行が入って順番がずれても、押した req の枠を選ぶ (同じ順番の ping を選ばない)', function() {
    var p = SO.remember(OLD, 'message', 2);
    var cands = [{ type: 'message', line: 2 }, { type: 'message', line: 3 }, { type: 'message', line: 4 }];
    expect(SO.pick(p, NEW, cands)).toBe(1);
  });

  test('同じ中身の行が 2 つあれば、元の行番号に近い方', function() {
    var old = ['@startuml', 'A -> B : x', 'B -> C : y', 'A -> B : x', '@enduml'].join('\n');
    var now = ['@startuml', 'A -> B : x', 'B -> C : y', 'C -> A : z', 'A -> B : x', '@enduml'].join('\n');
    var p = SO.remember(old, 'message', 4);
    var cands = [{ type: 'message', line: 2 }, { type: 'message', line: 3 }, { type: 'message', line: 4 }, { type: 'message', line: 5 }];
    expect(SO.pick(p, now, cands)).toBe(3);
  });

  test('押した行が書き換わって無くなった・種類が違うだけの枠しか無いときは選ばない', function() {
    var p = SO.remember(OLD, 'message', 2);
    var gone = OLD.replace('A -> B : req', 'A -> B : request');
    expect(SO.pick(p, gone, [{ type: 'message', line: 2 }, { type: 'message', line: 3 }])).toBe(-1);
    expect(SO.pick(p, NEW, [{ type: 'participant', line: 3 }])).toBe(-1);
  });

  test('字下げ・改行の書き方の違いでは外さない', function() {
    var p = SO.remember(OLD.replace(/\n/g, '\r\n'), 'message', 2);
    var now = NEW.replace('A -> B : req', '  A -> B : req');
    expect(SO.pick(p, now, [{ type: 'message', line: 3 }])).toBe(0);
  });
});
