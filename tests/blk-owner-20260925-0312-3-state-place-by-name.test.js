'use strict';
// BLK-owner-20260925-0312-3: 状態遷移図の「追加する位置」。
// 以前は「選んだ状態の中 (子状態にする)」を選んだうえで、下の「中に入れる複合状態」で親を選び直す
// 2 段だった。親の欄の既定は一覧の先頭で、図で選んだ状態とは無関係 (Off が勝手に複合状態になった)。
// 位置の選択肢に親を名前で並べ (「Run の中」「Run › Busy の中」)、1 つのプルダウンで選び終える。
// ここは値の読み書き (in:{id}) と、足した子の id を守る。画面の動き (確定後も保つ) は junior-09 の spec。
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

var SI = global.window.MA.stateInsert;
var ST = global.window.MA.modules.plantumlState;

var NESTED = [
  '@startuml',
  'state Off',
  'state Run {',
  '  state Busy {',
  '    state Tx',
  '  }',
  '}',
  'Off --> Run : on',
  '@enduml',
].join('\n');

describe('positions — 親は名前で並び、1 つのプルダウンで選び終える', function() {
  var parsed = ST.parse(NESTED);
  var ps = SI.positions(parsed, NESTED);

  test('「選んだ状態の中」の 1 行ではなく、親ごとに「{親} の中」が並ぶ', function() {
    var labels = ps.map(function(p) { return p.label; });
    expect(labels).toContain('Off の中');
    expect(labels).toContain('Run の中');
    expect(labels).toContain('Run › Busy の中');
    expect(labels.some(function(l) { return l.indexOf('選んだ状態の中') >= 0; })).toBe(false);
    expect(ps.map(function(p) { return p.value; })).not.toContain('inside');
  });

  test('値は in:{状態の id} (入れ子は 親.子)', function() {
    var busy = ps.filter(function(p) { return p.label === 'Run › Busy の中'; })[0];
    expect(busy.value).toBe('in:Run.Busy');
  });

  test('図の末尾と、この遷移の途中は今までどおり先頭に並ぶ', function() {
    expect(ps[0].value).toBe('end');
    expect(ps[1].value).toBe('transition');
  });
});

describe('parseWhere / insideValue / addedId', function() {
  test('in:X は親 X の中', function() {
    expect(SI.parseWhere('in:Run.Busy')).toEqual({ mode: 'inside', target: 'Run.Busy' });
    expect(SI.parseWhere(SI.insideValue('Run'))).toEqual({ mode: 'inside', target: 'Run' });
  });

  test('ほかの値はそのまま', function() {
    expect(SI.parseWhere('end').mode).toBe('end');
    expect(SI.parseWhere('').mode).toBe('end');
    expect(SI.parseWhere('transition').mode).toBe('transition');
    expect(SI.parseWhere('region:4')).toEqual({ mode: 'region', target: '4' });
  });

  test('足した状態の id は、親の中なら 親.子 (次の位置「その中」を指せる)', function() {
    expect(SI.addedId('in:Run', 'Busy')).toBe('Run.Busy');
    expect(SI.addedId('end', 'Run')).toBe('Run');
  });

  test('in:{親} で入れた子を parse すると、その id の状態が居る', function() {
    var parsed = ST.parse(NESTED);
    var out = SI.insertInside(NESTED, parsed, SI.parseWhere('in:Run.Busy').target, 'state Rx');
    var again = ST.parse(out);
    var ids = again.states.map(function(s) { return s.id; });
    expect(ids).toContain(SI.addedId('in:Run.Busy', 'Rx'));
  });

  test('中身の無い状態 (Off) の中へも 1 手で入る', function() {
    var parsed = ST.parse(NESTED);
    var out = SI.insertInside(NESTED, parsed, SI.parseWhere('in:Off').target, 'state Standby');
    expect(out).toContain('state Off {');
    expect(ST.parse(out).states.map(function(s) { return s.id; })).toContain('Off.Standby');
  });
});

// 他のテストファイルへ jsdom を持ち越さない。
if (prevWindow !== undefined) global.window = prevWindow;
if (prevDocument !== undefined) global.document = prevDocument;
depPaths.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
