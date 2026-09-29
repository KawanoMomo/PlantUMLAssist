'use strict';
// BLK-migrator-20260929-1155: 日本語名の状態と [*] を含む state 図 (corpus の state-12〜16) で、遷移の線・矢じり・ラベルに枠が出なかった。
//   - state のパーサが状態の名前を ASCII でしか読まず、`[*] --> 待機` / `待機 --> B : go` の遷移が 1 本も読めていなかった
//     (遷移の枠は SVG の data-source-line と DSL の遷移の行を突き合わせて作るので、読めない行には枠が出ない)
//   - PlantUML 1.2026.8 は修飾名の ASCII 以外の文字を `.` に置き換える (`待機` → `..`、`親` の中の開始 → `...start..`)。
//     名前の壊れた状態は描いた文字と包む複合状態の <g> で、開始・終了の入れ物は包む複合状態の <g> で当てる
//   - 下端の件数 (outline) は `-right->` / `-[#red]->` の矢印を数えず、state-15 が「1 state · 1 transition」だった
// fixtures/svg/state-jp-*.svg は下の DSL を同梱の plantuml.jar (1.2026.8) で描いたもの。
var fs = require('fs');
var path = require('path');
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
  '../src/core/outline.js',
  '../src/modules/state.js'
];
MODS.forEach(function(m) { delete require.cache[require.resolve(m)]; });
MODS.forEach(function(m) { require(m); });

var SM = window.MA.stateSvgMap;
var ST = window.MA.modules.plantumlState;
var OL = window.MA.outline;

var MIN = '@startuml\n[*] --> 待機\n待機 --> B : go\n@enduml\n';
var NESTED = '@startuml\nstate 親 {\n  [*] --> 子A\n  子A --> 子B : 行く\n}\n[*] --> 親\nstate Run {\n  [*] --> 待機\n  待機 : entry / 初期化\n}\n親 --> Run\n@enduml\n';

function frames(name, dsl) {
  var div = document.createElement('div');
  div.innerHTML = fs.readFileSync(path.join(__dirname, 'fixtures/svg/state-jp-' + name + '.svg'), 'utf8');
  var r = SM.collect(div.querySelector('svg'), ST.parse(dsl));
  return r.frames.map(function(f) { return f.type + ':' + f.id + '@' + f.line; });
}

describe('BLK-migrator-20260929-1155 日本語名の状態の遷移', function() {
  test('パーサが日本語名の状態の遷移を読む ([*] から・日本語から ASCII へ・ラベル付き)', function() {
    var p = ST.parse(MIN);
    expect(p.transitions.map(function(t) { return t.from + '>' + t.to + '@' + t.line + ':' + (t.label || ''); }))
      .toEqual(['[*]>待機@2:', '待機>B@3:go']);
  });

  test('日本語名の状態の宣言・説明・入れ子も読む', function() {
    var p = ST.parse('@startuml\nstate 待機\nstate 運転 {\n  [*] --> 駆動\n}\n待機 --> 運転\n待機 : entry / 初期化\n@enduml\n');
    var ids = p.states.map(function(s) { return s.id; });
    expect(ids.indexOf('待機') >= 0).toBe(true);
    expect(ids.indexOf('運転') >= 0).toBe(true);
    expect(p.transitions.length).toBe(2);
  });

  test('最小再現: 状態 2 つ・遷移 2 本・開始 1 つに、それぞれ本人の行の枠', function() {
    expect(frames('min', MIN)).toEqual([
      'state:待機@2', 'state:B@3', 'transition:__t_0@2', 'transition:__t_1@3', 'pseudo:start@@2',
    ]);
  });

  test('修飾名が壊れた入れ子 (`.` / `...A` / `...start..` / `Run...`) も、描いた文字と包む複合状態で当てる', function() {
    var got = frames('nested', NESTED);
    var want = [
      'state:親@2', 'state:親.子A@3', 'state:親.子B@4', 'state:Run@7', 'state:Run.待機@8',
      'transition:__t_1@4', 'transition:__t_3@8',
      'pseudo:start@親@3', 'pseudo:start@@6', 'pseudo:start@Run@8',
    ];
    expect(want.filter(function(w) { return got.indexOf(w) < 0; })).toEqual([]);
    // 名前の無い状態 ('' / '親' の取り違え) を作らない
    expect(got.filter(function(f) { return /^state:(@|\.)/.test(f); })).toEqual([]);
  });

  test('下端の件数: 向き・色・線種を挟んだ矢印も遷移に数える (state-15 の形)', function() {
    var dsl = ['@startuml', 'left to right direction', 'hide empty description', '[*] --> 待機',
      '待機 -right-> 準備 : 起動', '準備 -[#red]-> 異常 : 失敗', '準備 -[dashed]-> 運転 : 成功',
      '運転 -down-> 待機 : 停止', '異常 -[#blue,bold]-> 待機 : 復旧', '@enduml'].join('\n');
    expect(OL.countLabel(OL.build(dsl).counts, 'plantuml-state')).toBe('4 states · 6 transitions');
    // 今までの矢印の数え方は変わらない
    expect(OL.build('@startuml\nA -> B : x\nB --> A\nA ->x B\n@enduml').counts.relations).toBe(3);
  });
});

if (_prevWindow !== undefined) global.window = _prevWindow;
if (_prevDocument !== undefined) global.document = _prevDocument;
MODS.forEach(function(m) { try { delete require.cache[require.resolve(m)]; } catch (e) {} });
