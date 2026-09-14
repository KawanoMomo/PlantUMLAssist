'use strict';
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var window = global.window;
try { delete require.cache[require.resolve('../src/core/svg-diff-summary.js')]; } catch (e) {}
require('../src/core/svg-diff-summary.js');

var SD = window.MA.svgDiffSummary;

// BLK-reviewer-20260908-1203-wish: 「内容ずれ」の中身 — 旧 participant 名の残存と、
// 欠落した状態・遷移・メッセージ — を、grep せずに一覧から読めるようにする。
var SEQ = [
  '@startuml',
  'participant "受注サービス" as Order',
  'participant Stock',
  'Order -> Stock: 在庫を引き当てる',
  'Stock -> Order: 引き当て結果',
  '@enduml',
].join('\n');

describe('svgDiffSummary.pumlLabels — SVG に文字として出るものを拾う', function() {
  test('participant の表示名と別名の両方を拾う', function() {
    var rows = SD.pumlLabels(SEQ);
    var labels = rows.map(function(r) { return r.label; });
    expect(labels).toContain('受注サービス');
    expect(labels).toContain('Order');
    expect(labels).toContain('Stock');
  });
  test('メッセージのラベルを拾う', function() {
    var rows = SD.pumlLabels(SEQ).filter(function(r) { return r.kind === 'message'; });
    expect(rows.map(function(r) { return r.label; })).toEqual(['在庫を引き当てる', '引き当て結果']);
  });
  test('skinparam やコメントは拾わない (残存の判定を濁らせる)', function() {
    var rows = SD.pumlLabels('@startuml\nskinparam monochrome true\n\' メモ\nstate 待機\n@enduml');
    expect(rows.map(function(r) { return r.label; })).toEqual(['待機']);
  });
  test('state 図の状態と遷移ラベルを拾う', function() {
    var rows = SD.pumlLabels('@startuml\nstate 待機\nstate 実行中\n待機 --> 実行中 : 開始\n@enduml');
    var byKind = {};
    rows.forEach(function(r) { (byKind[r.kind] = byKind[r.kind] || []).push(r.label); });
    expect(byKind.state).toEqual(['待機', '実行中']);
    expect(byKind.message).toEqual(['開始']);
  });
  test('[*] は状態名として拾わない', function() {
    var rows = SD.pumlLabels('@startuml\n[*] --> 待機\n@enduml');
    expect(rows.map(function(r) { return r.label; })).toEqual(['待機']);
  });
  test('アクティビティの action を拾う', function() {
    var rows = SD.pumlLabels('@startuml\nstart\n:伝票を起こす;\n@enduml');
    expect(rows).toEqual([{ kind: 'action', label: '伝票を起こす' }]);
  });
});

describe('svgDiffSummary.compare — 欠落と残存に分ける', function() {
  test('SVG に無い名前を欠落として名指しする', function() {
    var diff = SD.compare(SEQ, ['受注サービス', 'Order', '在庫を引き当てる', '引き当て結果']);
    expect(diff.missing.map(function(r) { return r.label; })).toEqual(['Stock']);
    expect(diff.leftover).toEqual([]);
    expect(diff.empty).toBe(false);
  });
  test('puml に無い文字を残存 (旧名の残り) として名指しする', function() {
    var diff = SD.compare(SEQ, ['受注サービス', 'Order', 'Stock', '在庫サービス',
                                '在庫を引き当てる', '引き当て結果']);
    expect(diff.leftover).toEqual(['在庫サービス']);
    expect(diff.missing).toEqual([]);
  });
  test('全部そろっていれば空 (見た目だけの差)', function() {
    var diff = SD.compare(SEQ, ['受注サービス', 'Order', 'Stock', '在庫を引き当てる', '引き当て結果']);
    expect(diff.empty).toBe(true);
    expect(diff.total).toBe(0);
  });
  test('折り返しで分かれていても、含まれていれば欠落と言わない', function() {
    var diff = SD.compare('@startuml\nparticipant "とても長い名前の受注サービス" as O\n@enduml',
                          ['とても長い名前の受注サービス です', 'O']);
    expect(diff.missing).toEqual([]);
  });
  test('数字だけ・記号だけの文字は残存に数えない', function() {
    var diff = SD.compare(SEQ, ['受注サービス', 'Order', 'Stock', '在庫を引き当てる',
                                '引き当て結果', '1', '--', '']);
    expect(diff.leftover).toEqual([]);
  });
  test('同じ文字が 2 度出てきても 1 度だけ名指しする', function() {
    var diff = SD.compare(SEQ, ['受注サービス', 'Order', 'Stock', '在庫を引き当てる',
                                '引き当て結果', '旧倉庫', '旧倉庫']);
    expect(diff.leftover).toEqual(['旧倉庫']);
  });
  test('svgLabels が無くても落ちない (すべて欠落)', function() {
    var diff = SD.compare(SEQ, null);
    expect(diff.missing.length).toBeGreaterThan(0);
    expect(diff.leftover).toEqual([]);
  });
});

describe('svgDiffSummary.summary / reportText — そのまま指摘文にする', function() {
  test('件数を欠落と残存に分けて言う', function() {
    var diff = SD.compare(SEQ, ['受注サービス', 'Order', '在庫サービス', '在庫を引き当てる']);
    expect(SD.summary(diff)).toBe('欠落 2 件 / SVG に残る古い名前 1 件');
  });
  // BLK-reviewer-20260908-1303: 以前ここは「見た目だけの差です」を期待していたが、
  // render は決定的なので、バイトが違う以上「実害なし」ではない。
  // 「差なし」と読める文言を出さないことを、逆に固定する。
  test('文字の差が無くても「差なし・見た目だけ」とは言わない', function() {
    var diff = SD.compare(SEQ, ['受注サービス', 'Order', 'Stock', '在庫を引き当てる', '引き当て結果']);
    var s = SD.summary(diff);
    expect(s).toContain('一致していません');
    expect(s).not.toContain('見た目だけの差');
  });
  test('指摘文に図名・欠落・残存・直し方が入る', function() {
    var diff = SD.compare(SEQ, ['受注サービス', 'Order', '在庫サービス', '在庫を引き当てる']);
    var text = SD.reportText('order_seq', diff);
    expect(text).toContain('[order_seq]');
    expect(text).toContain('SVG に無い participant: Stock');
    expect(text).toContain('SVG に残っている古い文字: 在庫サービス');
    expect(text).toContain('作り直してください');
  });
  test('複数図ぶんを 1 つの指摘文にまとめる', function() {
    var a = SD.compare(SEQ, ['受注サービス', 'Order', '在庫を引き当てる', '引き当て結果']);
    var text = SD.reportAll({ b_seq: a, a_seq: a });
    expect(text).toContain('食い違っている図: 2 枚');
    expect(text.indexOf('[a_seq]')).toBeLessThan(text.indexOf('[b_seq]'));
  });
  test('1 枚も無ければ空文字 (空の指摘文を渡さない)', function() {
    expect(SD.reportAll({})).toBe('');
  });
});

// BLK-reviewer-20260908-1303: 文字に現れない食い違い。
// reviewer が 7 枚のうち 6 枚で「文字の上での食い違いは見つかりませんでした
// （描画の見た目だけの差です）」を受け取り、render が決定的である以上それが
// 誤りであることを指摘した。文字で差が出ないときこそ、保存中の SVG と
// 描き直した SVG を直に比べて構造の差を言う。
describe('svgDiffSummary.compare — 文字に現れない差を構造として言う', function() {
  var SAME = ['受注サービス', 'Order', 'Stock', '在庫を引き当てる', '引き当て結果'];

  test('図形の数が違えば、種類ごとに保存中と描き直しの数を出す', function() {
    var diff = SD.compare(SEQ, SAME, {
      drawnLabels: SAME,
      svgShape: { path: 4, polygon: 2, rect: 3 },
      drawnShape: { path: 4, polygon: 4, rect: 3 },
    });
    expect(diff.empty).toBe(true);
    expect(diff.structuralKnown).toBe(true);
    expect(diff.structural.length).toBe(1);
    expect(diff.structural[0].kind).toBe('shape');
    expect(diff.structural[0].text).toContain('多角形');
    expect(diff.structural[0].text).toContain('保存中 2 → 描き直すと 4');
    expect(SD.summary(diff)).toContain('構造が違います');
    expect(SD.summary(diff)).not.toContain('見た目だけ');
  });

  test('名前が同じまま並び順だけ変わった図を、並び順の違いとして言う', function() {
    var diff = SD.compare(SEQ, ['受注サービス', 'Order', 'Stock'], {
      drawnLabels: ['受注サービス', 'Stock', 'Order'],
      svgShape: { path: 4 }, drawnShape: { path: 4 },
    });
    var ord = diff.structural.filter(function(r) { return r.kind === 'order'; });
    expect(ord.length).toBe(1);
    expect(ord[0].text).toContain('2 番目が「Order」→「Stock」');
  });

  test('puml との突き合わせが取りこぼした文字も、SVG どうしの比較で拾う', function() {
    // 「引き当て結果」は puml にも保存中 SVG にも在るので missing/leftover には出ないが、
    // 描き直すと消えている (= 今の puml では描かれない) ことは SVG どうしなら分かる。
    var diff = SD.compare(SEQ, SAME, {
      drawnLabels: ['受注サービス', 'Order', 'Stock', '在庫を引き当てる'],
      svgShape: { path: 4 }, drawnShape: { path: 4 },
    });
    var gone = diff.structural.filter(function(r) { return r.kind === 'label-gone'; });
    expect(gone.length).toBe(1);
    expect(gone[0].label).toBe('引き当て結果');
  });

  test('図形も並びも同じなら、位置の差だと言い切る (差なしとは言わない)', function() {
    var diff = SD.compare(SEQ, SAME, {
      drawnLabels: SAME, svgShape: { path: 4 }, drawnShape: { path: 4 },
    });
    expect(diff.structural.length).toBe(0);
    expect(SD.summary(diff)).toContain('一致していません');
    expect(SD.summary(diff)).toContain('位置の差');
  });

  test('材料が来ていなければ「調べていない」と言う (調べて無かった、にしない)', function() {
    var diff = SD.compare(SEQ, SAME);
    expect(diff.structuralKnown).toBe(false);
    expect(SD.summary(diff)).toContain('調べていません');
    expect(SD.summary(diff)).toContain('一致していません');
  });

  test('指摘文にも構造の違いと「作り直してください」が入る', function() {
    var diff = SD.compare(SEQ, SAME, {
      drawnLabels: SAME,
      svgShape: { polygon: 2 }, drawnShape: { polygon: 4 },
    });
    var text = SD.reportText('order_seq', diff);
    expect(text).toContain('[order_seq]');
    expect(text).toContain('多角形');
    expect(text).toContain('作り直してください');
    expect(text).not.toContain('レイアウトだけの差');
  });

  test('文字の差と構造の差が両方あれば、要約に両方の件数が出る', function() {
    var diff = SD.compare(SEQ, ['受注サービス', 'Order', '在庫サービス', '在庫を引き当てる'], {
      drawnLabels: ['受注サービス', 'Order', 'Stock', '在庫を引き当てる'],
      svgShape: { polygon: 2 }, drawnShape: { polygon: 4 },
    });
    var s = SD.summary(diff);
    expect(s).toContain('欠落 2 件');
    expect(s).toContain('SVG に残る古い名前 1 件');
    expect(s).toContain('構造の違い');
  });
});
