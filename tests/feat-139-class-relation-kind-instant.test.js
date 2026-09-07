'use strict';
// FEAT-139 (resolves HFR-076): Class 図の関連種別 <select> (cl-rel-kind) を変えた時点で
// DSL に反映し、「変更を反映」(cl-rel-apply) のクリックを不要にする。
//
// ハーネスの前提 (着手前に本 run が実測):
//   tests/run-tests.js の sandbox の document は getElementById が常に null を返すスタブであり、
//   renderProps が組む DOM を駆動できない。よって feat-104-toast-undo-snapshot.test.js と
//   同じ方針で jsdom の window を用意し、必要なソースをその window へ読み込む。
//   (src/app.js は sourceFiles に無いが、本 FEAT の変更先は src/modules/class.js のみであり
//    app.js には依存しない。)
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var ROOT = path.join(__dirname, '..');

var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body><div id="props"></div></body></html>');
var W = dom.window;
var loadErrors = [];
[
  'src/core/html-utils.js', 'src/core/dsl-utils.js', 'src/core/regex-parts.js',
  'src/core/id-normalizer.js', 'src/core/line-resolver.js', 'src/core/formatter-interface.js',
  'src/core/dsl-updater.js', 'src/core/props-renderer.js', 'src/core/text-updater.js',
  'src/core/parser-utils.js', 'src/core/history.js', 'src/core/selection.js',
  'src/core/relation-options.js',
  'src/ui/properties.js', 'src/modules/class.js',
].forEach(function(rel) {
  var code = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
  try {
    var fn = new Function('window', 'document', 'localStorage', 'alert', 'confirm', 'prompt', code);
    fn(W, W.document, { getItem: function() { return null; }, setItem: function() {} },
       function() {}, function() { return true; }, function() { return null; });
  } catch (e) { loadErrors.push(rel + ': ' + e.message); }
});
var CL = W.MA && W.MA.modules && W.MA.modules.plantumlClass;

var FIXTURE = ['@startuml', 'class Foo', 'class Bar', 'Foo -- Bar', '@enduml'].join('\n');

var text = '';
var updates = 0;
var ctx = {
  getMmdText: function() { return text; },
  setMmdText: function(t) { text = t; },
  onUpdate: function() { updates++; },
};

function reset() {
  text = FIXTURE;
  W.MA.history.init(ctx);
  while (W.MA.history.canUndo()) W.MA.history.undo();
  text = FIXTURE;
  updates = 0;
}

// 関連 (L4) を選択した状態の右パネルを描画し、propsEl を返す。
function renderRelationProps() {
  var propsEl = W.document.getElementById('props');
  var parsed = CL.parse(text);
  var rel = (parsed.relations || [])[0];
  if (!rel) throw new Error('no relation parsed from fixture');
  CL.renderProps([{ type: 'relation', id: rel.id, line: rel.line }], parsed, propsEl, ctx);
  return propsEl;
}

function historyDepth() {
  var n = 0;
  while (W.MA.history.canUndo()) { W.MA.history.undo(); n++; }
  return n;
}

// <select> の値を変え change イベントを発火する (人間の操作と同じ経路)。
function selectKind(propsEl, value) {
  var sel = propsEl.querySelector('#cl-rel-kind');
  if (!sel) throw new Error('cl-rel-kind not rendered');
  sel.value = value;
  sel.dispatchEvent(new W.Event('change', { bubbles: true }));
  return sel;
}

describe('FEAT-139 sources load into a live DOM', function() {
  test('no source eval errors', function() { expect(loadErrors.join(' | ')).toBe(''); });
  test('class module is available', function() { expect(!!CL).toBe(true); });
});

describe('FEAT-139 / HFR-076: Class 関連の種別は選ぶだけで反映される', function() {
  beforeEach(reset);

  test('[AC-1] cl-rel-kind の change だけで DSL の関連記法が変わる (変更を反映は押さない)', function() {
    var propsEl = renderRelationProps();
    var before = text;
    expect(before.indexOf('Foo -- Bar') >= 0).toBe(true);
    selectKind(propsEl, 'composition');
    // 「変更を反映」は一度も押していない。
    expect(text).not.toBe(before);
    expect(text.indexOf('Foo *-- Bar') >= 0).toBe(true);
  });

  test('[AC-2] [AC-1] の変更が Ctrl+Z 1 回で元に戻る (履歴 1 step)', function() {
    var propsEl = renderRelationProps();
    var before = text;
    selectKind(propsEl, 'composition');
    expect(text).not.toBe(before);
    W.MA.history.undo();
    expect(text).toBe(before);
  });

  test('[AC-3] 種別変更の直後に「変更を反映」を押しても二重適用されず履歴も増えない', function() {
    var propsEl = renderRelationProps();
    selectKind(propsEl, 'aggregation');
    var afterChange = text;
    expect(afterChange.indexOf('Foo o-- Bar') >= 0).toBe(true);
    propsEl.querySelector('#cl-rel-apply').click();
    // 二重適用されない (DSL が変わらない)。
    expect(text).toBe(afterChange);
    // 履歴も増えない: undo 1 回でフィクスチャへ戻り、それ以上 undo できない。
    expect(historyDepth()).toBe(1);
  });

  test('[AC-4] 同じ種別を選び直したときは DSL も履歴も変化しない', function() {
    var propsEl = renderRelationProps();
    var before = text;
    selectKind(propsEl, 'association');   // フィクスチャは association のまま
    expect(text).toBe(before);
    expect(historyDepth()).toBe(0);
  });

  test('[AC-5] From / To / Label は即時反映されず「変更を反映」でのみ確定する (非退行)', function() {
    var propsEl = renderRelationProps();
    var before = text;
    var lbl = propsEl.querySelector('#cl-rel-label');
    lbl.value = 'uses';
    lbl.dispatchEvent(new W.Event('change', { bubbles: true }));
    lbl.dispatchEvent(new W.Event('input', { bubbles: true }));
    // 即時反映していない。
    expect(text).toBe(before);
    propsEl.querySelector('#cl-rel-apply').click();
    // 「変更を反映」でのみ確定する。
    expect(text).not.toBe(before);
    expect(text.indexOf('uses') >= 0).toBe(true);
  });
});
