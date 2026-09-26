'use strict';
// BLK-human-20260915-1206: 状態遷移図で子状態 (入れ子の状態) を GUI から足す
// 入口が見つけられなかった。素材はあったが「Convert to composite → 末尾に追加
// → Move into」の 3 手に散り、どれも「子状態」と名乗っていなかった。
// ここでは「親を選んで子を足す」1 手ぶんの純関数を守る。

var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/dsl-utils.js',
  '../src/core/state-transition.js',
  '../src/core/state-insert.js',
  '../src/core/state-child.js',
  '../src/core/regex-parts.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/modules/state.js',
];
depPaths.forEach(function(dep) {
  try { delete require.cache[require.resolve(dep)]; } catch (e) {}
  require(dep);
});

var SC = global.window.MA.stateChild;
var SI = global.window.MA.stateInsert;
var ST = global.window.MA.modules.plantumlState;

function parse(text) { return ST.parse(text); }

var SIMPLE = [
  '@startuml',
  'state Idle',
  'state Running',
  '[*] --> Idle',
  'Idle --> Running : start',
  'Running --> Idle : stop',
  '@enduml',
].join('\n');

var COMPOSITE = [
  '@startuml',
  'state Running {',
  '  state Warmup',
  '}',
  '[*] --> Running',
  '@enduml',
].join('\n');

describe('canHaveChild / parentCandidates — どの状態が親になれるか', function() {
  test('ふつうの状態は中身の有無にかかわらず親になれる', function() {
    var p = parse(SIMPLE);
    expect(SC.parentCandidates(p).map(function(s) { return s.id; }))
      .toEqual(['Idle', 'Running']);
  });

  test('中身を持つ状態も、その中の子も親になれる (孫が作れる)', function() {
    var p = parse(COMPOSITE);
    expect(SC.parentCandidates(p).map(function(s) { return s.id; }))
      .toEqual(['Running', 'Running.Warmup']);
  });

  test('疑似状態 (choice / fork / history) は中を描けないので親にしない', function() {
    var p = parse([
      '@startuml',
      'state C <<choice>>',
      'state F <<fork>>',
      'state H <<history>>',
      'state Real',
      '@enduml',
    ].join('\n'));
    expect(SC.parentCandidates(p).map(function(s) { return s.id; })).toEqual(['Real']);
  });
});

describe('addChild — 中身を持たない状態にも足せる', function() {
  test('単純な状態は その場で { } に開いて子を入れる', function() {
    var p = parse(SIMPLE);
    var out = SC.addChild(SIMPLE, p, 'Running', 'Warmup', '');
    expect(out).toContain('state Running {');
    expect(out).toContain('  state Warmup');
    expect(out.split('\n').indexOf('}')).toBeGreaterThan(0);
  });

  test('親の遷移は 1 行も動かさない (Idle --> Running が残る)', function() {
    var p = parse(SIMPLE);
    var out = SC.addChild(SIMPLE, p, 'Running', 'Warmup', '');
    expect(out).toContain('Idle --> Running : start');
    expect(out).toContain('Running --> Idle : stop');
    expect(out).toContain('[*] --> Idle');
  });

  test('開いたあとの DSL は parse し直すと親子として読める', function() {
    var out = SC.addChild(SIMPLE, parse(SIMPLE), 'Running', 'Warmup', '');
    var p2 = parse(out);
    var child = p2.states.filter(function(s) { return s.id === 'Running.Warmup'; })[0];
    expect(!!child).toBe(true);
    expect(child.parentId).toBe('Running');
  });

  test('既に子を持つ親には末尾 (閉じ } の直前) に足す', function() {
    var out = SC.addChild(COMPOSITE, parse(COMPOSITE), 'Running', 'Cooldown', '');
    var lines = out.split('\n');
    expect(lines[2].trim()).toBe('state Warmup');
    expect(lines[3].trim()).toBe('state Cooldown');
    expect(lines[4].trim()).toBe('}');
  });

  test('子の中にも同じ手で孫が入る', function() {
    var out = SC.addChild(COMPOSITE, parse(COMPOSITE), 'Running.Warmup', 'Step1', '');
    var p2 = parse(out);
    var g = p2.states.filter(function(s) { return s.id === 'Running.Warmup.Step1'; })[0];
    expect(!!g).toBe(true);
    expect(g.parentId).toBe('Running.Warmup');
  });

  test('表示名を付けると state "表示名" as id になる', function() {
    var out = SC.addChild(SIMPLE, parse(SIMPLE), 'Running', 'Warmup', '暖機中');
    expect(out).toContain('state "暖機中" as Warmup');
  });

  test('名前が空 / 親が居ない / 疑似状態 のときは何も変えない', function() {
    var p = parse(SIMPLE);
    expect(SC.addChild(SIMPLE, p, 'Running', '', '')).toBe(SIMPLE);
    expect(SC.addChild(SIMPLE, p, 'Nope', 'X', '')).toBe(SIMPLE);
    var pc = parse('@startuml\nstate C <<choice>>\n@enduml');
    expect(SC.addChild('@startuml\nstate C <<choice>>\n@enduml', pc, 'C', 'X', ''))
      .toBe('@startuml\nstate C <<choice>>\n@enduml');
  });
});

describe('addChildPair — 子を 2 つ足して間に遷移を引く (台本の手順)', function() {
  test('単純な状態から 1 手で 子 2 つ + 遷移 になる', function() {
    var out = SC.addChildPair(SIMPLE, parse(SIMPLE), 'Running', 'Warmup', 'Steady');
    var p2 = parse(out);
    var kids = p2.states.filter(function(s) { return s.parentId === 'Running'; })
      .map(function(s) { return s.id; });
    expect(kids).toEqual(['Running.Warmup', 'Running.Steady']);
    var tr = p2.transitions.filter(function(t) {
      return t.from === 'Warmup' && t.to === 'Steady';
    });
    expect(tr.length).toBe(1);
  });

  test('既に中身を持つ親にも足せる (前の子は残る)', function() {
    var out = SC.addChildPair(COMPOSITE, parse(COMPOSITE), 'Running', 'A', 'B');
    var p2 = parse(out);
    expect(p2.states.filter(function(s) { return s.parentId === 'Running'; })
      .map(function(s) { return s.id; }))
      .toEqual(['Running.Warmup', 'Running.A', 'Running.B']);
  });

  test('同じ名前を 2 つ渡されたら何もしない', function() {
    expect(SC.addChildPair(SIMPLE, parse(SIMPLE), 'Running', 'A', 'A')).toBe(SIMPLE);
  });
});

describe('uniqueChildId — 名前を思いつかなくても押せる', function() {
  test('空いていればそのまま', function() {
    expect(SC.uniqueChildId(parse(SIMPLE), 'Sub')).toBe('Sub');
  });

  test('埋まっていれば Sub2 / Sub3 と後ろへ送る', function() {
    var p = parse('@startuml\nstate Sub\nstate Sub2\n@enduml');
    expect(SC.uniqueChildId(p, 'Sub')).toBe('Sub3');
  });

  test('入れ子の中の名前も数える (Running.Warmup の Warmup は埋まっている)', function() {
    expect(SC.uniqueChildId(parse(COMPOSITE), 'Warmup')).toBe('Warmup2');
  });
});

describe('breadcrumb / placeText — どの親の中に居るかが分かる', function() {
  test('根の状態は図の直下', function() {
    expect(SC.placeText(parse(COMPOSITE), 'Running')).toBe('図の直下');
    expect(SC.breadcrumbText(parse(COMPOSITE), 'Running')).toBe('Running');
  });

  test('入れ子は根から › でつなぐ', function() {
    expect(SC.breadcrumbText(parse(COMPOSITE), 'Running.Warmup')).toBe('Running › Warmup');
    expect(SC.placeText(parse(COMPOSITE), 'Running.Warmup')).toBe('Running の中');
  });

  test('孫は 2 段ぶん出る', function() {
    var out = SC.addChild(COMPOSITE, parse(COMPOSITE), 'Running.Warmup', 'Step1', '');
    var p2 = parse(out);
    expect(SC.breadcrumbText(p2, 'Running.Warmup.Step1')).toBe('Running › Warmup › Step1');
    expect(SC.placeText(p2, 'Running.Warmup.Step1')).toBe('Running › Warmup の中');
  });

  test('表示名があれば表示名で並ぶ (id ではなく読める名前)', function() {
    var src = '@startuml\nstate "実行中" as Running {\n  state "暖機" as Warmup\n}\n@enduml';
    expect(SC.breadcrumbText(parse(src), 'Running.Warmup')).toBe('実行中 › 暖機');
  });
});

describe('stateInsert — 追加フォームの「選んだ状態の中」が最初の 1 つから使える', function() {
  test('複合状態がまだ無くても「の中」が出る (以前は出なかった)', function() {
    var vals = SI.positions(parse(SIMPLE)).map(function(p) { return p.value; });
    // BLK-owner-20260925-0312-3: 親は位置のプルダウンに名前で並ぶ (値は in:{id})。
    expect(vals.slice(0, 2)).toEqual(['end', 'transition']);
    expect(vals.length).toBeGreaterThan(2);
    vals.slice(2).forEach(function(v) { expect(v.indexOf('in:')).toBe(0); });
  });

  test('状態が 1 つも無ければ「の中」は出ない', function() {
    expect(SI.positions({ states: [], transitions: [] }).map(function(p) { return p.value; }))
      .toEqual(['end']);
  });

  test('相手の一覧は入れ子を › で示す (同名の子を取り違えない)', function() {
    var opts = SI.compositeOptions(parse(COMPOSITE));
    expect(opts.map(function(o) { return o.label; }))
      .toEqual(['Running', 'Running › Warmup']);
  });

  test('insertInside は中身を持たない相手でも その場で開いて入れる', function() {
    var out = SI.insertInside(SIMPLE, parse(SIMPLE), 'Running', 'state Warmup');
    expect(out).toContain('state Running {');
    expect(parse(out).states.filter(function(s) {
      return s.id === 'Running.Warmup';
    }).length).toBe(1);
  });

  test('中身を持つ相手はこれまでどおり閉じ } の直前へ', function() {
    var out = SI.insertInside(COMPOSITE, parse(COMPOSITE), 'Running', 'state Cooldown');
    var lines = out.split('\n');
    expect(lines[3].trim()).toBe('state Cooldown');
    expect(lines[4].trim()).toBe('}');
  });
});

// 他のテストファイルへ jsdom を持ち越さない (state-parser.test.js と同じ後始末)。
if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
