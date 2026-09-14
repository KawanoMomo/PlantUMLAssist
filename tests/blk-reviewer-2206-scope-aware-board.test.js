'use strict';
// BLK-reviewer-20260914-2206 (3 件目): --board を `--only svg` のように絞って呼ぶと、
// 回していない監査の指摘まで「今回の突合に出ていない = 解消」と出ていた。さらに絞った回でも
// 継続 tick を数え直すので、呼び出しオプションの違いだけで新規/継続/tick 数がぶれていた。
// 見ていない物は解消でも継続でもなく「今回は見ていない」と言い、tick は前回のまま据え置く。

var W = (typeof window !== 'undefined' && window) || global.window;
var RB = W.MA.reviewBoard;

var SVG_ROW = {
  doc: 'diagram1', docs: ['diagram1'], kind: 'svg.stale', category: '出力物/SVG 古',
  title: 'diagram1.svg が diagram1.puml より古い', detail: '再エクスポート待ち',
};

// 依頼2 相当。クラス図にメソッドが無いという consistency / method の話で、svg とは無関係。
var METHOD_MD = '## 【継続・2回目】依頼2 `ClockCtrl.EnableClock` の呼び先\n'
  + 'driver_common_class.puml のクラス図に `ClockCtrl.EnableClock` のメソッドがありません。継続 2 tick 目。';

function build(md, rows, scope) {
  return RB.build({ board: { rows: rows }, findings: md, changedFiles: [], scope: scope });
}
function only(view) { return view.carried[0]; }

describe('review-board: 絞って回した回はスコープ外を解消と言わない', function() {
  test('--only svg の回に、メソッドの指摘は「今回は見ていない」になる', function() {
    var c = only(build(METHOD_MD, [SVG_ROW], ['svg']));
    expect(c.verdict).toBe('outOfScope');
    expect(c.note).toContain('見ていません');
  });

  test('スコープ外の指摘は tick を数え直さない (前回のまま据え置く)', function() {
    var c = only(build(METHOD_MD, [SVG_ROW], ['svg']));
    expect(c.tick).toBe(2);
  });

  test('スコープ外は解消にも継続にも数えず、別枠で数える', function() {
    var v = build(METHOD_MD, [SVG_ROW], ['svg']);
    expect(v.counts.outOfScope).toBe(1);
    expect(v.counts.resolved).toBe(0);
    expect(v.counts.carried).toBe(0);
  });

  test('スコープ内の監査の指摘なら、絞った回でも今までどおり解消に落ちる', function() {
    var md = '## 【継続・2回目】diagram1.svg が古い\n'
      + 'diagram1.puml を直した後、svg の書き出しが追いついていません。継続 2 tick 目。';
    var c = only(build(md, [], ['svg']));
    expect(c.verdict).toBe('resolved');
  });

  test('スコープ内で当たれば継続として数え直す (絞っても判定は変わらない)', function() {
    var md = '## 【継続・2回目】diagram1.svg が古い\n'
      + 'svg の書き出しが追いついていません。継続 2 tick 目。';
    var c = only(build(md, [SVG_ROW], ['svg']));
    expect(c.verdict).toBe('carried');
    expect(c.tick).toBe(3);
  });

  test('全部回した回 (scope なし) の振り分けは今までと 1 文字も変わらない', function() {
    var c = only(build(METHOD_MD, [SVG_ROW], null));
    expect(c.verdict).toBe('resolved');
    expect(RB.build({ board: { rows: [SVG_ROW] }, findings: METHOD_MD, changedFiles: [] })
      .carried[0].verdict).toBe('resolved');
  });

  test('どの監査の話か当てられない指摘は、絞った回では判定を保留する', function() {
    // 文面に監査の手がかりが無い。図名 (diagram1) では svg 行に当たるが、
    // 回していない監査の話かもしれないので継続とは言わせない。
    var md = '## 【継続・3回目】diagram1.puml の見出し\n読みにくいので直してください。継続 3 tick 目。';
    var c = only(build(md, [SVG_ROW], ['svg']));
    expect(c.verdict).toBe('outOfScope');
    expect(c.tick).toBe(3);
  });
});

describe('review-board: 絞った回はその旨が画面に出る', function() {
  test('要約に「今回は見ていない N 件」が出る', function() {
    var v = build(METHOD_MD, [SVG_ROW], ['svg']);
    expect(RB.summaryLine(v)).toContain('今回は見ていない 1 件');
  });

  test('画面の頭で、絞って回したことと据え置きであることを言う', function() {
    var md = RB.markdown(build(METHOD_MD, [SVG_ROW], ['svg']), 'レビュー結果');
    expect(md).toContain('--only svg');
    expect(md).toContain('据え置き');
    expect(md).toContain('今回は見ていない (スコープ外)');
    expect(md).toContain('前回のまま 2 tick 目');
  });

  test('全部回した回には絞りの断り書きを出さない', function() {
    expect(RB.markdown(build(METHOD_MD, [SVG_ROW], null), 'レビュー結果')).not.toContain('--only');
  });
});
