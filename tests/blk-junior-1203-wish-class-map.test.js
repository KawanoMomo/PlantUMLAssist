'use strict';
// BLK-junior-20260908-1203-wish: クラス図の対応表と「＋この図にも足す」。
// 状態遷移図では先輩の変更をワンクリックで取り込めるのに、クラス図では
// 先輩版と読み比べて共通基底クラスと継承関係を手打ちしていた。しかも
// Relation フォームは From/To のどちらが親か分からず、逆向きに張ってしまう。
//
// 見たいこと:
//   - 先輩にしか無いクラス (DriverBase) が「参照図だけ」の行に出る
//   - その行はそのまま押せば足せる (聞き返さない)
//   - 先輩にしか無い継承関係は、向きを保ったまま (親 <|-- 子) 足せる
//   - 端点の名前が違っても、対応が付いていれば自分の名前で足す
//   - 対応の付かない端点だけ聞き返す
//   - 足したあと対応表を作り直すと、その行の「参照図だけ」が消える
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

[
  '../src/core/html-utils.js',
  '../src/core/relation-roles.js',
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/core/relation-options.js',
  '../src/core/state-transition.js',
  '../src/modules/state.js',
  '../src/modules/class.js',
  '../src/core/state-map.js',
  '../src/core/class-map.js',
].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});

const cm = global.window.MA.classMap;
const clMod = global.window.MA.modules.plantumlClass;

// 先輩の図。共通基底クラス DriverBase と、そこからの継承が 2 本ある。
const SENIOR_DSL = [
  '@startuml',
  'abstract class DriverBase',
  'class GpioDrv',
  'class AdcDrv',
  'DriverBase <|-- GpioDrv',
  'DriverBase <|-- AdcDrv',
  '@enduml',
].join('\n');

// 自分の図。DriverBase が無く、継承も無い。
const MINE_DSL = [
  '@startuml',
  'class GpioDrv',
  'class AdcDrv',
  '@enduml',
].join('\n');

function build(refDsl, mineDsl) {
  var ref = clMod.parse(refDsl);
  var mine = clMod.parse(mineDsl);
  return { map: cm.build(ref, mine), mine: mine };
}

function rowOf(map, type, name) {
  var rows = (type === 'class' ? map.states : map.transitions);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].match === 'ref-only' && rows[i].ref.indexOf(name) >= 0) return rows[i];
  }
  return null;
}

describe('クラス図の対応表 (BLK-junior-20260908-1203-wish)', function() {

  test('先輩にしか無いクラスは「参照図だけ」の行に出る', function() {
    var b = build(SENIOR_DSL, MINE_DSL);
    var row = rowOf(b.map, 'class', 'DriverBase');
    expect(row).not.toBeNull();
    expect(row.refKind).toBe('abstract');
  });

  test('名前が違うだけのクラスは対応が付く (CanDrv と CanDriver)', function() {
    var b = build('@startuml\nclass CanDrv\n@enduml', '@startuml\nclass CanDriver\n@enduml');
    var paired = b.map.states.filter(function(r) {
      return r.ref === 'CanDrv' && r.mine === 'CanDriver';
    });
    expect(paired.length).toBe(1);
    expect(paired[0].match).toBe('partial');
  });

  test('関係の行は親子が読める形で出る (矢印の向きを憶えなくてよい)', function() {
    var b = build(SENIOR_DSL, MINE_DSL);
    var row = rowOf(b.map, 'relation', 'GpioDrv');
    expect(row).not.toBeNull();
    expect(row.ref).toBe('継承: 親 DriverBase ← 子 GpioDrv');
  });

  test('参照図だけのクラスは聞き返さずに足せる (種別も写す)', function() {
    var b = build(SENIOR_DSL, MINE_DSL);
    var row = rowOf(b.map, 'class', 'DriverBase');
    var plan = cm.adoptPlan(row, b.map, b.mine);
    expect(plan.adoptable).toBe(true);
    expect(plan.ready).toBe(true);
    var out = cm.applyAdopt(MINE_DSL, row, b.map, b.mine, null);
    expect(out.text.split('\n')[out.line - 1]).toBe('abstract class DriverBase');
    expect(out.text.split('\n').pop()).toBe('@enduml');
  });

  test('継承関係は向きを保って足せる (親 <|-- 子。逆向きにならない)', function() {
    var first = build(SENIOR_DSL, MINE_DSL);
    var withBase = cm.applyAdopt(
      MINE_DSL, rowOf(first.map, 'class', 'DriverBase'), first.map, first.mine, null).text;
    var b = build(SENIOR_DSL, withBase);
    var row = rowOf(b.map, 'relation', '子 GpioDrv');
    expect(row).not.toBeNull();
    var plan = cm.adoptPlan(row, b.map, b.mine);
    expect(plan.ready).toBe(true);
    var out = cm.applyAdopt(withBase, row, b.map, b.mine, null);
    expect(out.text.split('\n')[out.line - 1]).toBe('DriverBase <|-- GpioDrv');
    // 足した行を読み直しても親子が入れ替わらない。
    var re = clMod.parse(out.text).relations.filter(function(r) { return r.kind === 'inheritance'; })[0];
    expect(re.from).toBe('DriverBase');
    expect(re.to).toBe('GpioDrv');
  });

  test('端点の名前が違っても、対応が付いていれば自分の名前で足す', function() {
    // 先輩の CanDrv は自分では CanDriver。継承を足すと自分の名前で入る。
    var senior = '@startuml\nabstract class DriverBase\nclass CanDrv\nDriverBase <|-- CanDrv\n@enduml';
    var mine = '@startuml\nabstract class DriverBase\nclass CanDriver\n@enduml';
    var b = build(senior, mine);
    var row = rowOf(b.map, 'relation', '子 CanDrv');
    expect(row).not.toBeNull();
    var out = cm.applyAdopt(mine, row, b.map, b.mine, null);
    expect(out.text.split('\n')[out.line - 1]).toBe('DriverBase <|-- CanDriver');
  });

  test('対応の付かない端点だけ聞き返す (親子の呼び名で聞く)', function() {
    var b = build(SENIOR_DSL, MINE_DSL);
    var row = rowOf(b.map, 'relation', '子 GpioDrv');
    var plan = cm.adoptPlan(row, b.map, b.mine);
    expect(plan.ready).toBe(false);
    expect(plan.needs.length).toBe(1);
    expect(plan.needs[0].side).toBe('from');
    expect(plan.needs[0].sideLabel).toBe('親');
    // 聞き返しで自分のクラスを選べば、そちらを親にして足す。
    var out = cm.applyAdopt(MINE_DSL, row, b.map, b.mine, { from: 'AdcDrv' });
    expect(out.text.split('\n')[out.line - 1]).toBe('AdcDrv <|-- GpioDrv');
  });

  test('聞き返しで「新しく作る」を選ぶと、そのクラスも一緒に足す', function() {
    var b = build(SENIOR_DSL, MINE_DSL);
    var row = rowOf(b.map, 'relation', '子 GpioDrv');
    var out = cm.applyAdopt(MINE_DSL, row, b.map, b.mine, { from: cm.NEW_CLASS });
    var lines = out.text.split('\n');
    expect(lines.indexOf('class DriverBase') >= 0).toBe(true);
    expect(lines[out.line - 1]).toBe('DriverBase <|-- GpioDrv');
  });

  test('足したあと作り直すと、その行の「参照図だけ」が消える', function() {
    var b = build(SENIOR_DSL, MINE_DSL);
    var out = cm.applyAdopt(MINE_DSL, rowOf(b.map, 'class', 'DriverBase'), b.map, b.mine, null);
    var again = build(SENIOR_DSL, out.text);
    expect(rowOf(again.map, 'class', 'DriverBase')).toBeNull();
  });

  test('種類の違う関係は組にしない (継承と依存を一致にしない)', function() {
    var senior = '@startuml\nclass A\nclass B\nA <|-- B\n@enduml';
    var mine = '@startuml\nclass A\nclass B\nA ..> B\n@enduml';
    var b = build(senior, mine);
    var kinds = b.map.transitions.map(function(r) { return r.match; }).sort();
    expect(kinds).toEqual(['mine-only', 'ref-only']);
  });

  test('見出しは片方だけの件数を先に言う', function() {
    var b = build(SENIOR_DSL, MINE_DSL);
    expect(cm.summary(b.map).indexOf('参照図だけ 3')).toBe(0);
  });

  test('日本語名のクラスは別名を作って足す (パーサに読める id にする)', function() {
    var senior = '@startuml\nclass "共通ドライバ基底" as C1\nclass GpioDrv\nC1 <|-- GpioDrv\n@enduml';
    var mine = '@startuml\nclass GpioDrv\n@enduml';
    var b = build(senior, mine);
    var row = rowOf(b.map, 'class', '共通ドライバ基底');
    expect(row).not.toBeNull();
    var out = cm.applyAdopt(mine, row, b.map, b.mine, null);
    var added = clMod.parse(out.text).elements.filter(function(e) { return e.label === '共通ドライバ基底'; });
    expect(added.length).toBe(1);
    expect(/^[A-Za-z_][A-Za-z0-9_]*$/.test(added[0].id)).toBe(true);
  });
});
