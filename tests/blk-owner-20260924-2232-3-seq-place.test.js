'use strict';
// BLK-owner-20260924-2232-3: シーケンス図の「追加する位置」。alt に else を足しても else 側へ
// メッセージを入れる手段がフォームに無かった。枠ごと・分岐ごとの候補の組み立てと、
// 選んだ分岐の末尾へ入ること、↑↓ が else・end を 1 段越えることを守る。
var W = (typeof window !== 'undefined' && window.MA) ? window : global.window;
var SP = W.MA.seqPlace;
var seq = W.MA.modules.plantumlSequence;

var ALT = [
  '@startuml',
  'participant App',
  'participant Drv',
  'App -> Drv : init',
  'alt 成功',
  '  Drv --> App : ok',
  'else 失敗',
  'end',
  '@enduml',
].join('\n');

function groupsOf(t) { return seq.parse(t).groups; }

describe('seqPlace.options — 枠ごと・分岐ごとの候補', function() {
  test('枠が無ければ「図の末尾」だけ', function() {
    var t = '@startuml\nA -> B : x\n@enduml';
    expect(SP.options(t, groupsOf(t))).toEqual([{ value: 'end', label: '図の末尾' }]);
  });

  test('alt は「の中」と else ごとの「else『条件』側」', function() {
    var labels = SP.options(ALT, groupsOf(ALT)).map(function(o) { return o.label; });
    expect(labels).toEqual(['図の末尾', 'alt『成功』の中', 'alt『成功』の else『失敗』側']);
  });

  test('条件の無い else は「else 側」、複数なら順番を添える', function() {
    var t = '@startuml\nalt a\nA -> B\nelse\nelse\nend\n@enduml';
    var labels = SP.options(t, groupsOf(t)).map(function(o) { return o.label; });
    expect(labels).toEqual(['図の末尾', 'alt『a』の中', 'alt『a』の else 側 (1 つ目)', 'alt『a』の else 側 (2 つ目)']);
  });

  test('入れ子は 外 › 内。内側の枠の else は外側の分岐に数えない', function() {
    var t = ['@startuml', 'loop 3 回', 'alt ok', 'A -> B', 'else ng', 'end', 'end', '@enduml'].join('\n');
    var labels = SP.options(t, groupsOf(t)).map(function(o) { return o.label; });
    expect(labels).toEqual(['図の末尾', 'loop『3 回』の中', 'loop『3 回』 › alt『ok』の中', 'loop『3 回』 › alt『ok』の else『ng』側']);
  });
});

describe('seqPlace.place — 選んだ分岐の末尾へ入る', function() {
  test('else 側: 末尾に足したメッセージが else と end の間に 1 段内側で入る', function() {
    var g = groupsOf(ALT);
    var after = seq.addMessage(ALT, 'Drv', 'App', '-->', 'error');
    var out = SP.place(ALT, after, g, 'g0:1');
    expect(out).toBe([
      '@startuml', 'participant App', 'participant Drv', 'App -> Drv : init',
      'alt 成功', '  Drv --> App : ok', 'else 失敗', '  Drv --> App : error', 'end', '@enduml',
    ].join('\n'));
  });

  test('alt 側 (の中): else の直前に入る', function() {
    var after = seq.addMessage(ALT, 'App', 'Drv', '->', 'retry');
    var out = SP.place(ALT, after, groupsOf(ALT), 'g0:0');
    var lines = out.split('\n');
    expect(lines.indexOf('  App -> Drv : retry')).toBe(lines.indexOf('else 失敗') - 1);
  });

  test('図の末尾はそのまま', function() {
    var after = seq.addMessage(ALT, 'App', 'Drv', '->', 'tail');
    expect(SP.place(ALT, after, groupsOf(ALT), 'end')).toBe(after);
  });

  test('ブロックも分岐の中へ入れ子で入る', function() {
    var after = seq.addGroup(ALT, 'loop', '再試行');
    var out = SP.place(ALT, after, groupsOf(ALT), 'g0:1');
    expect(out).toContain('else 失敗\n  loop 再試行\n\n  end\nend');
  });
});

describe('seqPlace.rememberElse — else を足した直後はその else 側が既定', function() {
  test('足した else の見出しが preferred になる', function() {
    var t = '@startuml\nalt 成功\nA -> B : ok\nend\n@enduml';
    var withElse = seq.insertElseIntoGroup(t, 2, 4, '失敗');
    var g = groupsOf(withElse);
    expect(SP.rememberElse(withElse, g, 2, 4)).toBe(true);
    expect(SP.preferred(withElse, g)).toBe('g0:1');
    SP.forget();
    expect(SP.preferred(withElse, g)).toBe('end');
  });
});

describe('moveMessageEx — else・end を 1 段越える / 越えられない理由', function() {
  test('↓ で else を越えると else 側の先頭へ', function() {
    var r = seq.moveMessageEx(ALT, 6, 1);
    expect(r.line).toBe(7);
    expect(r.text.split('\n').slice(4, 8)).toEqual(['alt 成功', 'else 失敗', '  Drv --> App : ok', 'end']);
  });

  test('↑ で alt の頭を越えると枠の外 (枠の字下げ) へ', function() {
    var r = seq.moveMessageEx(ALT, 6, -1);
    expect(r.line).toBe(5);
    expect(r.text.split('\n')[4]).toBe('Drv --> App : ok');
    expect(r.text.split('\n')[5]).toBe('alt 成功');
  });

  test('↑ で end を越えると最後の分岐の中へ', function() {
    var t = '@startuml\nalt a\nA -> B\nelse b\nend\nB -> A : back\n@enduml';
    var r = seq.moveMessageEx(t, 6, -1);
    expect(r.text).toBe('@startuml\nalt a\nA -> B\nelse b\n  B -> A : back\nend\n@enduml');
    expect(r.line).toBe(5);
  });

  test('注釈は越えず、理由を返す', function() {
    var t = '@startuml\nA -> B : first\nnote over A : remark\nA -> C : second\n@enduml';
    var r = seq.moveMessageEx(t, 4, -1);
    expect(r.line).toBe(-1);
    expect(r.text).toBe(t);
    expect(r.reason).toContain('注釈');
  });
});
