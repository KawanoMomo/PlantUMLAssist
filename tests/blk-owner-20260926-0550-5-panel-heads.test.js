'use strict';
// BLK-owner-20260926-0550-5: 右ペインの見出しと欄名を図種で揃える。
// - 追加フォームの見出しは 6 図種で「末尾に追加」(途中に入れるときは下の「追加する位置」で選ぶ)
// - 選択パネルの見出しは「{種類} · N 行目」(範囲を持つものは「2–5 行目」)。「State (L6)」「Message · L5」
//   「PACKAGE (L2-5)」の形を残さない
// - 状態の選択パネルの欄名は日本語 (ID / Behaviors / Move into: / Move を出さない)
// - 境界 (package / rectangle) のパネルに開発の版の書き置き (v0.4.0: …) を出さない
// - シーケンスの図に出る文字の欄は部品を問わず「本文」
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var ROOT = path.join(__dirname, '..');

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body><div id="props"></div></body></html>');
var W = dom.window;
var loadErrors = [];
// run-tests.js と同じ順で読む (モジュールが使う core を漏らさない)。
var list = fs.readFileSync(path.join(__dirname, 'run-tests.js'), 'utf-8')
  .match(/'src\/[^']+\.js'/g).map(function(s) { return s.slice(1, -1); });
// シーケンスの本文欄はリッチラベルの欄で描く (run-tests.js の一覧には無い)。
list.splice(list.indexOf('src/modules/sequence.js'), 0, 'src/ui/rich-label-editor.js');
list.forEach(function(rel) {
  var p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return;
  try {
    var fn = new Function('window', 'document', 'localStorage', 'alert', 'confirm', 'prompt', fs.readFileSync(p, 'utf-8'));
    fn(W, W.document, { getItem: function() { return null; }, setItem: function() {} },
       function() {}, function() { return true; }, function() { return null; });
  } catch (e) { loadErrors.push(rel + ': ' + e.message); }
});
var MA = W.MA;
var P = MA.properties;

function ctxOf(dsl) {
  var cur = dsl;
  return { getMmdText: function() { return cur; }, setMmdText: function(t) { cur = t; }, onUpdate: function() {} };
}
function host() {
  W.document.body.innerHTML = '';
  var el = W.document.createElement('div');
  W.document.body.appendChild(el);
  return el;
}
function render(mod, dsl, sel) {
  var el = host();
  var m = MA.modules[mod];
  m.renderProps(sel || [], m.parse(dsl), el, ctxOf(dsl));
  return el;
}

var OLD_HEAD = /\(L\d+(-\d+)?\)|· L\d+/;

describe('BLK-owner-20260926-0550-5 見出しの形', function() {
  test('読み込み', function() {
    expect(loadErrors.length === 0 ? '' : loadErrors.join(' | ')).toBe('');
  });
  test('lineHead は「{種類} · N 行目」、範囲は「N–M 行目」', function() {
    expect(P.lineHead('State', 6)).toBe('State · 6 行目');
    expect(P.lineHead('境界', 2, 5)).toBe('境界 · 2–5 行目');
    expect(P.lineHead('Block', 3, 3)).toBe('Block · 3 行目');
    expect(P.lineHead('Block', 3, 0)).toBe('Block · 3 行目');
  });
});

describe('追加フォームの見出しは 6 図種で「末尾に追加」', function() {
  var CASES = [
    ['plantumlSequence', '@startuml\nparticipant A\nparticipant B\nA -> B : hi\n@enduml'],
    ['plantumlClass', '@startuml\nclass A\n@enduml'],
    ['plantumlComponent', '@startuml\ncomponent A\n@enduml'],
    ['plantumlUsecase', '@startuml\nactor U\n(Login)\n@enduml'],
    ['plantumlState', '@startuml\n[*] --> Idle\nIdle --> Run : go\n@enduml'],
    ['plantumlActivity', '@startuml\nstart\n:Hello;\nstop\n@enduml'],
  ];
  CASES.forEach(function(c) {
    test(c[0], function() {
      var el = render(c[0], c[1], []);
      var heads = Array.prototype.map.call(el.querySelectorAll('label'), function(l) { return l.textContent.trim(); });
      expect(heads.indexOf('末尾に追加') >= 0).toBe(true);
      expect(heads.indexOf('追加 / Add') >= 0).toBe(false);
      expect(heads.indexOf('追加') >= 0).toBe(false);
    });
  });
});

describe('状態の選択パネル', function() {
  var DSL = ['@startuml', '[*] --> Idle', 'state Run {', '  state Busy', '}', 'state Idle', 'Idle --> Run : go', '@enduml'].join('\n');
  test('見出しは「State · N 行目」、欄名は日本語', function() {
    var parsed = MA.modules.plantumlState.parse(DSL);
    var idle = parsed.states.filter(function(s) { return s.id === 'Idle'; })[0];
    var el = render('plantumlState', DSL, [{ type: 'state', id: 'Idle', line: idle.line }]);
    var head = el.querySelector('#st-sel-head');
    expect(!!head).toBe(true);
    expect(head.textContent).toBe('State · ' + idle.line + ' 行目');
    var t = el.textContent;
    expect(OLD_HEAD.test(head.textContent)).toBe(false);
    expect(t).toContain('名前 (id)');
    expect(t).toContain('状態内の動作 (entry / do / exit)');
    expect(t).toContain('入れる先の複合状態');
    expect(t).not.toContain('Behaviors');
    expect(t).not.toContain('Move into');
    expect(el.querySelector('#st-move-into').textContent).toBe('移す');
  });
});

describe('境界のパネル (コンポーネント・ユースケース・クラス)', function() {
  function groupPanel(mod, dsl) {
    var parsed = MA.modules[mod].parse(dsl);
    var g = parsed.groups[0];
    var el = host();
    MA.modules[mod].renderProps([{ type: g.kind, id: g.id }], parsed, el, ctxOf(dsl));
    return { el: g ? el : null, g: g };
  }
  test('コンポーネント図: 「境界 · 2–5 行目」、版の書き置きを出さない', function() {
    var r = groupPanel('plantumlComponent', '@startuml\npackage Mcal {\n  component Spi\n  component Dio\n}\n@enduml');
    var t = r.el.textContent;
    expect(t).toContain('境界 · 2–5 行目');
    expect(t).toContain('名前: Mcal');
    expect(t).not.toContain('PACKAGE');
    expect(t).not.toContain('Label:');
    expect(/v0\.\d/.test(t)).toBe(false);
  });
  test('ユースケース図: 「境界 · 2–4 行目」、版の書き置きを出さない', function() {
    var r = groupPanel('plantumlUsecase', '@startuml\nrectangle Sys {\n  (Login)\n}\nactor U\n@enduml');
    var t = r.el.textContent;
    expect(t).toContain('境界 · 2–4 行目');
    expect(t).not.toContain('PACKAGE');
    expect(/v0\.\d/.test(t)).toBe(false);
  });
  test('クラス図: 「境界 · 2–4 行目」', function() {
    var r = groupPanel('plantumlClass', '@startuml\npackage Drv {\n  class Spi\n}\n@enduml');
    expect(r.el.textContent).toContain('境界 · 2–4 行目');
    expect(r.el.textContent).not.toContain('PACKAGE');
  });
});

describe('シーケンスの選択パネル', function() {
  var DSL = ['@startuml', 'participant A', 'participant B', 'A -> B : hi', 'note left of A : memo', '@enduml'].join('\n');
  test('メッセージの見出しは「Message · N 行目」', function() {
    var parsed = MA.modules.plantumlSequence.parse(DSL);
    var m = parsed.relations.filter(function(r) { return r.line === 4; })[0];
    var el = render('plantumlSequence', DSL, [{ type: 'message', id: m.id, line: 4 }]);
    expect(el.textContent).toContain('Message · 4 行目');
    expect(el.textContent).not.toContain('· L4');
  });
  test('注釈の本文の欄は「本文」(Text と言わない)', function() {
    var parsed = MA.modules.plantumlSequence.parse(DSL);
    var n = parsed.elements.filter(function(e) { return e.kind === 'note'; })[0];
    var el = render('plantumlSequence', DSL, [{ type: 'note', id: n.id, line: n.line }]);
    expect(el.textContent).toContain('Note · 5 行目');
    var labels = Array.prototype.map.call(el.querySelectorAll('label'), function(l) { return l.textContent.trim(); });
    expect(labels.indexOf('本文') >= 0).toBe(true);
    expect(labels.indexOf('Text') >= 0).toBe(false);
  });
});
