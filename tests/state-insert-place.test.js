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

// BLK-human-20260915-1206 以降、「の中」の相手は state-child が決める
// (中身をまだ持たない状態もその場で開いて相手にする)。本番と同じ組で確かめる。
['../src/core/state-child.js', '../src/core/state-insert.js'].forEach(function(dep) {
  try { delete require.cache[require.resolve(dep)]; } catch (e) {}
  require(dep);
});
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

  // BLK-human-20260915-1206: 以前は複合状態がある図でしか「の中」を出さず、
  // 最初の 1 つを GUI から作る道がどこにも無かった。状態が 1 つでもあれば出す。
  // BLK-owner-20260925-0312-3: 「選んだ状態の中」+ 別欄の親、の 2 段をやめ、親ごとに 1 行 (in:{id}) を並べる。
  test('遷移があれば「この遷移の途中」が増える', function() {
    var ps = SI.positions(SAMPLE_PARSED);
    expect(ps.map(function(p) { return p.value; })).toEqual(['end', 'transition', 'in:Idle', 'in:Running']);
  });

  test('複合状態があれば「（状態）の中」が増える', function() {
    var ps = SI.positions(COMPOSITE_PARSED);
    expect(ps.map(function(p) { return p.value; })).toEqual(['end', 'transition', 'in:Outer', 'in:Done']);
    expect(ps[2].label).toBe('Outer の中');
  });

  test('単純 state でも「の中」は出る (その場で { } に開いて子にする)', function() {
    var ps = SI.positions({ states: [{ id: 'A', line: 3, endLine: 3 }], transitions: [] });
    expect(ps.map(function(p) { return p.value; })).toEqual(['end', 'in:A']);
  });

  test('状態が 1 つも無ければ「の中」は出ない', function() {
    var ps = SI.positions({ states: [], transitions: [{ id: '__t_0', line: 3 }] });
    expect(ps.map(function(p) { return p.value; })).toEqual(['end', 'transition']);
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

  test('「の中」の相手は複合状態に限らない (単純 state も並ぶ)', function() {
    expect(SI.compositeOptions(COMPOSITE_PARSED).map(function(o) { return o.value; }))
      .toContain('Outer');
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
