'use strict';
// FEAT-014 (resolves UI-002 / HFR-001): Delete / Backspace で選択中メッセージ行を削除する。
//
// 検証の方針:
//  - 削除本体 (sequence.deleteSelectedLine) は window.MA.history / window.MA.selection の
//    実モジュールを相手に**挙動として**検証する (ソース文字列の照合ではない)。
//  - app.js は run-tests.js の sourceFiles に含まれず (DOM 依存が大きい) sandbox に載らないため、
//    キーのルーティングとガードの共有はソース走査で固定する。実機での発火は E3/E4 で確認する。
//
// UI-011 (FEAT-015 への Major 指摘) を踏まえ、「操作直後に何もしない」以外のシナリオを
// 明示的に含める: (a) 連続削除、(b) 削除と別編集が交互に挟まる場合の undo の順序。

var fs = require('fs');
var path = require('path');

var seq = (typeof window !== 'undefined' && window.MA && window.MA.modules && window.MA.modules.plantumlSequence)
  || (global.window && global.window.MA && global.window.MA.modules && global.window.MA.modules.plantumlSequence);
var MA = (typeof window !== 'undefined' && window.MA) || (global.window && global.window.MA);

var BASE = [
  '@startuml',
  'actor User',
  'participant System',
  'User -> System : Request',
  'System --> User : Response',
  '@enduml',
].join('\n');

// history / selection の実モジュールを相手にした ctx を組み立てる。
function makeCtx(initialText) {
  var st = { text: initialText, updates: 0 };
  var ctx = {
    getMmdText: function() { return st.text; },
    setMmdText: function(s) { st.text = s; },
    onUpdate: function() { st.updates++; },
  };
  MA.history.init({
    getMmdText: ctx.getMmdText,
    setMmdText: ctx.setMmdText,
    onUpdate: function() {},
  });
  st.ctx = ctx;
  return st;
}

describe('FEAT-014 deleteSelectedLine (挙動)', function() {
  test('capability と関数が公開されている', function() {
    expect(typeof seq.deleteSelectedLine).toBe('function');
    expect(seq.capabilities.deleteSelectedLine).toBe(true);
  });

  test('指定行だけを削除し onUpdate を1回呼ぶ', function() {
    var st = makeCtx(BASE);
    seq.deleteSelectedLine(st.ctx, 4);
    expect(st.text.indexOf('User -> System : Request')).toBe(-1);
    expect(st.text).toContain('System --> User : Response');
    expect(st.text).toContain('actor User');
    expect(st.updates).toBe(1);
  });

  test('削除後に選択が解除される (消えた行を選択したままにしない)', function() {
    var st = makeCtx(BASE);
    MA.selection.setSelected([{ type: 'message', id: 'm1', line: 4 }]);
    seq.deleteSelectedLine(st.ctx, 4);
    expect(MA.selection.getSelected().length).toBe(0);
  });

  test('削除前に pushHistory され undo で元に戻る', function() {
    var st = makeCtx(BASE);
    seq.deleteSelectedLine(st.ctx, 4);
    expect(st.text === BASE).toBe(false);
    MA.history.undo();
    expect(st.text).toBe(BASE);
  });

  test('範囲外の行番号では本文を壊さない', function() {
    var st = makeCtx(BASE);
    seq.deleteSelectedLine(st.ctx, 999);
    expect(st.text).toBe(BASE);
  });
});

// 🔴 UI-011 型の欠陥 (「直後に何もしない」単一シナリオしか見ていない) を作らないための検証。
describe('FEAT-014 連続実行と割り込みシナリオ', function() {
  test('連続して2回削除しても毎回正しい行が消え、undo 2回で完全に戻る', function() {
    var st = makeCtx(BASE);
    seq.deleteSelectedLine(st.ctx, 4);            // Request 行
    var afterFirst = st.text;
    expect(afterFirst.indexOf('Request')).toBe(-1);
    expect(afterFirst).toContain('Response');
    seq.deleteSelectedLine(st.ctx, 4);            // 繰り上がった Response 行
    expect(st.text.indexOf('Response')).toBe(-1);
    MA.history.undo();
    expect(st.text).toBe(afterFirst);
    MA.history.undo();
    expect(st.text).toBe(BASE);
  });

  test('削除と別編集が挟まっても、undo は「直前の1操作」から順に取り消す', function() {
    var st = makeCtx(BASE);
    seq.deleteSelectedLine(st.ctx, 4);            // (1) 削除
    var afterDelete = st.text;
    MA.history.pushHistory();                     // (2) 別の編集 (ラベル編集相当)
    st.text = st.text.replace('Response', 'Resp2');
    expect(st.text).toContain('Resp2');
    MA.history.undo();                            // (2) だけが取り消される
    expect(st.text).toBe(afterDelete);
    expect(st.text.indexOf('Request')).toBe(-1);  // 削除は戻っていない (グローバル undo の約束どおり)
    MA.history.undo();                            // (1) が取り消される
    expect(st.text).toBe(BASE);
  });
});

describe('FEAT-014 app.js のキールーティングとガード (ソース走査)', function() {
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf-8');
  // FEAT-012/017 のルーターの key 判定行を切り出す。
  // 判定は複数行に折り返されうるため `) return;` までを 1 単位として取る。
  var m = src.match(/if \(key !== 'ArrowUp'[\s\S]*?\) return;/);
  var keyGuard = m ? m[0] : '';

  test('同一ルーターの key 判定に Delete と Backspace が含まれる', function() {
    expect(keyGuard.length).toBeGreaterThan(0);
    expect(keyGuard).toContain("key !== 'Delete'");
    expect(keyGuard).toContain("key !== 'Backspace'");
  });

  test('Delete 経路が deleteSelectedLine を呼ぶ', function() {
    expect(src).toContain("moduleHas('deleteSelectedLine')");
    expect(src).toContain('deleteSelectedLine(');
  });

  test('既存ガード (IME / 修飾キー / 入力欄 / modal / 単独選択) を共有したままである', function() {
    var router = src.slice(src.indexOf("if (key !== 'ArrowUp'") - 400);
    router = router.slice(0, router.indexOf("// FEAT-012: DSL 行順で"));
    expect(router).toContain('e.isComposing || e.keyCode === 229');
    expect(router).toContain('e.ctrlKey || e.metaKey || e.altKey || e.shiftKey');
    expect(router).toContain('_kbdInTypingTarget()');
    expect(router).toContain('_kbdModalOpen()');
    expect(router).toContain('_kbdSelectedMessage()');
  });
});
