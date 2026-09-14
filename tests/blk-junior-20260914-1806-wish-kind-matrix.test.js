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

// BLK-junior-20260914-1906-wish: 題材を 1 つずつ選び直すと、担当している部品の数だけ
// 6 図種の確認を周回することになる。縦に部品・横に図種の 1 枚で「次はどの部品の
// どの図種か」を出す。
describe('部品 × 図種の表 (BLK-junior-20260914-1906-wish)', function() {
  var all = KM.scanAll(MINE, THEIRS, 'primary');

  test('担当している部品が全部行になる (選び直さない)', function() {
    expect(all.rows.map(function(r) { return r.subject; }).sort()).toEqual(['gpio', 'spi']);
    expect(all.kinds.length).toBe(6);
  });

  test('残りの多い部品が上に来る (次に着手する順)', function() {
    expect(all.rows[0].subject).toBe('gpio');
    expect(all.rows[0].todo).toBe(3);
  });

  test('セルの印は 1 つの部品を選んだときの状態と同じ', function() {
    var gpio = all.rows[0];
    var byKind = {};
    gpio.rows.forEach(function(r) { byKind[r.kind] = r; });
    expect(KM.cellMark(byKind.state)).toBe('👀');          // 未確認
    expect(KM.cellMark(byKind.component)).toBe('△');       // 自分に無し
    expect(KM.cellMark(byKind.sequence)).toBe('✓');        // 控え済み
    expect(KM.cellMark(byKind.usecase)).toBe('·');         // 手本なし (未控え)
  });

  test('見出しが全部品ぶんの残り件数と、残っている部品の数を言う', function() {
    var s = KM.summaryAll(all);
    expect(s).toContain('2 部品 × 6 図種');
    expect(s).toContain('残り ' + all.todo + ' 件 / ' + all.subjectsTodo + ' 部品');
    expect(all.todo).toBe(all.rows.reduce(function(n, r) { return n + r.todo; }, 0));
  });

  test('次に見る 1 マスを表が名指しする (どこから着手するかを迷わない)', function() {
    var next = KM.nextCell(all);
    expect(next.subject).toBe('gpio');
    // 要確認が無ければ未確認から。図種の並び順の先頭は sequence だが、
    // gpio の sequence は控え済みなので state が先に来る。
    expect(next.row.state).toBe('check');
    expect(['state', 'class']).toContain(next.kind);
  });

  test('相手に図が増えていれば、その部品の行が要確認になる', function() {
    var mine = MINE.concat([]);
    var theirs = THEIRS.concat([doc('gpio_init_sequence', 'sequence')]);
    var a2 = KM.scanAll(mine, theirs, 'primary');
    var gpio = a2.rows.filter(function(r) { return r.subject === 'gpio'; })[0];
    var seq = gpio.rows.filter(function(r) { return r.kind === 'sequence'; })[0];
    expect(seq.state).toBe('recheck');
    expect(KM.cellMark(seq)).toBe('👀!');
    expect(KM.nextCell(a2).kind).toBe('sequence');
  });

  test('凡例が印の意味を全部言う (セルだけでは読めない)', function() {
    var leg = KM.legend();
    ['要確認', '未確認', '自分に無し', '控え済み', '手本なし'].forEach(function(w) {
      expect(leg).toContain(w);
    });
  });

  test('図が 1 枚も無ければ行も 0 (空の表を出さない)', function() {
    var a = KM.scanAll([], [], 'primary');
    expect(a.rows).toEqual([]);
    expect(KM.summaryAll(a)).toBe('');
    expect(KM.nextCell(a)).toBeNull();
  });
});
