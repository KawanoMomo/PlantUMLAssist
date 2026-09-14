'use strict';
// BLK-reviewer-20260914-2006: 指摘.md の依頼を、直す側 (primary) の画面の下端に
// 「未解消 N 件 / 最長 M tick 継続」として常時出す (src/core/request-badge.js)。
//
// 摩擦: 継続 tick 数は `npm run requests` で追えるが、それは書いた側の CLI で、
// 直す側の GUI には何も出ない。業務を始める前に指摘.md を GUI の外で開いて読むしかなく、
// 読み忘れた回はそのまま 1 tick 放置になる。ここで固定するのは
//   (1) 1 tick = 指摘.md の 1 版 (同じ本文を何度読んでも継続 tick 数が伸びない)
//   (2) 未解消の件数・未着手の件数・最長継続 tick 数が行から出ること
//   (3) 読めていない回は数を騙らず「−」を出すこと
//   (4) 未着手・再発が混ざる回だけ色を 1 段強くすること
//   (5) 押す前に、どの依頼が何 tick 放置かが吹き出しで読めること。

const { loadMA } = require('../tools/audit-runtime');

const MA = loadMA().MA;
const RL = MA.requestLedger;
const RB = MA.requestBadge;

const MD1 = [
  '## primary への依頼',
  '1. (最優先・継続)`plantuml-usecase-編集中.puml` の内容を `plantuml-usecase.puml` 本体に',
  '   差し替え、`-編集中` ファイルを削除する。',
  '2. (継続)`diagram1.puml` に `\' domain-verdict` のコメント行を復元する。',
  '',
].join('\n');

// 扱いの括弧だけが変わった版。依頼としては同じ。
const MD1b = MD1.replace('(最優先・継続)', '(最優先・2 tick 継続)');

// 依頼 2 が消えた版。
const MD2 = [
  '## primary への依頼',
  '1. `plantuml-usecase-編集中.puml` の内容を `plantuml-usecase.puml` 本体に差し替える。',
  '',
].join('\n');

const DOC_A = '@startuml\nusecase 設計する\n@enduml';
const DOC_B = '@startuml\nclass Foo\n@enduml';

function tickWith(state, markdown, docs) {
  return RL.update(state, {
    label: RB.tickLabel(markdown),
    at: '2026-09-14T11:00:00Z',
    markdown: markdown,
    docs: docs,
  });
}

describe('requestBadge.tickLabel — 1 tick は指摘.md の 1 版', function() {

  test('同じ本文なら同じ tick ラベル、書き替われば別の tick になる', function() {
    expect(RB.tickLabel(MD1)).toBe(RB.tickLabel(MD1));
    expect(RB.tickLabel(MD1)).not.toBe(RB.tickLabel(MD2));
    expect(RB.tickLabel(MD1).indexOf('note-')).toBe(0);
  });

  test('本文が無ければラベルも無い (読めていない回を 1 tick と数えない)', function() {
    expect(RB.tickLabel('')).toBe('');
    expect(RB.tickLabel(null)).toBe('');
  });

  test('同じ版を 3 度読み直しても、継続 tick 数は 1 のまま', function() {
    var st = RL.emptyState();
    for (var i = 0; i < 3; i++) st = tickWith(st, MD1, { 'plantuml-usecase': DOC_A });
    var sum = RB.summarize(RL.rows(st));
    expect(sum.open).toBe(2);
    expect(sum.worst).toBe(1);
  });

  test('扱いの括弧だけが変わった版は、同じ依頼の 2 tick 目として積まれる', function() {
    var st = tickWith(RL.emptyState(), MD1, { 'plantuml-usecase': DOC_A });
    st = tickWith(st, MD1b, { 'plantuml-usecase': DOC_A });
    var sum = RB.summarize(RL.rows(st));
    expect(sum.open).toBe(2);
    expect(sum.worst).toBe(2);
  });
});

describe('requestBadge.summarize / badgeText — 下端に出す 1 行', function() {

  test('未解消の件数・未着手の件数・最長継続 tick 数を数える', function() {
    var st = tickWith(RL.emptyState(), MD1, { 'plantuml-usecase': DOC_A, diagram1: DOC_A });
    st = tickWith(st, MD1b, { 'plantuml-usecase': DOC_A, diagram1: DOC_B });
    var rows = RL.rows(st);
    var sum = RB.summarize(rows);
    expect(sum.open).toBe(2);
    expect(sum.worst).toBe(2);
    // diagram1 だけが動いたので、動いていない依頼 1 が未着手として残る。
    expect(sum.stalled).toBe(1);
    expect(RB.badgeText(sum)).toBe('継続依頼 2 (最長 2 tick)');
    expect(RB.isActive(sum)).toBe(true);
    expect(RB.tone(sum)).toBe('stalled');
  });

  test('解消した依頼は件数に入らず、0 件なら色も付けない', function() {
    var st = tickWith(RL.emptyState(), MD1, {});
    st = tickWith(st, MD2, {});
    var rows = RL.rows(st);
    var sum = RB.summarize(rows);
    expect(sum.open).toBe(1);
    // MD1 の 2 件は両方とも MD2 の文面と別件なので、どちらも解消側に回る。
    expect(sum.resolved).toBe(2);

    var none = RB.summarize(rows.map(function(r) {
      return Object.assign({}, r, { open: false });
    }));
    expect(RB.badgeText(none)).toBe('継続依頼 0');
    expect(RB.isActive(none)).toBe(false);
    expect(RB.tone(none)).toBe('none');
  });

  test('まだ読めていない回は件数を騙らず「−」を出す', function() {
    expect(RB.badgeText(null)).toBe('継続依頼 −');
    expect(RB.isActive(null)).toBe(false);
    expect(RB.titleText([], null)).toContain('まだ読めていません');
  });

  test('全部が着手済みなら色は 1 段弱い (未着手が混ざる回だけ強くする)', function() {
    var st = tickWith(RL.emptyState(), MD1, { 'plantuml-usecase': DOC_A, diagram1: DOC_A });
    st = tickWith(st, MD1b, { 'plantuml-usecase': DOC_B, diagram1: DOC_B });
    var sum = RB.summarize(RL.rows(st));
    expect(sum.stalled).toBe(0);
    expect(RB.tone(sum)).toBe('working');
    expect(RB.isActive(sum)).toBe(true);
  });
});

describe('requestBadge.titleText — 押す前に読める吹き出し', function() {

  test('どの依頼が何 tick 放置かを、状況つきで並べる', function() {
    var st = tickWith(RL.emptyState(), MD1, { 'plantuml-usecase': DOC_A, diagram1: DOC_A });
    st = tickWith(st, MD1b, { 'plantuml-usecase': DOC_A, diagram1: DOC_A });
    var rows = RL.rows(st);
    var tip = RB.titleText(rows, RB.summarize(rows));
    expect(tip).toContain('未解消 2 件');
    expect(tip).toContain('最長 2 tick 継続');
    expect(tip).toContain('[未着手]');
    expect(tip).toContain('plantuml-usecase');
    expect(tip).toContain('連続 2 tick');
  });

  test('件数が多い回は上位だけを出し、残りは件数で言う', function() {
    var many = [];
    for (var i = 0; i < 8; i++) {
      many.push({ key: 'k' + i, text: '依頼' + i, open: true, status: 'stalled', streak: 8 - i, regressed: false });
    }
    var tip = RB.titleText(many, RB.summarize(many));
    expect(tip).toContain('ほか 3 件');
    expect(tip.split('\n').length).toBe(7);
  });

  test('未解消が無ければ、解消済みの件数だけを言う', function() {
    var rows = [{ key: 'k', text: '依頼', open: false, status: 'resolved', streak: 0 }];
    expect(RB.titleText(rows, RB.summarize(rows))).toContain('未解消の依頼はありません');
  });
});

describe('requestBadge.storageKey — 控えは保存フォルダごと', function() {

  test('別のフォルダを開いたら別の台帳になる', function() {
    expect(RB.storageKey('./primary')).not.toBe(RB.storageKey('./junior'));
    expect(RB.storageKey('./primary')).toBe(RB.storageKey('./primary'));
  });
});
