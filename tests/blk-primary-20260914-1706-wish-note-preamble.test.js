'use strict';
// BLK-primary-20260914-1706-wish: 指摘.md の `##` 見出しには、直す対象のある指摘に混じって
// 「前提」「突合サマリ」「◯◯への依頼」が並ぶ。どれも [適用] が出ない前置きなのに一覧では
// 同じ形で並ぶので、毎回 1 件ずつ「本物か前置きか」を読んで決めていた。
// ここで守るのは「実物の指摘だけが既定で並ぶこと」と「前置きを落とさないこと」。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
var window = global.window;
try { delete require.cache[require.resolve('../src/core/review-note.js')]; } catch (e) {}
require('../src/core/review-note.js');
var RN = window.MA.reviewNote;

var MD = [
  '# 2026-09-14 レビュー指摘',
  '',
  '## 前提: DSL 無変化',
  '前回控えと比べて DSL に差はありません。',
  '',
  '## 突合サマリ',
  '9 件中 6 件が要対応です。',
  '',
  '## 【最重要】部品名の不一致',
  'junior/gpio_init_sequence.puml の `Gpio` を `Gpio_Driver` に統一してください。',
  '',
  '## 遷移ラベルが図にない',
  'gpio_state の Ready → Busy にラベルがありません。',
  '',
  '## primary への依頼(優先順)',
  '上から順にお願いします。',
].join('\n');

var DOCS = [
  { name: 'junior/gpio_init_sequence' },
  { name: 'primary/gpio_init_sequence' },
  { name: 'junior/gpio_state' },
  { name: 'primary/gpio_state' },
];

var rows = RN.rows(RN.parse(MD), RN.index(DOCS));

describe('reviewNote — 前置きと実物の指摘を分ける', function() {
  test('見出しが 5 件に切れている (前置きも消さずに残す)', function() {
    expect(rows.length).toBe(5);
  });

  test('「前提」「サマリ」「依頼」で始まる見出しは前置き', function() {
    expect(RN.headingIsPreamble('前提: DSL 無変化')).toBe(true);
    expect(RN.headingIsPreamble('突合サマリ')).toBe(true);
    expect(RN.headingIsPreamble('primary への依頼(優先順)')).toBe(true);
    expect(RN.headingIsPreamble('【最重要】部品名の不一致')).toBe(false);
  });

  // 図名を綴っていない件は前置きに数えない。「can の『編集中』ファイルの整理」のように
  // 図名なしで書かれた実物の指摘まで一覧から消えると、指摘が落ちる。
  test('図名が書かれていないだけの件は前置きにしない (指摘を落とさない)', function() {
    var only = RN.rows(RN.parse('## 編集中のファイルの整理\n残すか消すか決めてください。'), RN.index(DOCS));
    expect(only[0].docs.length).toBe(0);
    expect(RN.isPreamble(only[0])).toBe(false);
    expect(RN.visibleRows(only, false).length).toBe(1);
  });

  test('実物の指摘だけが残り、前置きは別に数えられる', function() {
    expect(RN.realRows(rows).map(function(r) { return r.heading; }))
      .toEqual(['部品名の不一致', '遷移ラベルが図にない']);
    expect(RN.preambleRows(rows).length).toBe(3);
  });
});

describe('reviewNote.visibleRows — 一覧に並べる行', function() {
  test('既定は実物の指摘だけ (9 件を毎回数え直さない)', function() {
    expect(RN.visibleRows(rows, false).length).toBe(2);
  });

  test('出し直せば前置きも書いた順のまま並ぶ (reviewer の文章を落とさない)', function() {
    var all = RN.visibleRows(rows, true);
    expect(all.length).toBe(5);
    expect(all[0].heading).toBe('前提: DSL 無変化');
  });

  test('全部が前置きなら隠さない (一覧が空になると読む手がかりが消える)', function() {
    var onlyPre = RN.rows(RN.parse('## 突合サマリ\n所見なし。'), RN.index(DOCS));
    expect(RN.visibleRows(onlyPre, false).length).toBe(1);
  });

  test('出し入れボタンは何件動くかを言い、前置きが無ければ出さない', function() {
    expect(RN.preambleLabel(rows, false)).toBe('前置き 3 件も出す');
    expect(RN.preambleLabel(rows, true)).toBe('前置き 3 件を隠す');
    expect(RN.preambleLabel(RN.realRows(rows), false)).toBe('');
  });
});

describe('reviewNote.summaryText — 見出しの 1 行', function() {
  test('前置きが混ざっていたら、実物が何件かを先に言う', function() {
    var t = RN.summaryText(rows, false);
    expect(t).toContain('指摘 2 件');
    expect(t).toContain('前置き 3 件は一覧の外');
  });

  test('前置きを出しているときは「一覧の外」とは言わない', function() {
    expect(RN.summaryText(rows, true)).not.toContain('一覧の外');
  });

  test('前置きが無いフォルダでは今までどおり全件で数える', function() {
    expect(RN.summaryText(RN.realRows(rows), false)).toContain('指摘 2 件');
  });

  test('指摘.md が無ければ今までどおり', function() {
    expect(RN.summaryText([], false)).toBe('指摘.md がありません');
  });
});
