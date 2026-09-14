'use strict';
// BLK-builder-20260907-1306-2 / design 5d「UML 要素の網羅一覧」の State 行。
//
// 仕様: State の「その他パレット」には fork / join、入口・出口ポイント、
// entry / do / exit、並行領域、色・ステレオタイプ が畳まれる。
// このうち色だけが実装されていなかった。ここでは
//   - 状態行の色 (`state Foo #red`) と遷移行の線の色 (`A -[#red]-> B`) を読めること
//   - 色を付ける / 外せること
//   - 他の項目 (ラベル・ステレオタイプ・trigger など) を書き換えても色が残ること
//   - 右ペインが色を「その他… ▾」に畳んで出すこと
// を検証する。
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
  '../src/ui/properties.js',
  '../src/modules/state.js',
];
depPaths.forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var stMod = global.window.MA.modules.plantumlState;
var P = global.window.MA.properties;
var RO = global.window.MA.relationOptions;

function line(text, n) { return text.split('\n')[n - 1].trim(); }

var SRC = [
  '@startuml',
  'state Idle',
  'state "処理中" as Busy <<choice>> #red',
  '[*] --> Idle',
  'Idle -[#blue]-> Busy : start [ready] / log()',
  '@enduml',
].join('\n');

describe('状態行の色を読む', function() {
  test('色のない状態は color が空', function() {
    var st = stMod.parse(SRC).states[0];
    expect(st.id).toBe('Idle');
    expect(st.color).toBe('');
  });

  test('ステレオタイプの後ろの色を読む。ラベルもステレオタイプも壊れない', function() {
    var st = stMod.parse(SRC).states[1];
    expect(st.id).toBe('Busy');
    expect(st.label).toBe('処理中');
    expect(st.stereotype).toBe('choice');
    expect(st.color).toBe('red');
  });

  test('composite の開き行にも色を置ける', function() {
    var p = stMod.parse('@startuml\nstate Outer #green {\nstate Inner\n}\n@enduml');
    expect(p.states[0].id).toBe('Outer');
    expect(p.states[0].color).toBe('green');
    expect(p.states[1].parentId).toBe('Outer');
  });
});

describe('遷移行の線の色を読む', function() {
  test('色のない遷移は color が空', function() {
    var tr = stMod.parse(SRC).transitions[0];
    expect(tr.from).toBe('[*]');
    expect(tr.to).toBe('Idle');
    expect(tr.color).toBe('');
  });

  test('-[#blue]-> の色を読み、from / to / ラベルの分解は変わらない', function() {
    var tr = stMod.parse(SRC).transitions[1];
    expect(tr.from).toBe('Idle');
    expect(tr.to).toBe('Busy');
    expect(tr.color).toBe('blue');
    expect(tr.trigger).toBe('start');
    expect(tr.guard).toBe('ready');
    expect(tr.action).toBe('log()');
  });
});

describe('色を付ける / 外す', function() {
  test('色のない状態に色を入れる', function() {
    var out = stMod.updateState(SRC, 2, { color: 'orange' });
    expect(line(out, 2)).toBe('state Idle #orange');
  });

  test('もう一度「既定」を押すと色が消える', function() {
    var out = stMod.updateState(SRC, 3, { color: '' });
    expect(line(out, 3)).toBe('state "処理中" as Busy <<choice>>');
  });

  test('色を変えてもラベル・ステレオタイプは残る', function() {
    var out = stMod.updateState(SRC, 3, { color: 'green' });
    expect(line(out, 3)).toBe('state "処理中" as Busy <<choice>> #green');
  });

  test('ラベルを書き換えても色は失われない', function() {
    var out = stMod.updateState(SRC, 3, { label: '実行中' });
    expect(line(out, 3)).toBe('state "実行中" as Busy <<choice>> #red');
  });

  test('ステレオタイプを外しても色は失われない', function() {
    var out = stMod.updateState(SRC, 3, { stereotype: null });
    expect(line(out, 3)).toBe('state "処理中" as Busy #red');
  });

  test('composite の開き行の色を変えても `{` は残る', function() {
    var src = '@startuml\nstate Outer #green {\nstate Inner\n}\n@enduml';
    var out = stMod.updateState(src, 2, { color: 'red' });
    expect(line(out, 2)).toBe('state Outer #red {');
  });
});

describe('遷移の線の色を付ける / 外す', function() {
  test('色のない遷移に色を入れる', function() {
    var out = stMod.updateTransition(SRC, 4, { color: 'red' });
    expect(line(out, 4)).toBe('[*] -[#red]-> Idle');
  });

  test('「既定」で色が消え、ラベルは残る', function() {
    var out = stMod.updateTransition(SRC, 5, { color: '' });
    expect(line(out, 5)).toBe('Idle --> Busy : start [ready] / log()');
  });

  test('trigger を書き換えても色は失われない', function() {
    var out = stMod.updateTransition(SRC, 5, { trigger: 'go' });
    expect(line(out, 5)).toBe('Idle -[#blue]-> Busy : go [ready] / log()');
  });

  test('from / to を入れ替えても色は失われない', function() {
    var out = stMod.updateTransition(SRC, 5, { from: 'Busy', to: 'Idle' });
    expect(line(out, 5)).toBe('Busy -[#blue]-> Idle : start [ready] / log()');
  });

  test('色を付けた行をもう一度読み直せる (往復する)', function() {
    var out = stMod.updateTransition(SRC, 4, { color: 'violet' });
    var tr = stMod.parse(out).transitions[0];
    expect(tr.color).toBe('violet');
    expect(tr.from).toBe('[*]');
    expect(tr.to).toBe('Idle');
  });
});

describe('その他パレットの HTML', function() {
  test('色は既定のときは畳まれて出る', function() {
    var html = P.colorPaletteHtml('st-more', { colors: RO.COLORS, current: '' });
    expect(html).toContain('id="st-more-btn"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('▾');
  });

  test('色が付いているときは開いた状態で出る', function() {
    var html = P.colorPaletteHtml('st-more', { colors: RO.COLORS, current: 'red' });
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain('<div id="st-more" hidden');
  });

  test('色見本は relation-options の COLORS と同じ数・同じ並びで出る', function() {
    var html = P.colorPaletteHtml('st-more', { colors: RO.COLORS, current: '' });
    var count = (html.match(/class="prop-color-swatch/g) || []).length;
    expect(count).toBe(RO.COLORS.length);
    expect(html).toContain('data-value="red"');
    expect(html).toContain('data-value="blue"');
  });

  test('選んでいる色だけ aria-pressed が true', function() {
    var html = P.colorPaletteHtml('st-more', { colors: RO.COLORS, current: 'blue' });
    var pressed = (html.match(/aria-pressed="true"/g) || []).length;
    expect(pressed).toBe(1);
  });
});

describe('その他パレットの押下', function() {
  test('見本を押すと、その色が onPick に渡る', function() {
    document.body.innerHTML = P.colorPaletteHtml('st-more', { colors: RO.COLORS, current: '' });
    var picked = [];
    P.bindColorPalette('st-more', function(v) { picked.push(v); });
    var btns = document.querySelectorAll('#st-more-colors .prop-color-swatch');
    btns[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(picked).toEqual([RO.COLORS[1].value]);
  });

  test('見出しを押すと開閉する', function() {
    document.body.innerHTML = P.colorPaletteHtml('st-more', { colors: RO.COLORS, current: '' });
    P.bindColorPalette('st-more', function() {});
    var panel = document.getElementById('st-more');
    var btn = document.getElementById('st-more-btn');
    expect(panel.hasAttribute('hidden')).toBe(true);
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(panel.hasAttribute('hidden')).toBe(false);
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(panel.hasAttribute('hidden')).toBe(true);
  });
});

global.window = prevWindow;
global.document = prevDocument;
