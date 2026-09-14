'use strict';
// BLK-reviewer-20260914-2206: --board は前回の指摘.md の「解消」の一言だけを見て今回の
// 突合と付き合わせるので、「puml 側は解消・svg 再エクスポートのみ継続」のような複合状態の
// 指摘が、次の run で「解消済みだったのにまた発生した」と読める文で出ていた。
// 内容据え置きの継続と本当の出戻りをここで分ける (分からないと図を読み直す羽目になる)。

var W = (typeof window !== 'undefined' && window) || global.window;
var RB = W.MA.reviewBoard;

var SVG_ROW = {
  doc: 'diagram1', docs: ['diagram1'], kind: 'svg.stale', category: 'SVG が古い',
  title: 'diagram1.svg が diagram1.puml より古い', detail: '再エクスポート待ち',
};
var BODY_ROW = {
  doc: 'diagram1', docs: ['diagram1'], kind: 'name.mismatch', category: '命名',
  title: 'domain-verdict の宣言が無い', detail: 'diagram1.puml:2',
};

function build(md, rows) {
  return RB.build({ board: { rows: rows }, findings: md, changedFiles: [] });
}
function only(view) { return view.carried[0]; }

describe('review-board: 複合状態の指摘を読む', function() {
  test('「puml 側は解消・svg 再エクスポートのみ継続」は部分解消として読む', function() {
    var f = RB.parseFindings('## 指摘2 `domain-verdict` の宣言\n'
      + 'diagram1.puml 側は解消、svg の再エクスポートのみ継続。継続 2 tick 目。')[0];
    expect(f.status).toBe('partial');
    expect(f.tick).toBe(2);
  });

  test('見出しの【部分解消】もそのまま読む', function() {
    var f = RB.parseFindings('## 【部分解消】diagram1.puml の `domain-verdict`\n本文。')[0];
    expect(f.status).toBe('partial');
  });

  test('素の「解消」「継続」の読み方は変わらない', function() {
    expect(RB.parseFindings('## 【解消】diagram1.puml の `domain-verdict`\n直っています。')[0].status)
      .toBe('resolved');
    expect(RB.parseFindings('## 【継続・2回目】diagram1.puml の `domain-verdict`\nまだです。')[0].status)
      .toBe('carried');
  });
});

describe('review-board: 継続と出戻りを分ける', function() {
  var PARTIAL = '## 指摘2 `domain-verdict` の宣言\n'
    + 'diagram1.puml 側は解消、svg の再エクスポートのみ継続。継続 2 tick 目。';

  test('部分解消の残りに当たっても出戻りにしない。tick は続きから数える', function() {
    var c = only(build(PARTIAL, [SVG_ROW]));
    expect(c.verdict).toBe('carried');
    expect(c.regressed).toBe(false);
    expect(c.tick).toBe(3);
    expect(c.note).toContain('出戻りではありません');
    expect(c.note).not.toContain('また当たっています');
  });

  test('「解消」と書いた指摘でも、当たったのが SVG の行だけなら再エクスポート待ちの継続', function() {
    var md = '## 指摘2 `domain-verdict` の宣言\n'
      + 'diagram1.puml:2 のコメント行を入れたので解消。継続 2 tick 目。svg は書き出し直す。';
    var c = only(build(md, [SVG_ROW]));
    expect(c.regressed).toBe(false);
    expect(c.svgOnly).toBe(true);
    expect(c.tick).toBe(3);
    expect(c.note).toContain('再エクスポート待ち');
  });

  test('解消と書いた指摘の本体にまた当たったら、これは出戻りで 1 tick 目から数える', function() {
    var md = '## 【解消】指摘2 `domain-verdict` の宣言\n'
      + 'diagram1.puml:2 に入れたので解消。継続 2 tick 目だった。';
    var c = only(build(md, [BODY_ROW]));
    expect(c.regressed).toBe(true);
    expect(c.tick).toBe(1);
    expect(c.note).toBe('前回は解消と書いていますが、今回また当たっています');
  });

  test('部分解消でも、残ると書いていない本体に当たれば継続として数える', function() {
    var c = only(build(PARTIAL, [BODY_ROW, SVG_ROW]));
    expect(c.regressed).toBe(false);
    expect(c.svgOnly).toBe(false);
    expect(c.tick).toBe(3);
  });

  test('部分解消の残りも消えていれば解消に落ちる', function() {
    var c = only(build(PARTIAL, []));
    expect(c.verdict).toBe('resolved');
  });
});

describe('review-board: 読み直しが要る件数が 1 行で分かる', function() {
  test('出戻りが 0 件なら要約に書かない', function() {
    var view = build('## 【解消】`domain-verdict` の宣言 (diagram1.puml)\n'
      + 'puml 側は解消、svg のみ継続。', [SVG_ROW]);
    expect(view.counts.regressed).toBe(0);
    expect(RB.summaryLine(view)).toContain('継続 1 / 解消 0 / 新規 0 件');
    expect(RB.summaryLine(view)).not.toContain('出戻り');
  });

  test('出戻りは継続の内数として要約と一覧の行頭に出る', function() {
    var view = build('## 【解消】`domain-verdict` の宣言 (diagram1.puml)\n直しました。', [BODY_ROW]);
    expect(view.counts.regressed).toBe(1);
    expect(RB.summaryLine(view)).toContain('継続 1（うち出戻り 1）');
    expect(RB.markdown(view, 'レビュー結果')).toContain('（出戻り）');
  });

  test('SVG 待ちの継続は一覧の行頭でもそう読める', function() {
    var view = build('## 【解消】`domain-verdict` の宣言 (diagram1.puml)\n'
      + 'puml 側は解消、svg のみ継続。', [SVG_ROW]);
    expect(RB.markdown(view, 'レビュー結果')).toContain('（SVG 再エクスポート待ち）');
  });
});
