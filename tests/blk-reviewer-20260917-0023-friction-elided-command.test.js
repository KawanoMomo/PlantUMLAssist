'use strict';
// BLK-reviewer-20260917-0023-friction: 手順1 の再検証で、done の BLK 本文の
// 「確認コマンド:」行が `node tools/blk-check.js … --run` のように「…」(実パスを
// 省いた記法) のまま書かれていると、--run がそれを文字通り実行し
// 「BLK フォルダが無い: …」で失敗した。実際には直っているのに毎回
// 「コマンドが失敗したため確認できず」の誤判定が返る。
// 「…」は <保存フォルダ> と同じ「埋まっていない穴」であって引数ではない。

var digest = require('../src/core/blk-digest');

describe('省略記法「…」を含む確認コマンドは実行せず、省略として言う', function() {
  test('「…」は埋まらない穴として扱い runnable にしない', function() {
    var r = digest.resolveCommand('node tools/blk-check.js … --run', {});
    expect(r.runnable).toBe(false);
    expect(r.elided).toEqual(['…']);
    // --folder / --prev では埋まらないので missing には入れない (案内が変わる)。
    expect(r.missing).toEqual([]);
  });

  test('実パスが埋まっていれば「…」が無い限り従来どおり走る', function() {
    var r = digest.resolveCommand('node tools/blk-check.js E:/01_Loop/loop/blockers --run', {});
    expect(r.runnable).toBe(true);
    expect(r.elided).toEqual([]);
  });

  test('パスの途中の「…」も、連続した「…」も省略として拾う', function() {
    expect(digest.resolveCommand('node tools/audit.js E:/…/blockers', {}).runnable).toBe(false);
    expect(digest.resolveCommand('node x.js ……', {}).elided.length).toBeGreaterThan(0);
  });

  test('単独の ... (半角 3 点) も省略として扱う', function() {
    var r = digest.resolveCommand('node tools/blk-check.js ... --run', {});
    expect(r.runnable).toBe(false);
    expect(r.elided).toEqual(['...']);
  });

  test('語の内側の ... は省略と見なさない (ファイル名を壊さない)', function() {
    // 拡張子や実在の名前に現れる ... は引数の一部。
    var r = digest.resolveCommand('node tools/audit.js D:/a...b/c --summary', { });
    expect(r.elided).toEqual([]);
    expect(r.runnable).toBe(true);
  });

  test('<保存フォルダ> と「…」が混ざっても両方を挙げる', function() {
    var r = digest.resolveCommand('node tools/audit.js <保存フォルダ> --since-files …', {});
    expect(r.runnable).toBe(false);
    expect(r.missing).toEqual(['<保存フォルダ>']);
    expect(r.elided).toEqual(['…']);
    // folder を渡しても「…」が残る限り走らせない。
    var half = digest.resolveCommand('node tools/audit.js <保存フォルダ> --since-files …',
      { folder: 'D:/now' });
    expect(half.missing).toEqual([]);
    expect(half.runnable).toBe(false);
  });

  test('省略で実行しなかった回は「コマンドが失敗」にしない', function() {
    // 実行しなければ failed は立たない = 誤判定の元が消える。
    var blk = digest.parse(['---', 'id: BLK-x', 'persona: reviewer', 'status: done', '---',
      '確認コマンド: `node tools/blk-check.js … --run`', '',
      'できるようになったこと:', '「効いている」と出ます。'].join('\n'));
    var check = digest.checkOutput(blk, '', { failed: false });
    expect(check.verdict).not.toBe('failed');
  });
});
