'use strict';
// TICKET-roadmap-20261115-2114-4: 残した画面の語を製品仕様書の語に揃える。
// - 仕様書 docs/spec/product-spec.md の「入口」で「」に囲んだ語が、画面 (plantuml-assist.html と src/) に実在する
// - 仕様書の「画面の語」の表と src/ui/terms.js が一致する
// - 6 図種の右パネルで、同じ役の欄 (名前 (id)・表示名・ステレオタイプ・種類・削除…) が同じ語で出て、
//   別の言い方 (Alias・Label・Stereotype・Type・更新・クラスを削除・「○○ / English」の併記) が出ない
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');

var ROOT = path.join(__dirname, '..');
var SPEC = fs.readFileSync(path.join(ROOT, 'docs', 'spec', 'product-spec.md'), 'utf8');

function cellsOf(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function(c) { return c.trim(); });
}

// 画面の文字の元: HTML と src/ の JS をつないだもの。
function screenSources() {
  var out = [fs.readFileSync(path.join(ROOT, 'plantuml-assist.html'), 'utf8')];
  (function walk(dir) {
    fs.readdirSync(dir).forEach(function(f) {
      var p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.js$/.test(f)) out.push(fs.readFileSync(p, 'utf8'));
    });
  })(path.join(ROOT, 'src'));
  return out.join('\n');
}

// 仕様書の表の行のうち「入口」の列 (見出しが「入口」の列) にある「…」の語。
function entryWords(text) {
  var words = [], col = -1;
  text.split(/\r?\n/).forEach(function(line) {
    if (!/^\|/.test(line)) { col = -1; return; }
    var c = cellsOf(line);
    if (c.indexOf('入口') >= 0) { col = c.indexOf('入口'); return; }
    if (col < 0 || /^-+$/.test(c[0])) return;
    var m, re = /「([^」]+)」/g;
    while ((m = re.exec(c[col] || ''))) words.push({ word: m[1], row: c[1] });
  });
  return words;
}

// 仕様書の「画面の語」の表: { key: 語 }。
function specTerms(text) {
  var i = text.indexOf('### 画面の語');
  var out = {};
  if (i < 0) return out;
  var body = text.slice(i).split(/\r?\n## /)[0];
  body.split(/\r?\n/).forEach(function(line) {
    var m = /^\|\s*`(\w+)`\s*\|/.exec(line);
    if (!m) return;
    out[m[1]] = cellsOf(line)[1];
  });
  return out;
}

// 右パネルを jsdom で描く。
var prevWindow = global.window, prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
var doc = dom.window.document;
var CORE = ['html-utils', 'dsl-utils', 'regex-parts', 'id-normalizer', 'line-resolver', 'formatter-interface', 'text-updater',
  'dsl-updater', 'parser-utils', 'props-renderer', 'overlay-builder', 'history', 'selection', 'selection-reorder',
  'swimlane-move', 'activity-insert', 'label-colors', 'note-edit', 'note-block', 'relation-kind-cards', 'relation-options',
  'relation-roles', 'relation-add', 'group-notation', 'group-place', 'seq-place', 'sequence-marks', 'sequence-autonumber',
  'sequence-participant-zone', 'sequence-scaffold', 'sequence-group-range', 'sequence-activation-insert', 'insert-marker',
  'state-branch', 'state-transition', 'state-insert', 'state-tx-entry', 'state-child', 'state-collapse', 'class-scaffold',
  'class-derive', 'selected-endpoints', 'scaffold-notice', 'alias-hint', 'tail-kind-chips', 'tail-memory', 'activity-branch-pattern',
  'generated-part', 'add-kind-vocab', 'edge-hint', 'label-colors'];
// 読んだファイルは最後に require の控えから外す。後の test が自分の window で読み直せるように。
var LOADED = [];
CORE.forEach(function(c) {
  var p = path.join(ROOT, 'src', 'core', c + '.js');
  if (!fs.existsSync(p)) return;
  try { delete require.cache[require.resolve(p)]; require(p); LOADED.push(p); } catch (e) {}
});
['src/ui/terms.js', 'src/ui/properties.js', 'src/ui/rich-label-editor.js', 'src/modules/sequence.js', 'src/modules/usecase.js',
  'src/modules/component.js', 'src/modules/class.js', 'src/modules/activity.js', 'src/modules/state.js'].forEach(function(rel) {
  var p = path.join(ROOT, rel);
  delete require.cache[require.resolve(p)];
  require(p);
  LOADED.push(p);
});
var W = dom.window;
var TERMS = W.MA.terms;
var M = W.MA.modules;

function render(modName, lines, pick) {
  var mod = M[modName];
  var current = lines.join('\n');
  var parsed = mod.parse(current);
  var sel = pick(parsed);
  doc.body.innerHTML = '';
  var host = doc.createElement('div');
  doc.body.appendChild(host);
  mod.renderProps(sel, parsed, host, {
    getMmdText: function() { return current; }, setMmdText: function(t) { current = t; }, onUpdate: function() {},
  });
  var texts = [];
  Array.prototype.forEach.call(host.querySelectorAll('label, button, .rel-section-cap'), function(el) {
    texts.push(el.textContent.replace(/\s+/g, ' ').trim());
  });
  return texts;
}

function byLine(coll, line, type) {
  return function(parsed) {
    var hit = (parsed[coll] || []).filter(function(x) { return x.line === line; })[0];
    if (!hit) throw new Error(coll + ' の ' + line + ' 行目が無い');
    return [{ type: type || hit.kind, id: hit.id, line: hit.line }];
  };
}

function actionAt(line) {
  return function(parsed) {
    var node = null;
    (function walk(nodes) {
      (nodes || []).forEach(function(n) {
        if (n.line === line) node = n;
        if (n.branches) n.branches.forEach(function(b) { walk(b.body); });
        if (n.body) walk(n.body);
      });
    })(parsed.nodes);
    if (!node) throw new Error(line + ' 行目のアクションが無い');
    return [{ type: 'action', id: node.id, line: node.line }];
  };
}

// 6 図種の「選んだ要素」の右パネルと、そこに必ず出る役。
var PANELS = [
  { name: 'シーケンスの参加者', mod: 'plantumlSequence', roles: ['kind', 'id', 'label', 'renameRefs', 'del'],
    lines: ['@startuml', 'participant "利用者" as U', 'participant S', 'U -> S : 送る', '@enduml'], pick: byLine('elements', 2) },
  { name: 'シーケンスのメッセージ', mod: 'plantumlSequence', roles: ['arrow', 'lineColor', 'stereotype', 'inferActivation', 'del'],
    lines: ['@startuml', 'participant U', 'participant S', 'U -> S : 送る', '@enduml'], pick: byLine('relations', 4, 'message') },
  { name: 'ユースケースのアクター', mod: 'plantumlUsecase', roles: ['id', 'label', 'apply', 'renameRefs', 'del'],
    lines: ['@startuml', 'actor "利用者" as U', 'usecase "送る" as UC1', 'U --> UC1', '@enduml'], pick: byLine('elements', 2) },
  { name: 'ユースケースのユースケース', mod: 'plantumlUsecase', roles: ['id', 'label', 'apply', 'renameRefs', 'del'],
    lines: ['@startuml', 'actor "利用者" as U', 'usecase "送る" as UC1', 'U --> UC1', '@enduml'], pick: byLine('elements', 3) },
  { name: 'コンポーネント', mod: 'plantumlComponent', roles: ['id', 'label', 'stereotype', 'apply', 'renameRefs', 'del'],
    lines: ['@startuml', 'component "受付" as A <<svc>>', 'interface I', 'A --> I', '@enduml'], pick: byLine('elements', 2) },
  { name: 'クラス', mod: 'plantumlClass', roles: ['id', 'label', 'stereotype', 'apply', 'renameRefs', 'del'],
    lines: ['@startuml', 'class "注文" as Order <<entity>> {', '  +id : int', '}', 'class Item', 'Order --> Item', '@enduml'], pick: byLine('elements', 2) },
  { name: '状態', mod: 'plantumlState', roles: ['id', 'label', 'renameRefs', 'stereotype', 'apply', 'del'],
    lines: ['@startuml', 'state "待機" as Idle <<s>>', 'state Busy', 'Idle --> Busy : go', '@enduml'], pick: byLine('states', 2, 'state') },
  { name: 'アクション', mod: 'plantumlActivity', roles: ['edgeLabel', 'swimlane', 'reorder', 'apply', 'del'],
    lines: ['@startuml', '|A|', 'start', ':受け取る;', '|B|', ':返す;', 'stop', '@enduml'], pick: actionAt(4) },
];

// 同じ役の別の言い方。右パネルのどの欄・ボタンにも、この文字そのものは出ない。
var FORBIDDEN_EXACT = ['Alias', 'Alias (id)', 'Label', 'Stereotype', 'Type', '更新', 'クラスを削除', 'ラベル / Label', '削除 / Delete'];
// 日本語の語に「 / English」を併記した欄名 (関係の種類のカードの記法の添え書きは除く)。
var BILINGUAL = /[぀-ヿ一-鿿] \/ [A-Z][a-z]+/;

describe('TICKET-roadmap-20261115-2114-4: 仕様書の入口の語が画面に実在する', function() {
  var SRC = screenSources();
  var words = entryWords(SPEC);
  test('入口の「」の語を 20 語以上拾える (仕様書の書き方が変わっても黙って 0 件にならない)', function() {
    expect(words.length).toBeGreaterThanOrEqual(20);
  });
  words.forEach(function(w) {
    test('「' + w.word + '」(' + w.row + ') が画面の元にある', function() {
      expect(SRC.indexOf(w.word) >= 0).toBe(true);
    });
  });
});

describe('TICKET-roadmap-20261115-2114-4: 仕様書の「画面の語」と src/ui/terms.js が一致する', function() {
  var spec = specTerms(SPEC);
  test('表の役と terms.js の役が過不足なく同じ', function() {
    expect(Object.keys(spec).sort()).toEqual(Object.keys(TERMS).sort());
  });
  Object.keys(spec).forEach(function(k) {
    test('`' + k + '` は「' + spec[k] + '」', function() {
      expect(TERMS[k]).toBe(spec[k]);
    });
  });
});

describe('TICKET-roadmap-20261115-2114-4: 6 図種の右パネルで同じ役は同じ語', function() {
  PANELS.forEach(function(p) {
    var texts = render(p.mod, p.lines, p.pick);
    p.roles.forEach(function(role) {
      test(p.name + ' に「' + TERMS[role] + '」(' + role + ') が出る', function() {
        var hit = texts.some(function(t) { return t === TERMS[role] || t.indexOf(TERMS[role]) === 0; });
        if (!hit) throw new Error('出ている語: ' + texts.join(' | '));
      });
    });
    test(p.name + ' に別の言い方・併記が出ない', function() {
      var bad = texts.filter(function(t) {
        if (FORBIDDEN_EXACT.indexOf(t) >= 0) return true;
        return BILINGUAL.test(t) && !/(association|inheritance|implementation|composition|aggregation|dependency|nested|include|extend|generalization|provides|requires)/.test(t);
      });
      expect(bad).toEqual([]);
    });
  });
});

LOADED.forEach(function(p) { try { delete require.cache[require.resolve(p)]; } catch (e) {} });
global.window = prevWindow;
global.document = prevDocument;
