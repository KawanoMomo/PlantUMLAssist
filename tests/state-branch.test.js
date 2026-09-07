'use strict';
// ランナーは全テストを 1 プロセスで動かす。global.window を差し替えると
// 先に読み込まれたモジュールが載っている window ごと消えるので、既にあれば使う。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/state-branch.js')]; } catch (e) {}
require('../src/core/state-branch.js');
var sb = global.window.MA.stateBranch;

var BASE = [
  '@startuml',
  '[*] --> Idle',
  'state Busy',
  'Idle --> Busy : Start',
  '@enduml',
].join('\n');

function spec(over) {
  var s = {
    source: 'Busy',
    trigger: 'Fault',
    choiceId: 'AnomalyCheck',
    branches: [
      { to: 'Error', guard: '重大' },
      { to: 'Idle', guard: '軽微' },
    ],
  };
  Object.keys(over || {}).forEach(function(k) { s[k] = over[k]; });
  return s;
}

describe('existingIds', function() {
  test('declared states と遷移の両端を拾う', function() {
    var ids = sb.existingIds(BASE);
    expect(ids.Busy).toBe(true);
    expect(ids.Idle).toBe(true);
  });

  test('[*] は state 名として拾わない', function() {
    expect(sb.existingIds(BASE)['[*]']).toBe(undefined);
  });

  test('エイリアス宣言は別名側を拾う', function() {
    var ids = sb.existingIds('@startuml\nstate "異常判定" as C1 <<choice>>\n@enduml');
    expect(ids.C1).toBe(true);
  });
});

describe('normalizeId', function() {
  test('ASCII 名はそのまま使う', function() {
    expect(sb.normalizeId('AnomalyCheck', BASE).id).toBe('AnomalyCheck');
  });

  test('日本語名は ASCII 別名 + label になる', function() {
    var n = sb.normalizeId('異常判定', BASE, 'C');
    expect(n.id).toBe('C1');
    expect(n.label).toBe('異常判定');
  });

  test('既存の別名とは衝突しない', function() {
    var n = sb.normalizeId('異常判定', '@startuml\nstate C1\n@enduml', 'C');
    expect(n.id).toBe('C2');
  });

  test('空文字は invalid', function() {
    expect(sb.normalizeId('  ', BASE).valid).toBe(false);
  });
});

describe('normalizeSpec', function() {
  test('遷移先が空の枝は落とす', function() {
    var s = sb.normalizeSpec(spec({ branches: [{ to: 'Error', guard: '重大' }, { to: '', guard: '軽微' }] }), BASE);
    expect(s.branches.length).toBe(1);
  });

  test('前後の空白を落とす', function() {
    var s = sb.normalizeSpec(spec({ trigger: '  Fault  ', branches: [{ to: ' Error ', guard: ' 重大 ' }] }), BASE);
    expect(s.trigger).toBe('Fault');
    expect(s.branches[0].to).toBe('Error');
    expect(s.branches[0].guard).toBe('重大');
  });

  test('null spec でも落ちない', function() {
    expect(sb.normalizeSpec(null, BASE).branches).toEqual([]);
  });
});

describe('validate', function() {
  test('choice 名 + 枝 2 本で ok', function() {
    expect(sb.validate(spec(), BASE).ok).toBe(true);
  });

  test('choice 名が無ければ ng', function() {
    var v = sb.validate(spec({ choiceId: '' }), BASE);
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toContain('choice');
  });

  test('枝が 1 本なら ng', function() {
    var v = sb.validate(spec({ branches: [{ to: 'Error', guard: '重大' }] }), BASE);
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toContain('2 本以上');
  });

  test('同じ遷移先とガードの重複を弾く', function() {
    var v = sb.validate(spec({ branches: [{ to: 'Error', guard: '重大' }, { to: 'Error', guard: '重大' }] }), BASE);
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toContain('重複');
  });

  test('ガード無しの枝は 1 本まで', function() {
    var v = sb.validate(spec({ branches: [{ to: 'Error', guard: '' }, { to: 'Idle', guard: '' }] }), BASE);
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toContain('else');
  });

  test('遷移先が同じでもガードが違えば ok', function() {
    var v = sb.validate(spec({ branches: [{ to: 'Idle', guard: '軽微' }, { to: 'Idle', guard: '無視' }] }), BASE);
    expect(v.ok).toBe(true);
  });
});

describe('preview', function() {
  test('choice 宣言・入口遷移・枝の順に並ぶ', function() {
    var lines = sb.preview(BASE, spec());
    expect(lines).toEqual([
      'state AnomalyCheck <<choice>>',
      'Busy --> AnomalyCheck : Fault',
      'AnomalyCheck --> Error : [重大]',
      'AnomalyCheck --> Idle : [軽微]',
    ]);
  });

  test('choice が宣言済みなら宣言行を出さない', function() {
    var text = '@startuml\nstate AnomalyCheck <<choice>>\n@enduml';
    var lines = sb.preview(text, spec());
    expect(lines[0]).toBe('Busy --> AnomalyCheck : Fault');
  });

  test('日本語 choice 名はエイリアス宣言になる', function() {
    var lines = sb.preview(BASE, spec({ choiceId: '異常判定' }));
    expect(lines[0]).toBe('state "異常判定" as C1 <<choice>>');
    expect(lines[1]).toBe('Busy --> C1 : Fault');
  });

  test('source が空なら入口遷移を出さない', function() {
    var lines = sb.preview(BASE, spec({ source: '' }));
    expect(lines[1]).toBe('AnomalyCheck --> Error : [重大]');
  });

  test('trigger が空なら入口遷移はラベル無し', function() {
    var lines = sb.preview(BASE, spec({ trigger: '' }));
    expect(lines[1]).toBe('Busy --> AnomalyCheck');
  });

  test('action は / 付きで guard の後に付く', function() {
    var lines = sb.preview(BASE, spec({ branches: [{ to: 'Error', guard: '重大', action: 'notify()' }] }));
    expect(lines[2]).toBe('AnomalyCheck --> Error : [重大] / notify()');
  });

  test('ガード無しの枝はラベル無しの遷移になる', function() {
    var lines = sb.preview(BASE, spec({ branches: [{ to: 'Idle', guard: '' }] }));
    expect(lines[2]).toBe('AnomalyCheck --> Idle');
  });

  test('[*] を遷移先にできる', function() {
    var lines = sb.preview(BASE, spec({ branches: [{ to: '[*]', guard: '致命' }] }));
    expect(lines[2]).toBe('AnomalyCheck --> [*] : [致命]');
  });

  test('枝が 0 本なら何も出さない', function() {
    expect(sb.preview(BASE, spec({ branches: [] }))).toEqual([]);
  });
});

describe('apply', function() {
  test('@enduml の直前にまとめて挿入する', function() {
    var out = sb.apply(BASE, spec());
    var lines = out.split('\n');
    expect(lines[lines.length - 1]).toBe('@enduml');
    expect(lines[lines.length - 5]).toBe('state AnomalyCheck <<choice>>');
    expect(lines[lines.length - 2]).toBe('AnomalyCheck --> Idle : [軽微]');
  });

  test('既存行を壊さない', function() {
    var out = sb.apply(BASE, spec());
    expect(out).toContain('Idle --> Busy : Start');
    expect(out).toContain('[*] --> Idle');
  });

  test('枝が 0 本なら text をそのまま返す', function() {
    expect(sb.apply(BASE, spec({ branches: [] }))).toBe(BASE);
  });

  test('@enduml が無い DSL でも有効な DSL を返す', function() {
    var out = sb.apply('@startuml\nstate Busy', spec());
    expect(out).toContain('@enduml');
    expect(out).toContain('AnomalyCheck --> Error : [重大]');
  });

  test('空文字からでも @startuml/@enduml を補う', function() {
    var out = sb.apply('', spec());
    expect(out.split('\n')[0]).toBe('@startuml');
    expect(out).toContain('state AnomalyCheck <<choice>>');
  });

  test('2 回適用しても choice 宣言は 1 行だけ', function() {
    var once = sb.apply(BASE, spec());
    var twice = sb.apply(once, spec({ branches: [{ to: 'Halt', guard: '致命' }, { to: 'Idle', guard: '無視' }] }));
    var decls = twice.split('\n').filter(function(l) { return l.indexOf('<<choice>>') >= 0; });
    expect(decls.length).toBe(1);
  });
});

// BLK-junior-20260907-0803: 枝の一括入力と、置き換え元の直接遷移の自動削除。
describe('stateBranch.parseBranchLines — 1 行 1 枝', function() {
  test('ガード -> 遷移先 / アクション を読む', function() {
    expect(sb.parseBranchLines('重大 -> Error / notify'))
      .toEqual([{ guard: '重大', to: 'Error', action: 'notify' }]);
  });
  test('複数行を枝の並びにする', function() {
    expect(sb.parseBranchLines('重大 -> Error\n軽微 -> Idle'))
      .toEqual([{ guard: '重大', to: 'Error', action: '' }, { guard: '軽微', to: 'Idle', action: '' }]);
  });
  test('ガードを省くと else の枝になる', function() {
    expect(sb.parseBranchLines('-> Idle')).toEqual([{ guard: '', to: 'Idle', action: '' }]);
  });
  test('矢印を省くと遷移先だけの枝になる', function() {
    expect(sb.parseBranchLines('Idle')).toEqual([{ guard: '', to: 'Idle', action: '' }]);
  });
  test('→ や => も矢印として読む', function() {
    expect(sb.parseBranchLines('重大 → Error')[0].to).toBe('Error');
    expect(sb.parseBranchLines('重大 => Error')[0].to).toBe('Error');
  });
  test('空行と # の行は読み飛ばす', function() {
    expect(sb.parseBranchLines('\n# メモ\n重大 -> Error\n').length).toBe(1);
  });
  test('空文字は枝なし', function() {
    expect(sb.parseBranchLines('')).toEqual([]);
  });
});

describe('stateBranch.formatBranchLines', function() {
  test('行に戻す (往復する)', function() {
    var src = '重大 -> Error / notify\n軽微 -> Idle';
    expect(sb.formatBranchLines(sb.parseBranchLines(src))).toBe(src);
  });
  test('空の枝は行にしない', function() {
    expect(sb.formatBranchLines([{ guard: '', to: '', action: '' }, { to: 'Idle' }])).toBe('-> Idle');
  });
});

describe('stateBranch.triggerOf', function() {
  test('ガードとアクションを落としてトリガー名だけにする', function() {
    expect(sb.triggerOf('Fault [重大] / notify')).toBe('Fault');
    expect(sb.triggerOf('Fault')).toBe('Fault');
    expect(sb.triggerOf('')).toBe('');
  });
});

describe('stateBranch.replacedTransitions — 二重経路を残さない', function() {
  var T = [
    '@startuml',
    '[*] --> Idle',
    'Idle --> Busy : Start',
    'Busy --> Error : Fault',
    '@enduml',
  ].join('\n');
  var SPEC = {
    source: 'Busy', trigger: 'Fault', choiceId: 'AnomalyCheck',
    branches: [{ guard: '重大', to: 'Error' }, { guard: '軽微', to: 'Idle' }],
  };

  test('同じ遷移元・同じトリガーの直接遷移を挙げる', function() {
    var r = sb.replacedTransitions(T, SPEC);
    expect(r.length).toBe(1);
    expect(r[0].line).toBe(4);
    expect(r[0].text).toBe('Busy --> Error : Fault');
  });
  test('トリガーが違えば残す', function() {
    var spec = { source: 'Busy', trigger: 'Reset', choiceId: 'C', branches: [{ to: 'Idle' }, { guard: 'x', to: 'Error' }] };
    expect(sb.replacedTransitions(T, spec)).toEqual([]);
  });
  test('遷移元が違えば残す', function() {
    var spec = { source: 'Idle', trigger: 'Fault', choiceId: 'C', branches: [{ to: 'Idle' }, { guard: 'x', to: 'Error' }] };
    expect(sb.replacedTransitions(T, spec)).toEqual([]);
  });
  test('トリガーを入れていなければ何も消さない', function() {
    var spec = { source: 'Busy', trigger: '', choiceId: 'C', branches: [{ to: 'Idle' }, { guard: 'x', to: 'Error' }] };
    expect(sb.replacedTransitions(T, spec)).toEqual([]);
  });
  test('ガード付きの既存遷移も同じトリガーなら消す対象になる', function() {
    var t2 = T.replace('Busy --> Error : Fault', 'Busy --> Error : Fault [重大] / log');
    expect(sb.replacedTransitions(t2, SPEC).length).toBe(1);
  });

  test('apply は直接遷移を消してから分岐を足す', function() {
    var out = sb.apply(T, SPEC);
    expect(out).not.toContain('Busy --> Error : Fault\n');
    expect(out).toContain('state AnomalyCheck <<choice>>');
    expect(out).toContain('Busy --> AnomalyCheck : Fault');
    expect(out).toContain('AnomalyCheck --> Error : [重大]');
    expect(out).toContain('AnomalyCheck --> Idle : [軽微]');
    // 関係の無い行は残る
    expect(out).toContain('Idle --> Busy : Start');
  });

  test('apply は消す対象が無くても今までどおり足すだけ', function() {
    var t3 = T.replace('Busy --> Error : Fault\n', '');
    var out = sb.apply(t3, SPEC);
    expect(out).toContain('Busy --> AnomalyCheck : Fault');
    expect(out.split('\n').length).toBe(t3.split('\n').length + 4);
  });
});
