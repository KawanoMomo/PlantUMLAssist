'use strict';
// FEAT-138 (resolves UI-016 / HFR-073): 選択中 message の矢印を `d` 1 打で `->` / `-->` の
// 2 値で切り替える (直接切替キー)。
//
// 検証の方針 (tests/feat-014-delete-key.test.js の前例に揃える):
//  - DSL 書き換え本体 (sequence.updateMessage) は実モジュールを相手に**挙動として**検証する。
//  - app.js は run-tests.js の sourceFiles に含まれず (DOM 依存が大きい) sandbox に載らないため、
//    キーのルーティング・ガード・切替の 2 値性はソース走査で固定する。
//    実機での発火は E3 / E4 で確認する。
//
// E5 の区分申告 (loop_agent/feature_implementer.md [R-1])。本ファイルの追加テストは全 11 件。
//  - (a) 新しい振る舞いを主張するテスト = 4 件。いずれも実装前の FAIL を観測済み:
//      1. [AC-1] 同一ルーターの key 判定に d が含まれる
//      2. [AC-1][AC-2] 切替は `-->` を既定の相手とする 2 値であり、剰余演算を使わない
//      3. [AC-3] 分岐は pushHistory() を経由して updateMessage の結果を書き戻す
//      4. [AC-6] 分岐は message 以外の選択で早期 return する
//  - (b) 回帰ガード / 非退行テスト = 7 件。実装前から PASS する:
//      1. [AC-1 DSL 面] `->` の行が `-->` になり、他の行は 1 バイトも変わらない
//      2. [AC-2 DSL 面] `-->` の行が `->` に戻る
//      3. [AC-9] label / stereotype は arrow 書き換えで変化しない
//      4. [AC-6 DSL 面] message でない行を指すと DSL は 1 バイトも変わらない
//      5. [AC-7] ARROWS の定義行が逐語で不変である
//      6. [AC-7] ARROWS は 10 要素のままである
//      7. [AC-4][AC-5] 修飾キー弾き / 入力欄 / modal のガードがルーター先頭に残っている

var fs = require('fs');
var path = require('path');

var seq = (typeof window !== 'undefined' && window.MA && window.MA.modules && window.MA.modules.plantumlSequence)
  || (global.window && global.window.MA && global.window.MA.modules && global.window.MA.modules.plantumlSequence);

var BASE = [
  '@startuml',
  'actor User',
  'participant System',
  'User -> System : Request',
  'System --> User : Response',
  '@enduml',
].join('\n');

function markerIndex(haystack, marker) {
  var i = haystack.indexOf(marker);
  if (i < 0) throw new Error('marker not found: ' + marker);
  return i;
}

// ─────────────────────────────────────────────────────────────────────────
// (b) 回帰ガード: DSL 書き換え本体の挙動。実装前から PASS する。
// ─────────────────────────────────────────────────────────────────────────
describe('FEAT-138 updateMessage の arrow 書き換え (挙動)', function() {
  test('[AC-1 DSL 面] `->` の行が `-->` になり、他の行は 1 バイトも変わらない', function() {
    var out = seq.updateMessage(BASE, 4, 'arrow', '-->');
    var a = BASE.split('\n');
    var b = out.split('\n');
    expect(b[3]).toBe('User --> System : Request');
    expect(b[3]).not.toBe(a[3]);
    expect(b[0]).toBe(a[0]);
    expect(b[1]).toBe(a[1]);
    expect(b[2]).toBe(a[2]);
    expect(b[4]).toBe(a[4]);
    expect(b[5]).toBe(a[5]);
  });

  test('[AC-2 DSL 面] `-->` の行が `->` に戻る', function() {
    var out = seq.updateMessage(BASE, 5, 'arrow', '->');
    expect(out.split('\n')[4]).toBe('System -> User : Response');
    expect(out.split('\n')[4]).not.toBe(BASE.split('\n')[4]);
  });

  test('[AC-9] label / stereotype は arrow 書き換えで変化しない', function() {
    var src = BASE.replace('User -> System : Request',
      'User -> System : <<create>> Request');
    var out = seq.updateMessage(src, 4, 'arrow', '-->');
    expect(out).toContain('<<create>> Request');
    expect(out.split('\n')[3]).toBe('User --> System : <<create>> Request');
  });

  test('[AC-6 DSL 面] message でない行を指すと DSL は 1 バイトも変わらない', function() {
    // 2 行目は `actor User` (participant 行) であり MSG_RE に一致しない。
    var out = seq.updateMessage(BASE, 2, 'arrow', '-->');
    expect(out).toBe(BASE);
    // 範囲外の行番号でも同じ。
    expect(seq.updateMessage(BASE, 99, 'arrow', '-->')).toBe(BASE);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// (b) 回帰ガード: 不可触の固定。実装前から PASS する。
// ─────────────────────────────────────────────────────────────────────────
describe('FEAT-138 不可触の固定 (非退行)', function() {
  var seqSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'sequence.js'), 'utf-8');

  test('[AC-7] ARROWS の定義行が逐語で不変である', function() {
    expect(seqSrc).toContain(
      "var ARROWS = ['->', '-->', '->>', '-->>', '<-', '<--', '<<-', '<<--', '<->', '<-->'];");
  });

  test('[AC-7] ARROWS は 10 要素のままである', function() {
    var m = seqSrc.match(/var ARROWS = \[([^\]]*)\];/);
    expect(!!m).toBe(true);
    expect(m[1].split(',').length).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// (a) 新しい振る舞い: app.js の `d` 分岐。実装前は FAIL する。
// ─────────────────────────────────────────────────────────────────────────
describe('FEAT-138 app.js の d キー分岐 (ソース走査)', function() {
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf-8');
  var m = src.match(/if \(key !== 'ArrowUp'[\s\S]*?\) return;/);
  var keyGuard = m ? m[0] : '';

  // `d` 分岐だけを切り出す。終端は分岐末尾の `return;` を含む位置までとする。
  function dBranch() {
    var i = markerIndex(src, "if (key === 'd')");
    var seg = src.slice(i, i + 900);
    return seg;
  }

  test('[AC-1] 同一ルーターの key 判定に d が含まれる', function() {
    expect(keyGuard.length).toBeGreaterThan(0);
    expect(keyGuard).toContain("key !== 'd'");
  });

  test('[AC-1][AC-2] 切替は `-->` を既定の相手とする 2 値であり、剰余演算を使わない', function() {
    var b = dBranch();
    expect(b).toContain("=== '-->' ? '->' : '-->'");
    expect(b.indexOf('%')).toBe(-1);
    expect(b.indexOf('ARROWS')).toBe(-1);
  });

  test('[AC-3] 分岐は pushHistory() を経由して updateMessage の結果を書き戻す', function() {
    var b = dBranch();
    expect(b).toContain('window.MA.history.pushHistory()');
    expect(b).toContain("updateMessage(mmdText, cur.line, 'arrow'");
    // 空振り (text 不変) では undo 段を増やさない。
    expect(b).toContain('=== mmdText) return;');
  });

  test('[AC-6] 分岐は message 以外の選択で早期 return する', function() {
    var b = dBranch();
    expect(b).toContain("cur.type !== 'message'");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// (b) 回帰ガード: 既存ガードの共有。実装前から PASS する。
// ─────────────────────────────────────────────────────────────────────────
describe('FEAT-138 既存ガードの共有 (非退行)', function() {
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf-8');

  test('[AC-4][AC-5] 修飾キー弾き / 入力欄 / modal のガードがルーター先頭に残っている', function() {
    var ROUTER_START = "if (key !== 'ArrowUp'";
    var head = src.slice(markerIndex(src, ROUTER_START) - 400, markerIndex(src, ROUTER_START) + 400);
    expect(head).toContain('e.isComposing || e.keyCode === 229');
    expect(head).toContain('e.ctrlKey || e.metaKey || e.altKey || e.shiftKey');
    expect(head).toContain('_kbdInTypingTarget()');
    expect(head).toContain('_kbdModalOpen()');
  });
});
