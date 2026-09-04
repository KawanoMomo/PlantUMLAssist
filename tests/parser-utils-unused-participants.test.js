'use strict';
// FEAT-177 (resolves HFR-042): findUnusedParticipants(parsed) の単体テスト。
// 入力は sequence モジュールの parseSequence(text) の返り値と同じ形のオブジェクトであり、
// DOM / SVG / overlay / 選択状態を一切要さない (検証層 E1 のみ)。
var parserUtils = (typeof window !== 'undefined' && window.MA && window.MA.parserUtils)
  || (global.window && global.window.MA && global.window.MA.parserUtils);

function part(id, line) {
  return { kind: 'participant', id: id, label: id, ptype: 'participant', line: line };
}
function msg(from, to, line) {
  return { kind: 'message', id: '__m_' + line, from: from, to: to, arrow: '->', label: 'm', line: line };
}

describe('findUnusedParticipants (FEAT-177)', function() {
  test('[AC-1] all participants referenced by a message -> empty array', function() {
    var parsed = { elements: [part('A', 2), part('B', 3)], relations: [msg('A', 'B', 4)] };
    expect(parserUtils.findUnusedParticipants(parsed)).toEqual([]);
  });

  test('[AC-2] a participant no message refers to is reported', function() {
    var parsed = {
      elements: [part('A', 2), part('B', 3), part('C', 4)],
      relations: [msg('A', 'B', 5)],
    };
    var out = parserUtils.findUnusedParticipants(parsed);
    expect(out.length).toBe(1);
    expect(out[0].id).toBe('C');
  });

  test('[AC-3] a participant used only by an activation is NOT unused', function() {
    var parsed = {
      elements: [
        part('A', 2), part('B', 3), part('C', 4),
        { kind: 'activation', action: 'activate', target: 'C', line: 6 },
      ],
      relations: [msg('A', 'B', 5)],
    };
    expect(parserUtils.findUnusedParticipants(parsed)).toEqual([]);
  });

  test('[AC-4] a participant used only by a note target is NOT unused', function() {
    var parsed = {
      elements: [
        part('A', 2), part('B', 3), part('C', 4),
        { kind: 'note', id: '__n_1', position: 'over', targets: ['C'], line: 6 },
      ],
      relations: [msg('A', 'B', 5)],
    };
    expect(parserUtils.findUnusedParticipants(parsed)).toEqual([]);
  });

  test('[AC-5] returned elements are the original participant objects (id/label/ptype/line intact)', function() {
    var c = { kind: 'participant', id: 'C', label: 'Cache', ptype: 'database', line: 4 };
    var parsed = { elements: [part('A', 2), part('B', 3), c], relations: [msg('A', 'B', 5)] };
    var out = parserUtils.findUnusedParticipants(parsed);
    expect(out.length).toBe(1);
    expect(out[0]).toBe(c);
    expect(out[0].id).toBe('C');
    expect(out[0].label).toBe('Cache');
    expect(out[0].ptype).toBe('database');
    expect(out[0].line).toBe(4);
  });

  test('[AC-6] order follows the order in parsed.elements', function() {
    var parsed = {
      elements: [part('X', 2), part('A', 3), part('Y', 4), part('B', 5), part('Z', 6)],
      relations: [msg('A', 'B', 7)],
    };
    var out = parserUtils.findUnusedParticipants(parsed);
    expect(out.map(function(p) { return p.id; })).toEqual(['X', 'Y', 'Z']);
  });

  test('[AC-7] null / {} / {elements: []} do not throw and return []', function() {
    expect(function() { parserUtils.findUnusedParticipants(null); }).not.toThrow();
    expect(parserUtils.findUnusedParticipants(null)).toEqual([]);
    expect(parserUtils.findUnusedParticipants({})).toEqual([]);
    expect(parserUtils.findUnusedParticipants({ elements: [] })).toEqual([]);
    expect(parserUtils.findUnusedParticipants({ elements: [part('A', 2)] })).toEqual([part('A', 2)]);
  });

  test('[AC-8] surrounding whitespace in from/to still counts as a reference', function() {
    var parsed = {
      elements: [part('A', 2), part('B', 3)],
      relations: [msg(' A ', ' B ', 4)],
    };
    expect(parserUtils.findUnusedParticipants(parsed)).toEqual([]);
  });

  test('[AC-9] the argument object is not mutated', function() {
    var parsed = {
      elements: [part('A', 2), part('B', 3), part('C', 4),
        { kind: 'activation', action: 'activate', target: 'A', line: 6 }],
      relations: [msg('A', 'B', 5)],
    };
    var snapshot = JSON.stringify(parsed);
    parserUtils.findUnusedParticipants(parsed);
    expect(JSON.stringify(parsed)).toBe(snapshot);
    expect(parsed.elements.length).toBe(4);
    expect(parsed.relations.length).toBe(1);
  });

  test('non-message relations are ignored when marking usage', function() {
    var parsed = {
      elements: [part('A', 2), part('B', 3)],
      relations: [{ kind: 'other', from: 'A', to: 'B', line: 4 }],
    };
    var out = parserUtils.findUnusedParticipants(parsed);
    expect(out.map(function(p) { return p.id; })).toEqual(['A', 'B']);
  });
});
