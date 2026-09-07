'use strict';
// BLK-builder-20260907-1410-3 / design 5d 網羅表「Sequence のその他パレット: 線色」。
//
// 仕様: UseCase / Component / Class と同じ 6 色 (既定 / 赤 / 橙 / 緑 / 青 / 紫) を
// メッセージにも出す。色は矢印の形 (`-->` `->>` `->x` …) を壊さずに差し替え、
// DSL からは読み戻せる。片羽根 `->\` だけは PlantUML が色付き記法を受け付けない。

var seq = (typeof window !== 'undefined' && window.MA && window.MA.modules && window.MA.modules.plantumlSequence)
  || (global.window && global.window.MA && global.window.MA.modules && global.window.MA.modules.plantumlSequence);

var HALF = '->' + String.fromCharCode(92);   // ->\

var BASE = [
  '@startuml',
  'actor User',
  'participant System',
  'User -> System : Request',
  'System --> User : Response',
  '@enduml',
].join('\n');

describe('色見本の品揃え', function() {
  test('他図種と同じ 6 色が並ぶ', function() {
    var vals = seq.lineColors().map(function(c) { return c.value; });
    expect(vals).toEqual(['', 'red', 'orange', 'green', 'blue', 'violet']);
  });
});

describe('矢印トークンへの色の付け外し', function() {
  test('形を保ったまま色だけ載る', function() {
    expect(seq.setArrowColor('->', 'red')).toBe('-[#red]>');
    expect(seq.setArrowColor('-->', 'blue')).toBe('-[#blue]->');
    expect(seq.setArrowColor('->>', 'green')).toBe('-[#green]>>');
    expect(seq.setArrowColor('->x', 'orange')).toBe('-[#orange]>x');
    expect(seq.setArrowColor('<--', 'violet')).toBe('<-[#violet]-');
  });

  test('既定 (空) を選ぶと色が外れる', function() {
    expect(seq.setArrowColor('-[#red]->', '')).toBe('-->');
    expect(seq.setArrowColor('-[#red]>', '')).toBe('->');
  });

  test('色を選び直しても二重にならない', function() {
    expect(seq.setArrowColor(seq.setArrowColor('-->', 'red'), 'blue')).toBe('-[#blue]->');
  });

  test('先頭の # は落として書く', function() {
    expect(seq.setArrowColor('->', '#red')).toBe('-[#red]>');
  });

  test('片羽根は色を付けられない', function() {
    expect(seq.arrowSupportsColor(HALF)).toBe(false);
    expect(seq.setArrowColor(HALF, 'red')).toBe(HALF);
    expect(seq.arrowSupportsColor('-->')).toBe(true);
  });

  test('色を読み取る / 形だけ取り出す', function() {
    expect(seq.arrowColor('-[#red]->')).toBe('red');
    expect(seq.arrowColor('-->')).toBe('');
    expect(seq.stripArrowColor('-[#red]->')).toBe('-->');
    expect(seq.stripArrowColor('<-[#violet]-')).toBe('<--');
  });
});

describe('メッセージ行の線色', function() {
  test('行に色を付けて読み戻せる', function() {
    var out = seq.setMessageColor(BASE, 4, 'red');
    expect(out.split('\n')[3]).toBe('User -[#red]> System : Request');
    expect(seq.messageColor(out, 4)).toBe('red');
    expect(seq.messageColor(BASE, 4)).toBe('');
  });

  test('破線の応答も形を保つ', function() {
    var out = seq.setMessageColor(BASE, 5, 'blue');
    expect(out.split('\n')[4]).toBe('System -[#blue]-> User : Response');
  });

  test('色を外すと元の行に戻る', function() {
    var out = seq.setMessageColor(seq.setMessageColor(BASE, 4, 'green'), 4, '');
    expect(out).toBe(BASE);
  });

  test('メッセージでない行は変えない', function() {
    expect(seq.setMessageColor(BASE, 2, 'red')).toBe(BASE);
  });
});

describe('色付きの行を図として読める', function() {
  test('parse がメッセージとして拾う', function() {
    var out = seq.setMessageColor(BASE, 4, 'red');
    var parsed = seq.parse(out);
    var msgs = parsed.relations.filter(function(r) { return r.kind === 'message'; });
    expect(msgs.length).toBe(2);
    expect(msgs[0].from).toBe('User');
    expect(msgs[0].to).toBe('System');
    expect(msgs[0].label).toBe('Request');
  });

  test('本文や端点の編集で色が落ちない', function() {
    var out = seq.setMessageColor(BASE, 4, 'red');
    out = seq.updateMessage(out, 4, 'label', 'Retry');
    expect(out.split('\n')[3]).toBe('User -[#red]> System : Retry');
    expect(seq.messageColor(out, 4)).toBe('red');
  });
});

describe('形を選び直しても色は残る', function() {
  test('分節ボタン (色を持たない矢印) は色を引き継ぐ', function() {
    var out = seq.setMessageColor(BASE, 4, 'red');
    out = seq.applyArrowSpec(out, 4, '->>');
    expect(out.split('\n')[3]).toBe('User -[#red]>> System : Request');
  });

  test('パレットの「線の色を変える」は従来どおり赤にする', function() {
    var out = seq.applyArrowSpec(BASE, 4, '-[#red]>');
    expect(seq.messageColor(out, 4)).toBe('red');
  });

  test('色の付いた矢印でも現在の形をパレットに戻せる', function() {
    var out = seq.setMessageColor(BASE, 5, 'blue');
    var arrow = out.split('\n')[4].match(/-\[#blue\]->/)[0];
    expect(seq.activeArrowKey('System', 'User', seq.stripArrowColor(arrow))).toBe('-->');
  });
});
