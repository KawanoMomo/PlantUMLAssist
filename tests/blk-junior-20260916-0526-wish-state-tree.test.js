'use strict';
// BLK-junior-20260916-0526-wish: 子状態を足した後、入れ子を階層ツリーで見て
// 選んだ階層だけを図に出せること。木の並び (親→子→孫) と、焦点の DSL が
// その階層に閉じていることをここで固定する。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/state-tree.js')]; } catch (e) {}
require('../src/core/state-tree.js');
var STree = global.window.MA.stateTree;

// 台本 手順 9 と同じ形。TIMER ドライバの状態遷移に親 Configured を置き、
// その中に子を 2 つ、さらに片方が孫を持つ。
var TEXT = [
  '@startuml',
  'title TIMERドライバ状態遷移',
  '[*] --> Idle',
  'state Idle',
  'state Configured {',
  '  state Counting {',
  '    state Tick',
  '  }',
  '  state Paused',
  '  Counting --> Paused : pause',
  '  Paused --> Counting : resume',
  '}',
  'Idle --> Configured : configure',
  'Configured --> Idle : stop',
  '@enduml',
].join('\n');

// parse は modules/state.js の持ち物。木は図と同じ parsed から作るので、
// unit でも本物のパーサを読ませて借りる (自前で入れ子を数え直さない)。
[
  '../src/core/dsl-utils.js',
  '../src/core/state-transition.js',
  '../src/core/regex-parts.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/modules/state.js',
].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});

function parse(text) {
  return global.window.MA.modules.plantumlState.parse(text);
}

var PARSED = parse(TEXT);

describe('rows — 入れ子を上から親→子→孫に並べる', function() {
  test('親のすぐ後ろにその子が来る', function() {
    var ids = STree.rows(PARSED).map(function(r) { return r.id; });
    expect(ids).toEqual([
      'Idle',
      'Configured',
      'Configured.Counting',
      'Configured.Counting.Tick',
      'Configured.Paused',
    ]);
  });

  test('深さは根が 0、孫が 2', function() {
    var byId = {};
    STree.rows(PARSED).forEach(function(r) { byId[r.id] = r; });
    expect(byId['Idle'].depth).toBe(0);
    expect(byId['Configured'].depth).toBe(1 - 1);  // 根の状態は 0
    expect(byId['Configured.Counting'].depth).toBe(1);
    expect(byId['Configured.Counting.Tick'].depth).toBe(2);
  });

  test('子を持つ親だけが hasChildren、子孫の数も数える', function() {
    var byId = {};
    STree.rows(PARSED).forEach(function(r) { byId[r.id] = r; });
    expect(byId['Configured'].hasChildren).toBe(true);
    expect(byId['Configured'].childCount).toBe(2);
    expect(byId['Configured'].descendantCount).toBe(3);
    expect(byId['Idle'].hasChildren).toBe(false);
    expect(byId['Configured.Counting.Tick'].childCount).toBe(0);
  });

  test('compositeRows は広げられる親だけを返す', function() {
    expect(STree.compositeRows(PARSED).map(function(r) { return r.id; }))
      .toEqual(['Configured', 'Configured.Counting']);
  });

  test('maxDepth は最も深い入れ子の段', function() {
    expect(STree.maxDepth(PARSED)).toBe(2);
  });
});

describe('subtree / breadcrumb — どの階層に居るか', function() {
  test('自分と子孫', function() {
    expect(STree.subtree(PARSED, 'Configured')).toEqual([
      'Configured', 'Configured.Counting', 'Configured.Counting.Tick', 'Configured.Paused',
    ]);
  });

  test('葉は自分だけ', function() {
    expect(STree.subtree(PARSED, 'Idle')).toEqual(['Idle']);
  });

  test('無い状態は空', function() {
    expect(STree.subtree(PARSED, 'Nope')).toEqual([]);
  });

  test('breadcrumbText は根から辿る', function() {
    expect(STree.breadcrumbText(PARSED, 'Configured.Counting.Tick'))
      .toBe('Configured › Counting › Tick');
  });
});

describe('transitionsIn / boundaryTransitions — 階層の内と外', function() {
  test('中に閉じた遷移だけを拾う (親を省いた書き方でも突合する)', function() {
    var labels = STree.transitionsIn(PARSED, 'Configured').map(function(t) {
      return t.from + '->' + t.to;
    });
    expect(labels).toEqual(['Counting->Paused', 'Paused->Counting']);
  });

  test('外と行き来する遷移は境界として別に数える', function() {
    var b = STree.boundaryTransitions(PARSED, 'Configured').map(function(t) {
      return t.from + '->' + t.to;
    });
    expect(b).toEqual(['Idle->Configured', 'Configured->Idle']);
  });
});

describe('focusDsl — 選んだ階層だけを図にする', function() {
  var dsl = STree.focusDsl(TEXT, PARSED, 'Configured');

  test('@startuml で始まり @enduml で終わる', function() {
    expect(dsl.split('\n')[0]).toBe('@startuml');
    expect(dsl.split('\n').pop()).toBe('@enduml');
  });

  test('見出しに今どの階層を見ているかが入る', function() {
    expect(dsl).toContain('title TIMERドライバ状態遷移 — Configured');
  });

  test('その階層の中身だけが入り、外の状態は入らない', function() {
    expect(dsl).toContain('state Configured {');
    expect(dsl).toContain('state Paused');
    expect(dsl).toContain('Counting --> Paused : pause');
    expect(dsl).not.toContain('state Idle');
    expect(dsl).not.toContain('Idle --> Configured');
  });

  test('孫の階層を選べば孫だけが残る', function() {
    var inner = STree.focusDsl(TEXT, PARSED, 'Configured.Counting');
    expect(inner).toContain('state Counting {');
    expect(inner).toContain('state Tick');
    expect(inner).not.toContain('state Paused');
    expect(inner).toContain('title TIMERドライバ状態遷移 — Configured › Counting');
  });

  test('親のインデントを外すので、そのまま描ける形になる', function() {
    var inner = STree.focusDsl(TEXT, PARSED, 'Configured.Counting');
    expect(inner).toContain('\nstate Counting {');
  });

  test('無い状態は空文字 (呼ぶ側が全体表示に戻せる)', function() {
    expect(STree.focusDsl(TEXT, PARSED, 'Nope')).toBe('');
  });
});

describe('focusLabel / summaryText — 画面に出す 1 行', function() {
  test('焦点の見出しに子の数と外とのつながりが出る', function() {
    var t = STree.focusLabel(PARSED, 'Configured');
    expect(t).toContain('Configured の中だけを表示中');
    expect(t).toContain('子状態 2');
    expect(t).toContain('内部の遷移 2');
    expect(t).toContain('外と 2 本');
  });

  test('まとめの 1 行に深さが出る', function() {
    var s = STree.summaryText(PARSED);
    expect(s).toContain('状態 5');
    expect(s).toContain('入れ子の親 2');
    expect(s).toContain('3 段');
  });
});
