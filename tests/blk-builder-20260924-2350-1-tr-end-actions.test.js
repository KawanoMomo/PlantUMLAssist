'use strict';
// BLK-builder-20260924-2350-1 (design 4c「その他… ▾」の残り): 遷移を選んだ右パネルから、その遷移の From / To の状態に
// 状態内の動作 (entry / do / exit)・並行領域の区切り (--)・色・ステレオタイプを付ける。
// 遷移にだけ出る (宣言の無い) 状態にも書ける。
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

var depPaths = [
  '../src/core/html-utils.js',
  '../src/core/dsl-utils.js',
  '../src/core/state-transition.js',
  '../src/core/regex-parts.js',
  '../src/core/line-resolver.js',
  '../src/core/text-updater.js',
  '../src/core/dsl-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/props-renderer.js',
  '../src/core/overlay-builder.js',
  '../src/core/relation-options.js',
  '../src/core/state-child.js',
  '../src/core/state-insert.js',
  '../src/ui/properties.js',
  '../src/modules/state.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var st = global.window.MA.modules.plantumlState;

var NL = '\n';
var SAMPLE = ['@startuml', '[*] --> Idle', 'Idle --> Running : start', 'Running --> Idle : stop', 'Running --> [*] : done', '@enduml'].join(NL);
var DECL = ['@startuml', 'state Idle', 'state Busy {', '  state Sub', '}', 'Idle --> Busy : go', '@enduml'].join(NL);

function trOf(text, i) {
  var parsed = st.parse(text);
  return { parsed: parsed, tr: parsed.transitions[i] };
}

describe('相手の状態 — 遷移の From / To ([*] は選べない)', function() {
  test('既定は To、続けて From', function() {
    var p = trOf(SAMPLE, 1);
    var ends = st.transitionEndOptions(p.parsed, p.tr);
    expect(ends.map(function(e) { return e.label; })).toEqual(['Running (To)', 'Idle (From)']);
  });
  test('[*] からの遷移では To だけ', function() {
    var p = trOf(SAMPLE, 0);
    expect(st.transitionEndOptions(p.parsed, p.tr).map(function(e) { return e.value; })).toEqual(['to']);
  });
});

describe('状態内の動作', function() {
  test('宣言の無い状態にも `状態 : entry / 本文` を書ける', function() {
    var p = trOf(SAMPLE, 1);
    var r = st.applyToTransitionEnd(SAMPLE, p.parsed, p.tr, { kind: 'behavior', target: 'to', bkind: 'entry', value: 'motorOn()' });
    expect(r.reason).toBe('');
    expect(r.line).toBe('Running : entry / motorOn()');
    expect(r.text.split(NL)).toContain('Running : entry / motorOn()');
    expect(r.text.split(NL).pop()).toBe('@enduml');
  });
  test('宣言のある単純状態は宣言の直後に入る。本文が空なら何もしない', function() {
    var p = trOf(DECL, 0);
    var r = st.applyToTransitionEnd(DECL, p.parsed, p.tr, { kind: 'behavior', target: 'from', bkind: 'exit', value: 'log()' });
    expect(r.text.split(NL)[2]).toBe('Idle : exit / log()');
    var none = st.applyToTransitionEnd(DECL, p.parsed, p.tr, { kind: 'behavior', target: 'from', value: '' });
    expect(none.text).toBe(DECL);
    expect(none.reason).toContain('本文');
  });
  test('複合状態は { } の中 (子になってしまう) ではなく閉じの後に書く', function() {
    var p = trOf(DECL, 0);
    var r = st.applyToTransitionEnd(DECL, p.parsed, p.tr, { kind: 'behavior', target: 'to', bkind: 'do', value: 'poll()' });
    var lines = r.text.split(NL);
    expect(lines.indexOf('Busy : do / poll()')).toBe(lines.indexOf('}') + 1);
  });
});

describe('並行領域に分ける', function() {
  test('相手が複合状態ならその閉じの前に --', function() {
    var p = trOf(DECL, 0);
    var r = st.applyToTransitionEnd(DECL, p.parsed, p.tr, { kind: 'region', target: 'to' });
    var lines = r.text.split(NL);
    expect(lines[lines.indexOf('}') - 1].trim()).toBe('--');
  });
  test('中を持たない状態では足さず、理由を返す', function() {
    var p = trOf(SAMPLE, 1);
    var r = st.applyToTransitionEnd(SAMPLE, p.parsed, p.tr, { kind: 'region', target: 'to' });
    expect(r.text).toBe(SAMPLE);
    expect(r.reason).toContain('複合状態');
  });
});

describe('状態の色・ステレオタイプ', function() {
  test('宣言の無い状態には `state 名前 <<…>> #色` を足す', function() {
    var p = trOf(SAMPLE, 1);
    var r = st.applyToTransitionEnd(SAMPLE, p.parsed, p.tr, { kind: 'look', target: 'to', color: '#LightBlue', stereotype: 'safety' });
    expect(r.line).toBe('state Running <<safety>> #LightBlue');
    expect(r.text.split(NL)).toContain('state Running <<safety>> #LightBlue');
  });
  test('宣言のある状態はその行に付ける (複合状態の { は残る)', function() {
    var p = trOf(DECL, 0);
    var r = st.applyToTransitionEnd(DECL, p.parsed, p.tr, { kind: 'look', target: 'to', color: 'Pink' });
    expect(r.text.split(NL)[2]).toBe('state Busy #Pink {');
  });
  test('どちらも空なら何もしない', function() {
    var p = trOf(SAMPLE, 1);
    var r = st.applyToTransitionEnd(SAMPLE, p.parsed, p.tr, { kind: 'look', target: 'to' });
    expect(r.text).toBe(SAMPLE);
    expect(r.reason).toContain('色');
  });
});

global.window = prevWindow;
global.document = prevDocument;
