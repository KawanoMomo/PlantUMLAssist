'use strict';
// BLK-reviewer-20260907-2203-wish: 前回から無変更と確かめられたら、前回の指摘一覧を
// そのまま今回の指摘として複製し「前回から無変更のため再突合なし」を 1 行付けて確定する。
// ただし監査ツールの構えが変わっていたら複製せず再突合を促す。
var fs = require('fs');
var path = require('path');
var win = {};
new Function('window', fs.readFileSync(path.join(__dirname, '../src/core/review-pins.js'), 'utf-8'))(win);
new Function('window', fs.readFileSync(path.join(__dirname, '../src/core/review-carry.js'), 'utf-8'))(win);
var RC = win.MA.reviewCarry;
var RP = win.MA.reviewPins;

function fakeStorage(initial) {
  var store = initial || {};
  return {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function(k, v) { store[k] = String(v); },
    _store: store,
  };
}

function rows(spec) {
  return Object.keys(spec).map(function(name) { return { name: name, status: spec[name] }; });
}

var SIG_A = 'consistency[granularity,methods,naming,unused],family,method,name,trace';
var SIG_B = 'consistency[events,granularity,methods,naming,unused],family,method,name,trace';

function recordOf(pins, sig) {
  return { at: '2026-09-07T19:03', signature: sig, pins: pins, notes: [], carriedFrom: null };
}

var TWO_PINS = [
  { doc: 'adc_state.puml', id: '1', state: 'open', author: 'reviewer', at: '2026-09-07T18:03', text: 'Timer_StartConv に対応する method が無い', anchor: 'Idle --> Busy : Timer_StartConv' },
  { doc: 'spi_seq.puml', id: '2', state: 'read', author: 'reviewer', at: '2026-09-07T18:03', text: '粒度がそろっていない', anchor: 'App -> Spi : send' },
];

describe('reviewCarry.signature', function() {
  test('監査モジュールの有無とカテゴリ名から構えを作る', function() {
    var sig = RC.signature({
      nameAudit: {}, methodAudit: {}, familyAudit: {}, traceCoverage: {},
      consistency: { check: function() { return { naming: [], unused: [], methods: [], granularity: [], count: 0 }; } },
    });
    expect(sig).toBe('consistency[granularity,methods,naming,unused],family,method,name,trace');
  });
  test('カテゴリが増えると構えが変わる (event-sync のイベント新設)', function() {
    var sig = RC.signature({
      nameAudit: {}, methodAudit: {}, familyAudit: {}, traceCoverage: {},
      consistency: { check: function() { return { naming: [], unused: [], methods: [], granularity: [], events: [], count: 0 }; } },
    });
    expect(sig).toBe(SIG_B);
    expect(sig).not.toBe(SIG_A);
  });
  test('件数 (count) は構えに数えない', function() {
    var mk = function(n) {
      return { consistency: { check: function() { return { naming: [], count: n }; } } };
    };
    expect(RC.signature(mk(0))).toBe(RC.signature(mk(7)));
  });
  test('監査が 1 つも無ければ空文字', function() {
    expect(RC.signature({})).toBe('');
    expect(RC.signature(null)).toBe('');
  });
});

describe('reviewCarry.signatureDiffText', function() {
  test('増えた監査カテゴリを名指しする', function() {
    var t = RC.signatureDiffText(SIG_A, SIG_B);
    expect(t).toContain('増えた監査');
    expect(t).toContain('consistency[events,granularity,methods,naming,unused]');
  });
  test('消えた監査も言う', function() {
    expect(RC.signatureDiffText('family,name,trace', 'family,name')).toContain('消えた監査: trace');
  });
});

describe('reviewCarry.collectPins', function() {
  test('図をまたいだ指摘を図名順に並べる', function() {
    var bodies = {
      'z.puml': "@startuml\n' @pin 9|open|reviewer|t|Idle --> Busy|後の図の指摘\n@enduml",
      'a.puml': "@startuml\n' @pin 1|read|primary|t|A -> B : go|前の図の指摘\n@enduml",
    };
    var pins = RC.collectPins(RP, bodies);
    expect(pins.map(function(p) { return p.doc; })).toEqual(['a.puml', 'z.puml']);
    expect(pins[0].state).toBe('read');
    expect(pins[1].text).toBe('後の図の指摘');
  });
  test('指摘の無い図は 0 件、reviewPins が無ければ空', function() {
    expect(RC.collectPins(RP, { 'a.puml': '@startuml\n@enduml' })).toEqual([]);
    expect(RC.collectPins(null, { 'a.puml': 'x' })).toEqual([]);
  });
});

describe('reviewCarry.plan', function() {
  test('全図 unchanged かつ構えが同じなら複製できる', function() {
    var p = RC.plan(recordOf(TWO_PINS, SIG_A), { rows: rows({ 'a.puml': 'unchanged', 'b.puml': 'unchanged' }), signature: SIG_A });
    expect(p.ok).toBe(true);
    expect(p.count).toBe(2);
    expect(p.message).toContain('2 件');
  });
  test('変更図があれば複製しない', function() {
    var p = RC.plan(recordOf(TWO_PINS, SIG_A), { rows: rows({ 'a.puml': 'changed', 'b.puml': 'unchanged' }), signature: SIG_A });
    expect(p.ok).toBe(false);
    expect(p.reason).toBe('changed');
    expect(p.message).toContain('変更 1 枚');
  });
  test('新規図があれば複製しない', function() {
    var p = RC.plan(recordOf(TWO_PINS, SIG_A), { rows: rows({ 'a.puml': 'new' }), signature: SIG_A });
    expect(p.ok).toBe(false);
    expect(p.message).toContain('新規 1 枚');
  });
  test('前回の控えが無ければ複製しない', function() {
    var p = RC.plan(null, { rows: rows({ 'a.puml': 'unchanged' }), signature: SIG_A });
    expect(p.ok).toBe(false);
    expect(p.reason).toBe('no-record');
  });
  test('無変更でも監査の構えが変わっていれば再突合を促す', function() {
    var p = RC.plan(recordOf(TWO_PINS, SIG_A), { rows: rows({ 'a.puml': 'unchanged' }), signature: SIG_B });
    expect(p.ok).toBe(false);
    expect(p.reason).toBe('audit-changed');
    expect(p.recheck).toBe(true);
    expect(p.message).toContain('再突合');
    expect(p.message).toContain('増えた監査');
  });
  test('数え上げを直接渡してもよい', function() {
    expect(RC.plan(recordOf([], SIG_A), { changed: 0, added: 0, signature: SIG_A }).ok).toBe(true);
    expect(RC.plan(recordOf([], SIG_A), { changed: 2, added: 0, signature: SIG_A }).ok).toBe(false);
  });
  test('今回の構えが取れないときは構えを理由に断らない', function() {
    var p = RC.plan(recordOf(TWO_PINS, SIG_A), { rows: rows({ 'a.puml': 'unchanged' }), signature: '' });
    expect(p.ok).toBe(true);
  });
});

describe('reviewCarry.carry', function() {
  test('指摘をそのまま複製して注記を末尾に 1 行足す', function() {
    var rec = RC.carry(recordOf(TWO_PINS, SIG_A), '2026-09-07T22:03', SIG_A);
    expect(rec.pins).toEqual(TWO_PINS);
    expect(rec.notes).toEqual(['前回から無変更のため再突合なし']);
    expect(rec.carriedFrom).toBe('2026-09-07T19:03');
    expect(rec.at).toBe('2026-09-07T22:03');
  });
  test('無変更が続いても注記は 1 行のまま積み上がらない', function() {
    var a = RC.carry(recordOf(TWO_PINS, SIG_A), 't1', SIG_A);
    var b = RC.carry(a, 't2', SIG_A);
    var c = RC.carry(b, 't3', SIG_A);
    expect(c.notes).toEqual(['前回から無変更のため再突合なし']);
    expect(c.carriedFrom).toBe('t2');
  });
  test('複製元が無ければ null', function() {
    expect(RC.carry(null, 't')).toBe(null);
  });
});

describe('reviewCarry.load / save', function() {
  test('保存フォルダごとに控える', function() {
    var st = fakeStorage();
    RC.save(st, 'E:/data', recordOf(TWO_PINS, SIG_A));
    expect(RC.load(st, 'E:/data').pins.length).toBe(2);
    expect(RC.load(st, 'E:/other')).toBe(null);
  });
  test('保存先を書かなければ ./autosave 扱い', function() {
    expect(RC.storageKey('')).toBe(RC.storageKey('./autosave'));
    expect(RC.storageKey(null)).toBe('pua.review.carry:./autosave');
  });
  test('壊れた控えは無かったことにする', function() {
    var st = fakeStorage();
    st.setItem(RC.storageKey('E:/data'), '{壊れ');
    expect(RC.load(st, 'E:/data')).toBe(null);
  });
  test('storage が無くても落ちない', function() {
    expect(RC.load(null, 'x')).toBe(null);
    expect(RC.save(null, 'x', recordOf([], SIG_A))).toBe(false);
  });
});

describe('reviewCarry.formatList / statusText', function() {
  test('図ごとに見出しを付け、注記は末尾に置く', function() {
    var rec = RC.carry(recordOf(TWO_PINS, SIG_A), 't', SIG_A);
    var lines = RC.formatList(rec).split('\n');
    expect(lines[0]).toBe('# adc_state.puml');
    expect(lines[1]).toContain('[未読]');
    expect(lines[2]).toBe('# spi_seq.puml');
    expect(lines[lines.length - 1]).toBe('前回から無変更のため再突合なし');
  });
  test('指摘が 0 件でも「指摘なし」と言い切る', function() {
    expect(RC.formatList(recordOf([], SIG_A))).toBe('- 指摘なし');
  });
  test('複製したことと元の時刻を 1 行で言う', function() {
    var rec = RC.carry(recordOf(TWO_PINS, SIG_A), 't', SIG_A);
    expect(RC.statusText(rec)).toContain('指摘 2 件');
    expect(RC.statusText(rec)).toContain('2026-09-07T19:03 から複製');
    expect(RC.statusText(null)).toContain('まだありません');
  });
});
