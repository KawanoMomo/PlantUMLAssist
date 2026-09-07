'use strict';
// BLK-builder-20260907-1720-3 (design 4c): State の「追加する位置」。
// 設計は「図の末尾 / この遷移の途中 / (選んだ状態) の中」の 3 択で、
// 末尾しか無かった従来と違い、既にある遷移の間や複合状態の中へ直接置ける。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/state-insert.js')]; } catch (e) {}
require('../src/core/state-insert.js');
var SI = global.window.MA.stateInsert;

// design 4c のサンプルと同じ図。
var SAMPLE_TEXT = [
  '@startuml',
  'title Sample State',
  '[*] --> Idle',
  'Idle --> Running : start',
  'Running --> Idle : stop',
  'Running --> [*] : done',
  '@enduml',
].join('\n');

var SAMPLE_PARSED = {
  states: [
    { id: 'Idle', label: 'Idle', line: 0, endLine: 0 },
    { id: 'Running', label: 'Running', line: 0, endLine: 0 },
  ],
  transitions: [
    { id: '__t_0', from: '[*]', to: 'Idle', trigger: null, guard: null, action: null, line: 3 },
    { id: '__t_1', from: 'Idle', to: 'Running', trigger: 'start', guard: null, action: null, line: 4 },
    { id: '__t_2', from: 'Running', to: 'Idle', trigger: 'stop', guard: null, action: null, line: 5 },
    { id: '__t_3', from: 'Running', to: '[*]', trigger: 'done', guard: null, action: null, line: 6 },
  ],
};

var COMPOSITE_TEXT = [
  '@startuml',
  'state Outer {',
  '  Inner1 --> Inner2',
  '}',
  'Outer --> Done',
  '@enduml',
].join('\n');

var COMPOSITE_PARSED = {
  states: [
    { id: 'Outer', label: 'Outer', line: 2, endLine: 4 },
    { id: 'Done', label: 'Done', line: 0, endLine: 0 },
  ],
  transitions: [{ id: '__t_0', from: 'Outer', to: 'Done', line: 5 }],
};

describe('positions — 選べる位置は図の中身で決まる', function() {
  test('末尾はいつでも選べる', function() {
    var ps = SI.positions({ states: [], transitions: [] });
    expect(ps.map(function(p) { return p.value; })).toEqual(['end']);
  });

  test('遷移があれば「この遷移の途中」が増える', function() {
    var ps = SI.positions(SAMPLE_PARSED);
    expect(ps.map(function(p) { return p.value; })).toEqual(['end', 'transition']);
  });

  test('複合状態があれば「（状態）の中」が増える', function() {
    var ps = SI.positions(COMPOSITE_PARSED);
    expect(ps.map(function(p) { return p.value; })).toEqual(['end', 'transition', 'inside']);
  });

  test('単純 state だけでは「の中」は出ない (置き場所が無いので)', function() {
    var ps = SI.positions({ states: [{ id: 'A', line: 3, endLine: 3 }], transitions: [] });
    expect(ps.map(function(p) { return p.value; })).toEqual(['end']);
  });
});

describe('transitionOptions / compositeOptions — 位置を決める相手', function() {
  test('遷移は「Idle → Running : start」の形で並ぶ', function() {
    var opts = SI.transitionOptions(SAMPLE_PARSED);
    expect(opts.length).toBe(4);
    expect(opts[1]).toEqual({ value: '__t_1', label: 'Idle → Running : start' });
  });

  test('きっかけの無い遷移はラベルを付けない', function() {
    expect(SI.transitionOptions(SAMPLE_PARSED)[0].label).toBe('[*] → Idle');
  });

  test('複合状態だけが「の中」の相手になる', function() {
    expect(SI.compositeOptions(COMPOSITE_PARSED)).toEqual([{ value: 'Outer', label: 'Outer' }]);
  });
});

describe('splitTransition — 遷移の途中に状態を挟む', function() {
  test('元の遷移が 2 本になり、きっかけは前半に残る', function() {
    var out = SI.splitTransition(SAMPLE_TEXT, SAMPLE_PARSED, '__t_1', 'Warmup', null, null);
    var lines = out.split('\n');
    expect(lines[3]).toBe('state Warmup');
    expect(lines[4]).toBe('Idle --> Warmup : start');
    expect(lines[5]).toBe('Warmup --> Running');
    // 他の遷移は動かない。
    expect(lines[6]).toBe('Running --> Idle : stop');
  });

  test('新しい状態の宣言は元の遷移の直前に入る', function() {
    var out = SI.splitTransition(SAMPLE_TEXT, SAMPLE_PARSED, '__t_0', 'Boot', null, null);
    var lines = out.split('\n');
    expect(lines[2]).toBe('state Boot');
    expect(lines[3]).toBe('[*] --> Boot');
    expect(lines[4]).toBe('Boot --> Idle');
  });

  test('ラベルとステレオタイプを渡せる', function() {
    var out = SI.splitTransition(SAMPLE_TEXT, SAMPLE_PARSED, '__t_1', 'Warm', 'choice', '準備中');
    expect(out.split('\n')[3]).toBe('state "準備中" as Warm <<choice>>');
  });

  test('既に同じ名前の state があれば宣言行は足さない (遷移だけ割る)', function() {
    var parsed = {
      states: [{ id: 'Idle', line: 0, endLine: 0 }, { id: 'Running', line: 0, endLine: 0 }],
      transitions: SAMPLE_PARSED.transitions,
    };
    var out = SI.splitTransition(SAMPLE_TEXT, parsed, '__t_1', 'Running', null, null);
    var lines = out.split('\n');
    expect(lines[3]).toBe('Idle --> Running : start');
    expect(lines[4]).toBe('Running --> Running');
  });

  test('知らない遷移 id なら何もしない', function() {
    expect(SI.splitTransition(SAMPLE_TEXT, SAMPLE_PARSED, '__t_9', 'X', null, null)).toBe(SAMPLE_TEXT);
  });

  test('名前が空なら何もしない', function() {
    expect(SI.splitTransition(SAMPLE_TEXT, SAMPLE_PARSED, '__t_1', '  ', null, null)).toBe(SAMPLE_TEXT);
  });
});

describe('insertInside — 複合状態の中に置く', function() {
  test('閉じ } の直前に、中の行と同じ字下げで入る', function() {
    var out = SI.insertInside(COMPOSITE_TEXT, COMPOSITE_PARSED, 'Outer', 'state Inner3');
    var lines = out.split('\n');
    expect(lines[3]).toBe('  state Inner3');
    expect(lines[4]).toBe('}');
  });

  test('複合状態でない相手には入れない', function() {
    expect(SI.insertInside(COMPOSITE_TEXT, COMPOSITE_PARSED, 'Done', 'state X')).toBe(COMPOSITE_TEXT);
  });

  test('複数行をまとめて入れられる (複合状態を入れ子にする)', function() {
    var out = SI.insertInside(COMPOSITE_TEXT, COMPOSITE_PARSED, 'Outer', ['state Sub {', '}']);
    var lines = out.split('\n');
    expect(lines[3]).toBe('  state Sub {');
    expect(lines[4]).toBe('  }');
    expect(lines[5]).toBe('}');
  });
});
