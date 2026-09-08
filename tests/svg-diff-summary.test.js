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
  test('文字の差が無ければ、見た目だけの差だと言う', function() {
    var diff = SD.compare(SEQ, ['受注サービス', 'Order', 'Stock', '在庫を引き当てる', '引き当て結果']);
    expect(SD.summary(diff)).toContain('見た目だけの差');
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
