'use strict';
// BLK-junior-20260914-1806-wish: 題材 1 つについて 6 図種すべての対応要否を 1 画面で出す。
// ここで守るのは「残りの図種が何図種で、どれが要確認か」を 1 回の走査で言い切ること ——
// 図種ごとに 1 周待たないと分からない、という今の進め方をやめられるかがすべて。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var window = global.window;
['../src/core/dsl-utils.js', '../src/core/parser-utils.js', '../src/core/regex-parts.js',
 '../src/core/name-audit.js', '../src/core/audit-scope.js', '../src/core/family-audit.js',
 '../src/core/domain-cohort.js', '../src/core/diagram-kind.js', '../src/core/peek-verdict.js',
 '../src/core/kind-matrix.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  try { require(p); } catch (e) { /* 依存の無いものは飛ばす (kind-matrix は欠けても動く) */ }
});

var KM = window.MA.kindMatrix;
var PV = window.MA.peekVerdict;

function doc(name, kind, text) {
  return { name: name, kind: kind, savedKind: '', text: text || '' };
}

// 自分 (junior) の GPIO 一式。シーケンスとクラスには「先輩に実体なし」の控えが入っている。
var NOTED_SEQ = PV.write('@startuml\nparticipant A\n@enduml',
  { kind: 'sequence', dir: 'primary', count: 0, at: '2026-09-14T10:00', note: '対応不要（先輩に実体なし）' });
var NOTED_ACT = PV.write('@startuml\nstart\n@enduml',
  { kind: 'activity', dir: 'primary', count: 0, at: '2026-09-14T10:00', note: '対応不要（先輩に実体なし）' });

var MINE = [
  doc('gpio_init_sequence', 'sequence', NOTED_SEQ),
  doc('gpio_state', 'state'),
  doc('gpio_class', 'class'),
  doc('gpio_activity', 'activity', NOTED_ACT),
  doc('spi_state', 'state'),
];
var THEIRS = [
  doc('gpio_state', 'state'),
  doc('gpio_class', 'class'),
  doc('gpio_component', 'component'),
  doc('spi_init_sequence', 'sequence'),
];

describe('kindMatrix.subjects — 題材を選ぶ', function() {
  test('自分と相手の両方から集め、枚数の多い順に並ぶ', function() {
    var subs = KM.subjects(MINE, THEIRS);
    expect(subs[0]).toBe('gpio');
    expect(subs).toContain('spi');
  });
});

describe('kindMatrix.scan — 題材 1 つぶんの 6 行', function() {
  var sc = KM.scan('gpio', MINE, THEIRS, 'primary');

  test('6 図種ぶんの行が必ず出る (相手にも自分にも無い図種を落とさない)', function() {
    expect(sc.rows.length).toBe(6);
    expect(sc.rows.map(function(r) { return r.kind; }))
      .toEqual(['sequence', 'state', 'class', 'usecase', 'component', 'activity']);
  });

  test('相手に図があり控えが無い図種は「未確認」', function() {
    var state = sc.rows.filter(function(r) { return r.kind === 'state'; })[0];
    expect(state.state).toBe('check');
    expect(state.theirCount).toBe(1);
    expect(state.mineCount).toBe(1);
  });

  test('自分に無い図種は「自分に無し」として分けて出る (未確認に混ぜない)', function() {
    var comp = sc.rows.filter(function(r) { return r.kind === 'component'; })[0];
    expect(comp.state).toBe('mine-missing');
    expect(KM.rowTitle(comp, 'primary')).toContain('自分にはありません');
  });

  test('控えがあり相手が今も 0 枚なら「控え済み」— この周ですることは無い', function() {
    var act = sc.rows.filter(function(r) { return r.kind === 'activity'; })[0];
    expect(act.state).toBe('noted');
    expect(act.done).toBe(true);
    expect(act.todo).toBe(false);
  });

  test('控えがあっても相手に図が増えていれば「要確認」に戻る', function() {
    var grown = THEIRS.concat([doc('gpio_init_sequence', 'sequence')]);
    var sc2 = KM.scan('gpio', MINE, grown, 'primary');
    var seq = sc2.rows.filter(function(r) { return r.kind === 'sequence'; })[0];
    expect(seq.state).toBe('recheck');
    expect(KM.rowTitle(seq, 'primary')).toContain('確かめ直してください');
  });

  test('相手に 0 枚で控えもまだ無い図種は、その場で控えを取れると言う', function() {
    var uc = sc.rows.filter(function(r) { return r.kind === 'usecase'; })[0];
    expect(uc.state).toBe('no-model');
    expect(KM.rowTitle(uc, 'primary')).toContain('控えられます');
  });

  test('題材で絞る (別題材の図を数に混ぜない)', function() {
    var seq = sc.rows.filter(function(r) { return r.kind === 'sequence'; })[0];
    expect(seq.theirCount).toBe(0);   // spi_init_sequence は gpio ではない
  });

  test('残りが何図種あるかを見出しの 1 行で言う', function() {
    expect(sc.todo).toBe(3);   // state(未確認) / class(未確認) / component(自分に無し)
    var s = KM.summary(sc);
    expect(s).toContain('GPIO: 6 図種のうち');
    expect(s).toContain('未確認 2');
    expect(s).toContain('自分に無し 1');
    expect(s).toContain('控え済み 2');
  });

  test('行から最初に開く 1 枚を引ける (一覧を目で探し直さない)', function() {
    var cls = sc.rows.filter(function(r) { return r.kind === 'class'; })[0];
    expect(KM.openTarget(cls)).toBe('gpio_class');
    var uc = sc.rows.filter(function(r) { return r.kind === 'usecase'; })[0];
    expect(KM.openTarget(uc)).toBe('');
  });
});
