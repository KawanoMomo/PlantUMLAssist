'use strict';
// BLK-junior-20260915-0206-wish: 部品サマリカード。
// 一括資料化で出し終えたあと「6 図種とも揃っているか」を確かめる術が無く、
// 部品名で一覧をフィルタして 1 枚ずつ開き、(資料用) の有無と保存日時を目で追って
// いた。部品の図種を絵と保存日時ごと 1 枚に並べるために、「何を並べるか」
// 「何と書くか」をここで固定する。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

['../src/core/component-pack.js', '../src/core/material-export.js',
 '../src/core/material-board.js', '../src/core/material-summary.js']
  .forEach(function(m) {
    try { delete require.cache[require.resolve(m)]; } catch (e) {}
    require(m);
  });
var MS = global.window.MA.materialSummary;

function at(s) { return new Date(s).toISOString(); }

// TIMER は 3 図種。状態遷移は資料用あり(最新)、シーケンスは元のほうが新しい、
// クラスは資料用がまだ無い。
var ENTRIES = [
  { name: 'TIMERドライバ状態遷移.puml', mtime: at('2026-09-14T10:00:00Z') },
  { name: 'TIMERドライバ状態遷移(資料用).puml', mtime: at('2026-09-14T11:00:00Z') },
  { name: 'TIMERドライバ初期化シーケンス.puml', mtime: at('2026-09-14T12:00:00Z') },
  { name: 'TIMERドライバ初期化シーケンス(資料用).puml', mtime: at('2026-09-14T09:00:00Z') },
  { name: 'TIMERドライバクラス図.puml', mtime: at('2026-09-14T08:00:00Z') },
];

function byKind(cards, kind) {
  return cards.filter(function(c) { return c.kind === kind; })[0];
}

describe('部品サマリカード', function() {
  test('その部品の図種が全部カードになる (資料用が無い図種も抜かない)', function() {
    var cards = MS.cards(ENTRIES, 'TIMERドライバ');
    expect(cards.map(function(c) { return c.kind; }).sort())
      .toEqual(['クラス図', 'シーケンス図', '状態遷移図'].sort());
  });

  test('並びは図番号の順 (状態で並べ替えない)', function() {
    var MB = global.window.MA.materialBoard;
    var cards = MS.cards(ENTRIES, 'TIMERドライバ');
    expect(cards.map(function(c) { return c.kind; }))
      .toEqual(MB.rows(ENTRIES, 'TIMERドライバ').map(function(r) { return r.kind; }));
  });

  test('絵にするのは資料用の版。無い図種は元の図を代わりに出す', function() {
    var cards = MS.cards(ENTRIES, 'TIMERドライバ');
    expect(byKind(cards, '状態遷移図').preview).toBe('TIMERドライバ状態遷移(資料用).puml');
    expect(byKind(cards, '状態遷移図').isMaterial).toBe(true);
    expect(byKind(cards, 'クラス図').preview).toBe('TIMERドライバクラス図.puml');
    expect(byKind(cards, 'クラス図').isMaterial).toBe(false);
  });

  test('保存日時は分まで読める。資料用が無ければ日時ではなくそう言う', function() {
    var cards = MS.cards(ENTRIES, 'TIMERドライバ');
    expect(byKind(cards, '状態遷移図').savedText)
      .toBe('資料用 ' + MS.timeText(at('2026-09-14T11:00:00Z')));
    expect(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(MS.timeText(at('2026-09-14T11:00:00Z')))).toBe(true);
    expect(byKind(cards, 'クラス図').savedText).toBe('資料用なし');
  });

  test('日時の取れない一覧では「日時不明」と言う (空欄にして無いと読ませない)', function() {
    var cards = MS.cards(['TIMERドライバ状態遷移.puml', 'TIMERドライバ状態遷移(資料用).puml'],
      'TIMERドライバ');
    expect(byKind(cards, '状態遷移図').savedText).toBe('資料用 日時不明');
  });

  test('見出しは「何図種中いくつ揃ったか」を数えずに言う', function() {
    var cards = MS.cards(ENTRIES, 'TIMERドライバ');
    expect(MS.summaryText('TIMERドライバ', cards))
      .toBe('TIMERドライバ: 3 図種中 1 図種が資料化済み（資料用なし 1・元が新しい 1）');
  });

  test('揃っていれば「すべて揃っています」と言い切る', function() {
    var ok = [
      { name: 'GPIOドライバ状態遷移.puml', mtime: at('2026-09-14T10:00:00Z') },
      { name: 'GPIOドライバ状態遷移(資料用).puml', mtime: at('2026-09-14T11:00:00Z') },
    ];
    var cards = MS.cards(ok, 'GPIOドライバ');
    expect(MS.summaryText('GPIOドライバ', cards))
      .toBe('GPIOドライバ: 1 図種中 1 図種が資料化済み（すべて揃っています）');
    expect(MS.missingText(cards)).toBe('');
  });

  test('足りない図種はカードを見比べる前に名指しする', function() {
    var cards = MS.cards(ENTRIES, 'TIMERドライバ');
    expect(MS.missingKinds(cards).sort()).toEqual(['クラス図', 'シーケンス図'].sort());
    expect(MS.missingText(cards)).toContain('足りないのは');
    expect(MS.missingText(cards)).toContain('クラス図');
  });

  test('資料用の日時の幅を出す (古い絵が 1 枚だけ混ざるのを見つけられる)', function() {
    var cards = MS.cards(ENTRIES, 'TIMERドライバ');
    expect(MS.spanText(cards)).toBe('資料用の日時は '
      + MS.timeText(at('2026-09-14T09:00:00Z')) + ' 〜 '
      + MS.timeText(at('2026-09-14T11:00:00Z')) + ' です');
  });

  test('カード 1 枚の説明は、状態ごとに何が起きているかを言う', function() {
    var cards = MS.cards(ENTRIES, 'TIMERドライバ');
    expect(MS.cardText('TIMERドライバ', byKind(cards, 'クラス図'))).toContain('資料用がまだありません');
    expect(MS.cardText('TIMERドライバ', byKind(cards, 'シーケンス図'))).toContain('元の図');
    expect(MS.cardText('TIMERドライバ', byKind(cards, '状態遷移図'))).toContain('最新の資料用');
  });

  test('図の無い部品では黙らない', function() {
    expect(MS.cards(ENTRIES, '無い部品')).toEqual([]);
    expect(MS.summaryText('無い部品', [])).toBe('無い部品 に資料化できる図がありません。');
    expect(MS.spanText([])).toBe('');
  });

  test('状態の判定は資料一式ボードと同じ (表とカードで食い違わない)', function() {
    var MB = global.window.MA.materialBoard;
    var cards = MS.cards(ENTRIES, 'TIMERドライバ');
    var rows = MB.rows(ENTRIES, 'TIMERドライバ');
    expect(cards.map(function(c) { return c.status; }))
      .toEqual(rows.map(function(r) { return r.status; }));
  });
});
