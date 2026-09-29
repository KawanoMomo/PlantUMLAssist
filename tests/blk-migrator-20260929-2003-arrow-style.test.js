'use strict';
// BLK-migrator-20260929-2003: 矢印の線の中の書式 `[…]` (#色・bold・dashed・thickness=N をカンマで並べたもの) を、
// sequence のメッセージ・state の遷移・class / component / usecase の関係が同じ 1 か所 (regex-parts) で読む。
// 書き戻し (色・線種を替える) は `[]` の中の他の語を残し、無変更ならバイト一致のまま。

var W = (typeof window !== 'undefined') ? window : global.window;
var RP = W.MA.regexParts;
var seq = W.MA.modules.plantumlSequence;
var st = W.MA.modules.plantumlState;
var RO = W.MA.relationOptions;

function doc(lines) { return ['@startuml'].concat(lines).concat(['@enduml']).join('\n'); }
function msgs(text) {
  return seq.parse(text).relations.filter(function(r) { return r.kind === 'message'; })
    .map(function(r) { return r.from + ' ' + r.arrow + ' ' + r.to + ' : ' + r.label + ' @' + r.line; });
}

describe('regex-parts: 書式の読み書き', function() {
  test('語を読む・色を読む・書式を外す', function() {
    expect(RP.arrowStyle('-[#red,bold]->')).toEqual(['#red', 'bold']);
    expect(RP.arrowStyle('->')).toEqual([]);
    expect(RP.arrowStyleColor('-[bold,#blue]->')).toBe('blue');
    expect(RP.arrowStyleColor('-[dashed]>')).toBe('');
    expect(RP.stripArrowStyle('--[#green]>')).toBe('-->');
  });
  test('色を替えても他の語と置き場所は残る', function() {
    expect(RP.setArrowStyleColor('-[#red,bold]>', 'blue')).toBe('-[#blue,bold]>');
    expect(RP.setArrowStyleColor('-[#red,bold]>', '')).toBe('-[bold]>');
    expect(RP.setArrowStyleColor('-[bold]>', 'red')).toBe('-[#red,bold]>');
    expect(RP.setArrowStyleColor('--[#green]>', 'blue')).toBe('--[#blue]>');
    expect(RP.setArrowStyleColor('-[#red]>', '')).toBe('->');
    expect(RP.setArrowStyleColor('->', 'red')).toBe('-[#red]>');
  });
  test('形を選び直すと元の書式を運ぶ (選んだ形の色が優先)', function() {
    expect(RP.carryArrowStyle('-->', '-[#red,bold]>')).toBe('-[#red,bold]->');
    expect(RP.carryArrowStyle('-[#blue]>', '-[#red,bold]>')).toBe('-[#blue,bold]>');
    expect(RP.carryArrowStyle('->', '->')).toBe('->');
  });
});

describe('sequence: 書式付きの矢印をメッセージとして読む', function() {
  test('最小再現 4 通りがどれも 1 本のメッセージになる', function() {
    expect(msgs(doc(['A -[bold]> B : 太']))).toEqual(['A -[bold]> B : 太 @2']);
    expect(msgs(doc(['A -[dashed]> B : 破']))).toEqual(['A -[dashed]> B : 破 @2']);
    expect(msgs(doc(['A -[#red,bold]> B : 赤太']))).toEqual(['A -[#red,bold]> B : 赤太 @2']);
    expect(msgs(doc(['A -> B : x', 'B --[#green]> A : 残数']))).toEqual(['A -> B : x @2', 'B --[#green]> A : 残数 @3']);
  });
  test('書式だけの図でも参加者が読まれる', function() {
    var p = seq.parse(doc(['A -[bold]> B : 太']));
    expect(p.elements.filter(function(e) { return e.kind === 'participant'; }).map(function(e) { return e.id; })).toEqual(['A', 'B']);
  });
  test('逆向き・帯の略記・図の外とも併せて読める', function() {
    expect(msgs(doc(['A <-[#red,dashed]- B : r', 'A -[thickness=3]> B++ : act', '[-[bold]> A : in'])))
      .toEqual(['A <-[#red,dashed]- B : r @2', 'A -[thickness=3]> B : act @3', '[ -[bold]> A : in @4']);
  });
  test('一覧に無い形の矢印の行も、参加者と 1 本のメッセージとして数える (読めない 1 行で他を止めない)', function() {
    var p = seq.parse(doc(['A o->o B : 丸', 'A -> B : x']));
    expect(p.elements.filter(function(e) { return e.kind === 'participant'; }).map(function(e) { return e.id; })).toEqual(['A', 'B']);
    expect(msgs(doc(['A o->o B : 丸', 'A -> B : x']))).toEqual(['A o->o B : 丸 @2', 'A -> B : x @3']);
  });
  test('矢印でない行は拾わない', function() {
    expect(msgs(doc(['participant A', 'participant B', 'A -- B', 'title A-B C', 'A -> B : ok']))).toEqual(['A -> B : ok @6']);
  });
  test('色を替えても bold は残る・形を替えても書式は残る', function() {
    var t = doc(['A -[#red,bold]> B : x']);
    expect(seq.setMessageColor(t, 2, 'blue').split('\n')[1]).toBe('A -[#blue,bold]> B : x');
    expect(seq.setMessageColor(t, 2, '').split('\n')[1]).toBe('A -[bold]> B : x');
    expect(seq.messageColor(t, 2)).toBe('red');
    expect(seq.applyArrowSpec(t, 2, '-->').split('\n')[1]).toBe('A -[#red,bold]-> B : x');
    expect(seq.updateMessage(doc(['B --[#green]> A : 残数']), 2, 'label', '残').split('\n')[1]).toBe('B --[#green]> A : 残');
  });
});

describe('state: 遷移の書式', function() {
  test('色の位置・語の並びによらず遷移として読み、色を取る', function() {
    var p = st.parse(doc(['A -[bold,#red]-> B', 'B -[dashed]up-> C', 'C -[#blue]right-> A : go']));
    expect(p.transitions.map(function(t) { return t.from + '>' + t.to + ':' + t.color; })).toEqual(['A>B:red', 'B>C:', 'C>A:blue']);
  });
  test('色を替えても bold と向きは残る', function() {
    var t = doc(['A -[#red,bold]up-> B : e']);
    expect(st.updateTransition(t, 2, { color: 'blue' }).split('\n')[1]).toBe('A -[#blue,bold]up-> B : e');
    expect(st.updateTransition(t, 2, { trigger: 'f' }).split('\n')[1]).toBe('A -[#red,bold]up-> B : f');
  });
});

describe('class 系: 関係の書式', function() {
  test('書式付きの矢印を関係行として読む', function() {
    expect(RO.isArrow('-[#red,bold]->')).toBe(true);
    expect(RO.isArrow('-[hidden]-')).toBe(true);
    expect(RO.isArrow('.[dotted].>')).toBe(true);
    expect(RO.plainLine('A -[#red,bold]-> B : x')).toBe('A --> B : x');
  });
  test('色を替えても他の語が残り、種別の書き換えでも書式が落ちない', function() {
    expect(RO.lineColor('A -[bold,#red]-> B')).toBe('red');
    expect(RO.setLineColor('A -[#red,bold]-> B', 'blue')).toBe('A -[#blue,bold]-> B');
    expect(RO.setLineColor('A -[#red,bold]-> B', '')).toBe('A -[bold]-> B');
    var deco = RO.decorationsOf('A -[#red,thickness=2]up-> B');
    expect(RO.applyDecorations('A --> B', deco)).toBe('A -[#red,thickness=2]up-> B');
  });
  test('class 図の関係として読まれる', function() {
    var cls = W.MA.modules.plantumlClass;
    var p = cls.parse(doc(['class A', 'class B', 'A -[#red,bold]-> B : uses']));
    expect(p.relations.length).toBe(1);
  });
});
