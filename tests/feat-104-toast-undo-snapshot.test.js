'use strict';
// FEAT-104 (resolves UI-011): 削除トーストの「元に戻す」を、グローバル undo スタックの
// pop ではなく「削除直前のスナップショットへの直接復元」にする。
// 🔴 中核ケースは「操作の直後に何もしない」以外である。UI-011 逐語:
// 「6秒以内に他の編集を1つでも行うと無関係な操作を取り消す」。
// 実装前のコード (_toastUndo が window.MA.history.undo() を呼ぶ) では AC-1/2/4/5 が FAIL する。
var fs = require('fs');
var path = require('path');
var jsdom = require('jsdom');
var ROOT = path.join(__dirname, '..');

// run-tests.js の sandbox window には document.body が無く props 描画を実行できない。
// toast.test.js と同じ方針で jsdom の window を用意し、必要なソースをその window に読み込む。
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body><div id="props"></div></body></html>');
var W = dom.window;
var loadErrors = [];
[
  'src/core/html-utils.js', 'src/core/dsl-utils.js', 'src/core/regex-parts.js',
  'src/core/id-normalizer.js', 'src/core/line-resolver.js', 'src/core/formatter-interface.js',
  'src/core/dsl-updater.js', 'src/core/props-renderer.js', 'src/core/text-updater.js',
  'src/core/parser-utils.js', 'src/core/history.js', 'src/core/selection.js',
  'src/ui/properties.js', 'src/ui/rich-label-editor.js', 'src/modules/sequence.js',
].forEach(function(rel) {
  var code = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
  try {
    var fn = new Function('window', 'document', 'localStorage', 'alert', 'confirm', 'prompt', code);
    fn(W, W.document, { getItem: function() { return null; }, setItem: function() {} },
       function() {}, function() { return true; }, function() { return null; });
  } catch (e) { loadErrors.push(rel + ': ' + e.message); }
});
var SEQ = W.MA && W.MA.modules && W.MA.modules.plantumlSequence;

var FIXTURE = ['@startuml', 'participant Alice', 'participant Bob',
  'Alice -> Bob : first', 'Alice -> Bob : second', 'Alice -> Bob : third', '@enduml'].join('\n');

// app.js の代替となる最小 ctx。
var text = '';
var ctx = {
  getMmdText: function() { return text; },
  setMmdText: function(t) { text = t; },
  onUpdate: function() {},
};

function reset() {
  text = FIXTURE;
  W.MA.history.init(ctx);            // history は undoStack を閉じ込めているので
  while (W.MA.history.canUndo()) W.MA.history.undo();   // 残留分を空振りさせて捨てる
  text = FIXTURE;
  if (W.MA.toast) W.MA.toast.dismiss();
}

function deleteButtonForLine(line) {
  var propsEl = W.document.getElementById('props');
  var parsed = SEQ.parseSequence(text);
  var rel = (parsed.relations || []).filter(function(r) { return r.line === line; })[0];
  if (!rel) throw new Error('no relation at line ' + line);
  SEQ.renderProps([{ type: 'message', id: rel.id, line: line }], parsed, propsEl, ctx);
  var btn = propsEl.querySelector('.seq-delete-line[data-line="' + line + '"]');
  if (!btn) throw new Error('seq-delete-line button not rendered for line ' + line);
  return btn;
}

function undoButton() { return W.document.querySelector('.ma-toast-undo'); }

// トースト表示中に起きる「無関係な編集」。実アプリのラベル編集と同じく pushHistory を
// 伴う — これが UI-011 の再現条件である。
function intervalEdit(newLabel) {
  W.MA.history.pushHistory();
  text = text.replace('third', newLabel);
  ctx.onUpdate();
}

describe('FEAT-104 sources load into a live DOM', function() {
  test('no source eval errors', function() { expect(loadErrors.join(' | ')).toBe(''); });
  test('sequence module is available', function() { expect(!!SEQ).toBe(true); });
});

describe('FEAT-104 / UI-011: 削除トーストの「元に戻す」はスナップショット復元である', function() {
  beforeEach(reset);

  test('[AC-3] 削除直後に何もせず「元に戻す」で削除行が復元される (FEAT-015 の回帰なし)', function() {
    var before = text;
    deleteButtonForLine(5).click();
    expect(text.indexOf('second')).toBe(-1);
    undoButton().click();
    expect(text).toBe(before);
  });

  test('[AC-1] トースト表示中に別の編集をしても「元に戻す」で削除行が復元される', function() {
    var before = text;
    deleteButtonForLine(5).click();
    expect(text.indexOf('second')).toBe(-1);
    intervalEdit('third-EDITED');
    undoButton().click();
    expect(text.indexOf('Alice -> Bob : second') >= 0).toBe(true);
    // 復元先は削除直前のスナップショットであって、割り込み編集前の状態ではない。
    expect(text).toBe(before);
  });

  test('[AC-2] [AC-1] の途中で行ったラベル編集が「元に戻す」で取り消されていない', function() {
    deleteButtonForLine(5).click();
    intervalEdit('third-EDITED');
    // 旧実装 (undo() の pop) では取り消されるのは割り込み編集の方であり second は戻らない。
    undoButton().click();
    expect(text.indexOf('second') >= 0).toBe(true);
  });

  test('[AC-4] 「元に戻す」の後に undo すると復元前 (削除済み) の状態へ戻る', function() {
    deleteButtonForLine(5).click();
    var afterDelete = text;
    undoButton().click();
    expect(text.indexOf('second') >= 0).toBe(true);
    W.MA.history.undo();
    expect(text).toBe(afterDelete);
  });

  test('[AC-5] 一括削除経路も割り込み編集の影響を受けない', function() {
    var before = text;
    var propsEl = W.document.getElementById('props');
    var parsed = SEQ.parseSequence(text);
    var multi = [
      { type: 'message', id: parsed.relations[0].id, line: 4 },
      { type: 'message', id: parsed.relations[1].id, line: 5 },
    ];
    W.MA.selection.setSelected(multi);   // getRange() が範囲を返さないと bulk は描画されない
    SEQ.renderProps(multi, parsed, propsEl, ctx);
    var bulk = propsEl.querySelector('.seq-bulk-delete');
    expect(bulk === null).toBe(false);   // 逃げ道を作らない: 未描画なら FAIL させる
    bulk.click();
    expect(text.indexOf('first')).toBe(-1);
    intervalEdit('third-EDITED');
    undoButton().click();
    expect(text).toBe(before);
  });
});

// group 削除経路は props の描画に end 行検出を要し実行時再現が重いため、
// 3 経路すべてがスナップショットを渡していることをソースで確定させる。
describe('FEAT-104: _toastUndo はグローバル undo に依存しない', function() {
  var SRC = fs.readFileSync(path.join(ROOT, 'src', 'modules', 'sequence.js'), 'utf-8');
  test('_toastUndo の本体に window.MA.history.undo() が無い', function() {
    var i = SRC.indexOf('function _toastUndo(');
    expect(i >= 0).toBe(true);
    var open = SRC.indexOf('{', i), depth = 0, body = '';
    for (var j = open; j < SRC.length; j++) {
      if (SRC[j] === '{') depth++;
      else if (SRC[j] === '}') { depth--; if (depth === 0) { body = SRC.slice(open, j + 1); break; } }
    }
    expect(body.indexOf('window.MA.history.undo()')).toBe(-1);
    expect(body.indexOf('pushHistory()') >= 0).toBe(true);
  });
  test('3 つの削除経路がすべてスナップショットを渡している', function() {
    ["_toastUndo('1 件削除しました', _snap, ctx)",
     "_toastUndo('ブロックの開始行と end 行を削除しました (中身は保持)', _snap, ctx)",
     "_toastUndo(removed + ' 件削除しました', _snap, ctx)"].forEach(function(call) {
      expect(SRC.indexOf(call) >= 0).toBe(true);
    });
  });
});
