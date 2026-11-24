'use strict';
// TICKET-owner-20261123-0202-1: シーケンス図で選んだメッセージの前・後に足す 1 行は、
// 押した行と同じ行頭の空白 (スペース・タブの字のまま) で入る。字下げの無い図では今と同じ字。
var seq = (typeof window !== 'undefined' && window.MA && window.MA.modules && window.MA.modules.plantumlSequence)
  || (global.window && global.window.MA && global.window.MA.modules && global.window.MA.modules.plantumlSequence);

var ALT = [
  '@startuml',
  'participant Bus',
  'participant Drv',
  'participant Mon',
  'alt ok',
  '    Bus --> Drv : ready',
  'else ng',
  '    Bus --> Drv : fail',
  'end',
  '@enduml',
].join('\n');

var MSG = { from: 'Mon', to: 'Drv', label: 'status' };

// 元の行を順に辿り、足された行だけを返す (挿入だけの差分を前提)。元の行が欠けたら null。
function addedLines(before, after) {
  var a = before.split('\n'), b = after.split('\n'), out = [], i = 0;
  for (var j = 0; j < b.length; j++) {
    if (i < a.length && a[i] === b[j]) i++;
    else out.push(b[j]);
  }
  return i === a.length ? out : null;
}

describe('sequence insert keeps the pressed line indent (TICKET-owner-20261123-0202-1)', function() {
  test('after a 4-space indented message inside alt', function() {
    var out = seq.insertAfter(ALT, 6, 'message', MSG);
    expect(out.split('\n')[6]).toBe('    Mon -> Drv : status');
    expect(addedLines(ALT, out)).toEqual(['    Mon -> Drv : status']);
  });

  test('before a 4-space indented message inside alt', function() {
    var out = seq.insertBefore(ALT, 6, 'message', MSG);
    expect(out.split('\n')[5]).toBe('    Mon -> Drv : status');
    expect(out.split('\n')[6]).toBe('    Bus --> Drv : ready');
    expect(addedLines(ALT, out)).toEqual(['    Mon -> Drv : status']);
  });

  test('after a tab-indented message keeps the tab character', function() {
    var t = ALT.replace('    Bus --> Drv : fail', '\tBus --> Drv : fail');
    var out = seq.insertAfter(t, 8, 'message', MSG);
    expect(out.split('\n')[8]).toBe('\tMon -> Drv : status');
    expect(addedLines(t, out)).toEqual(['\tMon -> Drv : status']);
  });

  test('unindented diagram: inserted line is unchanged (no leading space)', function() {
    var t = '@startuml\nBus -> Drv : a\nBus -> Drv : b\n@enduml';
    expect(seq.insertAfter(t, 2, 'message', MSG)).toBe('@startuml\nBus -> Drv : a\nMon -> Drv : status\nBus -> Drv : b\n@enduml');
    expect(seq.insertBefore(t, 2, 'message', MSG)).toBe('@startuml\nMon -> Drv : status\nBus -> Drv : a\nBus -> Drv : b\n@enduml');
  });

  test('note / separator from the same insert window also take the indent', function() {
    var n = seq.insertAfter(ALT, 6, 'note', { position: 'right of', targets: ['Drv'], text: 'memo' });
    var added = addedLines(ALT, n);
    expect(added.length).toBe(1);
    expect(added[0].indexOf('    note ')).toBe(0);
    var s = seq.insertBefore(ALT, 8, 'separator', { text: 'retry' });
    var addedS = addedLines(ALT, s);
    expect(addedS.length).toBe(1);
    expect(addedS[0].indexOf('    ==')).toBe(0);
  });

  test('duplicateMessage copies with the same indent', function() {
    var out = seq.duplicateMessage(ALT, 6);
    expect(addedLines(ALT, out)).toEqual(['    Bus --> Drv : ready']);
  });

  test('insert window confirm path (no band) indents like the pressed line', function() {
    var fn = seq.activationAwareInsertFn(ALT, 6, 'after', 'message', null);
    var out = fn(ALT, 6, 'message', MSG);
    expect(addedLines(ALT, out)).toEqual(['    Mon -> Drv : status']);
    var fnB = seq.activationAwareInsertFn(ALT, 6, 'before', 'message', null);
    var outB = fnB(ALT, 6, 'message', MSG);
    expect(outB.split('\n')[5]).toBe('    Mon -> Drv : status');
  });

  test('insert window confirm path moved past a band uses the indent of the line it lands under', function() {
    var t = [
      '@startuml',
      'alt ok',
      '    A -> B : req',
      '    activate B',
      '    B --> A : res',
      '    deactivate B',
      'end',
      '@enduml',
    ].join('\n');
    var fn = seq.activationAwareInsertFn(t, 3, 'after', 'message', null);
    var out = fn(t, 3, 'message', { from: 'A', to: 'B', label: 'x' });
    var added = addedLines(t, out);
    expect(added).toEqual(['    A -> B : x']);
  });

  test('closing an unterminated band: deactivate and message both take the indent', function() {
    var t = [
      '@startuml',
      'alt ok',
      '    A -> B : req',
      '    activate B',
      '    B --> A : res',
      'end',
      '@enduml',
    ].join('\n');
    var fn = seq.activationAwareInsertFn(t, 5, 'after', 'message', { zone: 'outside', bandLine: 4 });
    var out = fn(t, 5, 'message', { from: 'A', to: 'B', label: 'x' });
    var added = addedLines(t, out);
    expect(added.length).toBeGreaterThan(0);
    added.forEach(function(l) { expect(l.indexOf('    ')).toBe(0); });
  });
});
