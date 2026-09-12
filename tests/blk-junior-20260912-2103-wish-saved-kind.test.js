'use strict';
// BLK-junior-20260912-2103-wish: 保存済みの図種をそのまま復元して開く。
// これまでは開くたびに本文から図種を当て直していたので、シーケンスに `actor` と
// 括弧付きのラベルがあるだけでユースケース扱いになり、図種を選び直して本文を
// 貼り直す遠回りが要った。保存したときの図種を控え、それがあれば判定より優先する。
const K = window.MA.savedKind;

describe('savedKind — 図種の slug と図種名の行き来', function() {
  test('diagramType から slug', function() {
    expect(K.slugOf('plantuml-sequence')).toBe('sequence');
    expect(K.slugOf('plantuml-activity')).toBe('activity');
    expect(K.slugOf('')).toBe('');
    expect(K.slugOf(null)).toBe('');
    expect(K.slugOf('plantuml-unknown')).toBe('');
  });

  test('slug から diagramType', function() {
    expect(K.typeOf('sequence')).toBe('plantuml-sequence');
    expect(K.typeOf('class')).toBe('plantuml-class');
    expect(K.typeOf('nope')).toBe('');
    expect(K.typeOf(null)).toBe('');
  });
});

describe('savedKind — 一覧の行に出す印', function() {
  test('図種ごとに印と名前が付く', function() {
    var b = K.badge('sequence');
    expect(b.label).toBe('シーケンス');
    expect(b.mark.length > 0).toBe(true);
    expect(b.title.indexOf('シーケンス') > -1).toBe(true);
    // 前回保存した図種のまま開くことが分かる説明であること。
    expect(b.title.indexOf('開') > -1).toBe(true);
  });

  test('控えの無い図は印を持たない', function() {
    expect(K.badge('')).toBe(null);
    expect(K.badge('nope')).toBe(null);
  });

  test('控えの一覧から 1 枚分を引く', function() {
    var kinds = { timer_init: 'sequence', gpio_state: 'state' };
    expect(K.pick(kinds, 'timer_init')).toBe('sequence');
    expect(K.pick(kinds, 'no_such')).toBe('');
    expect(K.pick(null, 'timer_init')).toBe('');
    expect(K.pick({ a: 'nope' }, 'a')).toBe('');
  });
});

describe('savedKind — 開くときの図種', function() {
  var known = {
    'plantuml-sequence': true, 'plantuml-state': true, 'plantuml-class': true,
    'plantuml-usecase': true, 'plantuml-component': true, 'plantuml-activity': true,
  };
  // junior が詰まった実物: actor と括弧付きラベルがあるシーケンスは
  // 本文判定ではユースケースに倒れる。
  var SEQ = '@startuml\nactor User\nparticipant Timer_Driver\nUser -> Timer_Driver : Timer_Init()\n@enduml';
  function detectUsecase() { return 'plantuml-usecase'; }

  test('控えがあれば本文判定より優先する', function() {
    expect(K.resolveType({
      savedKind: 'sequence', dsl: SEQ, detectType: detectUsecase,
      known: known, fallback: 'plantuml-class',
    })).toBe('plantuml-sequence');
  });

  test('控えが無ければ従来どおり本文から当てる', function() {
    expect(K.resolveType({
      savedKind: '', dsl: SEQ, detectType: detectUsecase,
      known: known, fallback: 'plantuml-class',
    })).toBe('plantuml-usecase');
  });

  test('控えが知らない図種なら本文判定に落とす', function() {
    expect(K.resolveType({
      savedKind: 'nope', dsl: SEQ, detectType: detectUsecase,
      known: known, fallback: 'plantuml-class',
    })).toBe('plantuml-usecase');
  });

  test('控えも判定も無ければ今の図種のまま', function() {
    expect(K.resolveType({
      savedKind: '', dsl: SEQ, detectType: function() { return null; },
      known: known, fallback: 'plantuml-class',
    })).toBe('plantuml-class');
  });

  test('この版で扱えない図種の控えは使わない', function() {
    expect(K.resolveType({
      savedKind: 'activity', dsl: SEQ, detectType: detectUsecase,
      known: { 'plantuml-usecase': true }, fallback: 'plantuml-class',
    })).toBe('plantuml-usecase');
  });
});

describe('savedKind — 控えの更新', function() {
  test('図種の分かる保存だけが控えを書き換える', function() {
    var kinds = { a: 'sequence' };
    expect(K.nextKinds(kinds, 'a', 'state')).toEqual({ a: 'state' });
    // 図種の付かない保存 (一括の書き戻しなど) は前の控えを消さない。
    expect(K.nextKinds(kinds, 'a', '')).toEqual({ a: 'sequence' });
    expect(K.nextKinds(kinds, 'b', 'class')).toEqual({ a: 'sequence', b: 'class' });
    // 元の object は書き換えない。
    expect(kinds).toEqual({ a: 'sequence' });
  });
});
