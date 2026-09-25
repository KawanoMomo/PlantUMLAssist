'use strict';
// BLK-builder-20260925-2010-1 (data-loss): 右パネルのステレオタイプ欄に無いステレオタイプ (<<history*>> / <<end>> / <<inputPin>> …) の
// 状態で「更新」を押すと、名前を直しただけでもステレオタイプが消えて図が別物になっていた。
// 欄は書かれたままの字を選んだ形で出し、選び直さなければ書かれたままの字 (大文字小文字も) を残す。
// 深い履歴は PlantUML の書き方 `<<history*>>` で書く (`<<historyDeep>>` はふつうの状態として描かれる)。
var jsdom = require('jsdom');

var _prevWindow = global.window;
var _prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;

var MODS = [
  '../src/core/html-utils.js',
  '../src/core/dsl-utils.js',
  '../src/core/regex-parts.js',
  '../src/core/id-normalizer.js',
  '../src/core/dsl-updater.js',
  '../src/core/text-updater.js',
  '../src/core/parser-utils.js',
  '../src/core/line-resolver.js',
  '../src/core/overlay-builder.js',
  '../src/core/state-svg-map.js',
  '../src/core/state-transition.js',
  '../src/core/state-child.js',
  '../src/modules/state.js'
];
MODS.forEach(function(m) { delete require.cache[require.resolve(m)]; });
MODS.forEach(function(m) { require(m); });

var ST = window.MA.modules.plantumlState;

function stateOf(src, id) {
  return ST.parse(src).states.filter(function(s) { return s.id === id; })[0];
}
// 右パネルの「更新」と同じ渡し方: 欄の値を stereoToWrite に通して updateState へ
function pressUpdate(src, id, fields, stereoValue) {
  var st = stateOf(src, id);
  var opts = ST.stereoOptions(st);
  var shown = opts.filter(function(o) { return o.selected; })[0].value;
  var v = stereoValue === undefined ? shown : stereoValue;
  return ST.updateState(src, st.line, {
    id: fields.id != null ? fields.id : st.id.split('.').pop(),
    label: fields.label != null ? fields.label : st.label,
    stereotype: ST.stereoToWrite(st, v)
  });
}

describe('欄に無いステレオタイプは「更新」で消えない', function() {
  ['history*', 'end', 'start', 'inputPin', 'outputPin', 'expansionInput', 'expansionOutput', 'sdlreceive', 'MyType'].forEach(function(k) {
    test('<<' + k + '>> の状態の名前を直しても、ステレオタイプは書かれたままの字で残る', function() {
      var src = '@startuml\nstate Comp {\n  state H2 <<' + k + '>>\n}\n@enduml';
      var out = pressUpdate(src, 'Comp.H2', { id: 'H3', label: 'H3' });
      expect(out.split('\n')[2]).toBe('  state H3 <<' + k + '>>');
    });
  });
  test('欄は書かれたままの字を選んだ形で出す (history* は深い履歴の選択肢、end は書かれたまま)', function() {
    var o1 = ST.stereoOptions(stateOf('@startuml\nstate H2 <<history*>>\n@enduml', 'H2'));
    expect(o1.filter(function(o) { return o.selected; }).map(function(o) { return o.value; })).toEqual(['history*']);
    var o2 = ST.stereoOptions(stateOf('@startuml\nstate E1 <<End>>\n@enduml', 'E1'));
    var sel = o2.filter(function(o) { return o.selected; });
    expect(sel.length).toBe(1);
    expect(sel[0].value).toBe('End');
    expect(o2[0].selected).toBe(false);
  });
  test('欄にあるステレオタイプも、選び直さなければ大文字小文字を変えない', function() {
    var out = pressUpdate('@startuml\nstate C1 <<Choice>>\n@enduml', 'C1', { label: 'C1' });
    expect(out.split('\n')[1]).toBe('state C1 <<Choice>>');
  });
  test('色だけ変えてもステレオタイプの字は変わらない', function() {
    var out = ST.updateState('@startuml\nstate I1 <<inputPin>>\n@enduml', 2, { color: 'pink' });
    expect(out.split('\n')[1]).toBe('state I1 <<inputPin>> #pink');
  });
  test('選び直せばそのステレオタイプに、(none) を選べば外れる', function() {
    var src = '@startuml\nstate E1 <<end>>\n@enduml';
    expect(pressUpdate(src, 'E1', {}, 'choice').split('\n')[1]).toBe('state E1 <<choice>>');
    expect(pressUpdate(src, 'E1', {}, '').split('\n')[1]).toBe('state E1');
  });
});

describe('入れ子の状態の ID 欄 (親.子) を直さずに「更新」しても、ID は付け替わらない', function() {
  var SRC = '@startuml\nstate Comp {\n  state H2 <<history*>>\n  state A\n  A --> H2\n}\n@enduml';
  test('欄の字が `親.子` のままなら、宣言行の名前がそのまま ID になる', function() {
    var p = ST.parse(SRC);
    var st = stateOf(SRC, 'Comp.H2');
    expect(ST.idFieldToWrite(st, 'Comp.H2', p)).toEqual({ id: 'H2', label: 'H2', valid: true });
  });
  test('子の名前だけを直せば、その名前になる', function() {
    var p = ST.parse(SRC);
    expect(ST.idFieldToWrite(stateOf(SRC, 'Comp.H2'), 'Comp.H3', p).id).toBe('H3');
    expect(ST.idFieldToWrite(stateOf(SRC, 'Comp.H2'), 'H4', p).id).toBe('H4');
  });
  test('ラベルだけ直した「更新」は宣言行のラベルだけを変える', function() {
    var p = ST.parse(SRC);
    var st = stateOf(SRC, 'Comp.H2');
    var norm = ST.idFieldToWrite(st, st.id, p);
    var out = ST.updateState(SRC, st.line, { id: norm.id, label: 'Resume', stereotype: ST.stereoToWrite(st, 'history*') });
    expect(out).toBe(SRC.replace('state H2 <<', 'state "Resume" as H2 <<'));
  });
});

describe('深い履歴は <<history*>> で書き、そう読む', function() {
  test('欄で深い履歴を選ぶと <<history*>> が書かれ、深い履歴として読まれる', function() {
    var out = pressUpdate('@startuml\nstate H\n@enduml', 'H', {}, 'history*');
    expect(out.split('\n')[1]).toBe('state H <<history*>>');
    var st = stateOf(out, 'H');
    expect(st.kind).toBe('historyDeep');
    expect(ST.stereoOptions(st).filter(function(o) { return o.selected; })[0].value).toBe('history*');
  });
  test('<<history*>> の状態は深い履歴なので、子を足す親の候補に出ない', function() {
    var st = stateOf('@startuml\nstate H2 <<history*>>\n@enduml', 'H2');
    expect(window.MA.stateChild.canHaveChild(st)).toBe(false);
  });
  test('欄に historyDeep (PlantUML がふつうの状態として描く字) は出さない', function() {
    var o = ST.stereoOptions(stateOf('@startuml\nstate H\n@enduml', 'H'));
    expect(o.map(function(x) { return x.value; })).not.toContain('historyDeep');
  });
});

global.window = _prevWindow;
global.document = _prevDocument;
MODS.forEach(function(m) { delete require.cache[require.resolve(m)]; });
