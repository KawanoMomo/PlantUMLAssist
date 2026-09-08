'use strict';
// BLK-reviewer-20260908-1903-wish: 指摘 1 件を「puml で何が変わったか」+「それが SVG に
// 出ているか」の 1 つの判定にまとめる。ここで固定するのは、
// (1) 4 つの札の分かれ方、(2) 確かめていない SVG を「反映済み」と言わないこと、
// (3) 食い違いの中身 (ラベル・図形数) が判定の本文に出ること、
// (4) 反映済みでないものだけを引けること。

const RP = () => window.MA.reviewPins;
const PI = () => window.MA.pinInbox;
const PP = () => window.MA.pinProgress;
const PV = () => window.MA.pinVerify;

const DSL = [
  '@startuml',
  'title Dma state',
  '[*] --> Idle',
  'Idle --> Busy : Dma_Configure',
  '@enduml',
].join('\n');

const AT = '2026-09-08T15:03';
const NOW = '2026-09-08T19:03';
const DOC = 'dma_state';

function pinned(dsl) {
  return RP().add(dsl || DSL, {
    line: 4, text: 'このラベルはシーケンス図のどのメッセージとも対応しない',
    author: 'reviewer', at: AT, id: '1',
  });
}

function observe(dsl, memo) {
  const docs = [{ name: DOC, dsl: dsl }];
  return PP().observe(PI().collect(docs), docs, memo, { now: NOW });
}

// 指摘した行を直した状態 (pin-progress は resolved と観測する)。
function fixed() {
  return pinned().replace('Idle --> Busy : Dma_Configure', 'Idle --> Busy : Dma_Start');
}

function judgeOne(dsl, svg, opts) {
  const o = opts || {};
  const first = observe(pinned(), null);
  const r = observe(dsl, first.memo);
  const list = PV().judgeAll(r.entries, {
    svgs: svg ? { [DOC]: svg } : {},
    svgDiffs: o.svgDiffs || {},
    diffs: o.diffs || {},
  });
  return list[0];
}

describe('pin-verify — 指摘 1 件の反映判定', () => {
  test('puml が動いていなければ、SVG が一致していても未対応', () => {
    const j = judgeOne(pinned(), { status: 'match' });
    expect(j.key).toBe('open');
    expect(j.label).toBe('未対応');
    expect(j.done).toBe(false);
    expect(j.puml.fixed).toBe(false);
  });

  test('puml が直り SVG も一致していれば反映済み', () => {
    const j = judgeOne(fixed(), { status: 'match' });
    expect(j.key).toBe('reflected');
    expect(j.label).toBe('反映済み');
    expect(j.done).toBe(true);
    expect(j.svg.ok).toBe(true);
  });

  test('puml は直ったが SVG が食い違っていれば SVG 未反映', () => {
    const j = judgeOne(fixed(), { status: 'differ' });
    expect(j.key).toBe('puml-only');
    expect(j.label).toBe('SVG 未反映');
    expect(j.done).toBe(false);
    expect(j.svg.state).toBe('differ');
  });

  test('SVG が無い図も、直っただけでは反映済みにしない', () => {
    const j = judgeOne(fixed(), { status: 'missing' });
    expect(j.key).toBe('puml-only');
    expect(j.svg.text).toContain('SVG が保存フォルダにありません');
  });

  test('SVG 側を確かめていなければ反映済みとは言わない', () => {
    const j = judgeOne(fixed(), null);
    expect(j.key).toBe('unknown');
    expect(j.label).toBe('確かめられず');
    expect(j.svg.state).toBe('unchecked');
  });

  test('確かめられなかった図も未確認として出す', () => {
    const j = judgeOne(fixed(), { status: 'error', error: 'render failed' });
    expect(j.key).toBe('unknown');
    expect(j.svg.text).toContain('render failed');
  });

  test('食い違いの中身 (ラベル・図形数) が判定の本文に出る', () => {
    // 突き合わせに渡すのは図の本文だけ (指摘行には旧ラベルが控えとして残っている)。
    const body = DSL.replace('Idle --> Busy : Dma_Configure', 'Idle --> Busy : Dma_Start');
    const diff = window.MA.svgDiffSummary.compare(
      body,
      ['Dma_Configure', 'Idle', 'Busy'],
      { drawnLabels: ['Dma_Start', 'Idle', 'Busy'], svgShape: { path: 4 }, drawnShape: { path: 6 } });
    const j = judgeOne(fixed(), { status: 'differ' }, { svgDiffs: { [DOC]: diff } });
    expect(j.key).toBe('puml-only');
    // 旧ラベルが SVG に残っていることも、図形の数が違うことも 1 行で言う
    expect(j.svg.text).toContain('SVG に残る古い名前');
    expect(PV().rowText(j)).toContain('SVG:');
    expect(PV().rowText(j)).toContain('puml:');
  });

  test('前回控えとの行差分があれば puml 側の変更点として添える', () => {
    const RD = window.MA.reviewDiff;
    const diffs = { [DOC]: RD.compare({ [DOC]: pinned() }, DOC, fixed()) };
    const j = judgeOne(fixed(), { status: 'match' }, { diffs: diffs });
    expect(j.puml.change).not.toBe('');
    expect(PV().rowText(j)).toContain(j.puml.change);
  });

  test('控えが無い図では変更点を数で言わない (差分ありと言い張らない)', () => {
    const RD = window.MA.reviewDiff;
    const diffs = { [DOC]: RD.compare({}, DOC, fixed()) };
    const j = judgeOne(fixed(), { status: 'match' }, { diffs: diffs });
    expect(j.puml.change).toBe('');
  });

  test('確かめる図は指摘の付いている図だけ', () => {
    const docs = [
      { name: DOC, dsl: pinned() },
      { name: 'adc_state', dsl: DSL },
    ];
    const r = PP().observe(PI().collect(docs), docs, null, { now: NOW });
    expect(PV().docsOf(r.entries)).toEqual([DOC]);
  });

  test('帯は札ごとの件数を言い、反映済みでないものだけを引ける', () => {
    const list = [
      { key: 'reflected', done: true }, { key: 'puml-only', done: false },
      { key: 'open', done: false }, { key: 'unknown', done: false },
    ];
    const sum = PV().summary(list);
    expect(sum.total).toBe(4);
    expect(sum.done).toBe(1);
    expect(sum.left).toBe(3);
    const head = PV().headText(sum);
    expect(head).toContain('反映済み 1');
    expect(head).toContain('SVG 未反映 1');
    expect(head).toContain('未対応 1');
    expect(PV().leftOnly(list).length).toBe(3);
  });

  test('並べ替えは 未対応 → SVG 未反映 → 確かめられず → 反映済み', () => {
    const list = [
      { key: 'reflected', doc: 'a', key2: 'a#1' },
      { key: 'unknown', doc: 'a', key2: 'a#2' },
      { key: 'puml-only', doc: 'a', key2: 'a#3' },
      { key: 'open', doc: 'a', key2: 'a#4' },
    ];
    expect(PV().sort(list).map((j) => j.key))
      .toEqual(['open', 'puml-only', 'unknown', 'reflected']);
  });
});
