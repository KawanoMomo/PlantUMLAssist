'use strict';
// BLK-junior-20260917-0423-wish: 取り込む場面の手順 1 は「先輩の該当図を開く」から
// 始まるが、先輩がその部品のその図種をまだ作っていないことがある。junior は一覧の
// ファイル名を目で読み比べて初めて「TIMER のクラス図はまだ無い」と分かっていた。
// ここで守るのは、部品 × 図種の 1 枚が「相手に有る/無い」を開く前に言い切ること。
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
  try { require(p); } catch (e) { /* 依存の無いものは飛ばす */ }
});

var KM = window.MA.kindMatrix;

function doc(name, kind) {
  return { name: name, kind: kind, savedKind: '', text: '' };
}

// junior (自分) は TIMER の 3 図種を持っている。
var MINE = [
  doc('timer_init_sequence', 'sequence'),
  doc('timer_state', 'state'),
  doc('timer_class', 'class'),
];
// primary (先輩) はシーケンスと状態遷移まで。クラス図はまだ無い —— 今回の空振り。
var THEIRS = [
  doc('timer_init_sequence', 'sequence'),
  doc('timer_state', 'state'),
  doc('gpio_class', 'class'),
];

var ALL = KM.scanAll(MINE, THEIRS, 'primary');

function cellOf(all, subject, kind) {
  var sc = all.rows.filter(function(r) { return r.subject === subject; })[0];
  return sc ? sc.rows.filter(function(r) { return r.kind === kind; })[0] : null;
}

describe('kindMatrix.madeMark — 相手に有るか無いかを 1 文字で', function() {
  test('相手に 1 枚でもあれば 済', function() {
    expect(KM.madeMark(cellOf(ALL, 'timer', 'sequence'))).toBe('済');
    expect(KM.madeState(cellOf(ALL, 'timer', 'state'))).toBe('made');
  });

  test('相手に 0 枚なら、自分が持っていても 未 (取り込む相手が無い)', function() {
    var c = cellOf(ALL, 'timer', 'class');
    expect(c.mineCount).toBe(1);
    expect(KM.madeMark(c)).toBe('未');
    expect(KM.madeState(c)).toBe('none');
  });

  test('相手にしか無い部品も表に出る (自分に無い組を落とさない)', function() {
    expect(KM.madeMark(cellOf(ALL, 'gpio', 'class'))).toBe('済');
    expect(KM.madeMark(cellOf(ALL, 'gpio', 'sequence'))).toBe('未');
  });
});

describe('kindMatrix.madeSummary / madeCounts — 表ぜんぶの 済/未', function() {
  test('部品数 × 図種数 が 済 と 未 に分かれる (数え落としが無い)', function() {
    var c = KM.madeCounts(ALL);
    expect(c.total).toBe(ALL.rows.length * ALL.kinds.length);
    expect(c.made).toBe(3);
    expect(c.none).toBe(c.total - 3);
  });

  test('見出しは相手の名前と 済/未 の数を言う', function() {
    var s = KM.madeSummary(ALL, 'primary');
    expect(s).toContain('primary');
    expect(s).toContain('済 3');
    expect(s).toContain('2 部品 × 6 図種');
  });

  test('表が空なら見出しも空 (相手のフォルダを読む前に数を出さない)', function() {
    expect(KM.madeSummary(KM.scanAll([], [], 'primary'), 'primary')).toBe('');
  });
});

describe('kindMatrix.firstMissing / missingCells — まだ無い組を名指しする', function() {
  test('未の組を全部拾える', function() {
    var miss = KM.missingCells(ALL);
    expect(miss.length).toBe(KM.madeCounts(ALL).none);
    var timerClass = miss.filter(function(m) {
      return m.subject === 'timer' && m.kind === 'class';
    });
    expect(timerClass.length).toBe(1);
    expect(timerClass[0].label).toBe('クラス');
  });

  test('先頭の 1 組は表の上から図種の並び順で選ぶ', function() {
    var m = KM.firstMissing(ALL);
    expect(m).not.toBe(null);
    expect(ALL.rows[0].subject).toBe(m.subject);
    expect(KM.order().indexOf(m.kind) >= 0).toBe(true);
  });

  test('全部そろっていれば null (「無い」と言わない)', function() {
    var full = [];
    KM.order().forEach(function(k) { full.push(doc('timer_' + k, k)); });
    var all = KM.scanAll(full, full, 'primary');
    expect(KM.firstMissing(all)).toBe(null);
    expect(KM.madeCounts(all).none).toBe(0);
  });
});

describe('kindMatrix.madeTitle — 押す前に読む 1 行', function() {
  test('有る組はファイル名まで言う', function() {
    var t = KM.madeTitle(cellOf(ALL, 'timer', 'sequence'), 'timer', 'primary');
    expect(t).toContain('primary');
    expect(t).toContain('TIMER');
    expect(t).toContain('timer_init_sequence');
  });

  test('無い組は「まだありません」と言い切る', function() {
    var t = KM.madeTitle(cellOf(ALL, 'timer', 'class'), 'timer', 'primary');
    expect(t).toContain('クラス図はまだありません');
  });
});
