'use strict';
// BLK-reviewer-20260908-1603-wish: 指摘 1 件ごとに「未着手 / 着手 / 解消」を機械で付ける。
// ここで固定するのは、(1) 3 状態の分かれ方、(2) 既読や応答だけで「図が書き換わった」に
// しないこと、(3) 見送り回数の積み方、(4) 未解消だけを引けること。

const RP = () => window.MA.reviewPins;
const PR = () => window.MA.pinReply;
const PI = () => window.MA.pinInbox;
const PP = () => window.MA.pinProgress;

const DSL = [
  '@startuml',
  'title Dma state',
  '[*] --> Idle',
  'Idle --> Busy : Dma_Configure',
  'Busy --> Idle : Dma_Ack',
  '@enduml',
].join('\n');

const AT = '2026-09-08T15:03';
const NOW = '2026-09-08T16:03';

function pinned() {
  return RP().add(DSL, {
    line: 4, text: 'このラベルはシーケンス図のどのメッセージとも対応しない',
    author: 'reviewer', at: AT, id: '1',
  });
}

function docsOf(dsl) { return [{ name: 'dma_state.puml', dsl: dsl }]; }
function itemsOf(dsl) { return PI().collect(docsOf(dsl)); }

function run(dsl, memo) {
  return PP().observe(itemsOf(dsl), docsOf(dsl), memo, { now: NOW });
}

describe('pin-progress — 指摘ごとの着手状況', () => {
  test('初めて見た指摘は未着手', () => {
    const r = run(pinned(), null);
    expect(r.entries.length).toBe(1);
    expect(r.entries[0].status).toBe('untouched');
    expect(r.entries[0].label).toBe('未着手');
  });

  test('2 回目でも図が書き換わっていなければ未着手のまま', () => {
    const dsl = pinned();
    const first = run(dsl, null);
    const second = run(dsl, first.memo);
    expect(second.entries[0].status).toBe('untouched');
    expect(second.entries[0].passes).toBe(0);
  });

  test('指摘のあと図が書き換わり指摘行が残っていれば着手', () => {
    const dsl = pinned();
    const first = run(dsl, null);
    // 指摘先ではない行を書き換える (図には手を入れたが指摘は直していない)。
    const edited = dsl.replace('title Dma state', 'title DMA state machine');
    const second = run(edited, first.memo);
    expect(second.entries[0].status).toBe('started');
    expect(second.entries[0].passes).toBe(1);
  });

  test('見送りは図が書き換わるたびに増える', () => {
    const dsl = pinned();
    let m = run(dsl, null).memo;
    let d = dsl;
    for (let i = 0; i < 3; i++) {
      d = d.replace('title', 'title ' + i + ' ');
      m = run(d, m).memo;
    }
    const last = run(d, m);
    expect(last.entries[0].passes).toBe(3);
    expect(last.entries[0].status).toBe('started');
  });

  test('既読を付けただけでは着手にしない', () => {
    const dsl = pinned();
    const first = run(dsl, null);
    const read = RP().setState(dsl, '1', 'read');
    const second = run(read, first.memo);
    expect(second.entries[0].status).toBe('untouched');
    expect(second.entries[0].passes).toBe(0);
  });

  test('応答を返しただけでは図が書き換わったことにしない', () => {
    const dsl = pinned();
    const first = run(dsl, null);
    const replied = PR().add(dsl, '1', {
      verdict: 'held', author: 'primary', at: NOW, text: '次の版でまとめて直す',
    });
    const second = run(replied, first.memo);
    // 応答があるので着手だが、見送り回数は増えない (図の本文は同じ)。
    expect(second.entries[0].status).toBe('started');
    expect(second.entries[0].passes).toBe(0);
  });

  test('指摘した行を直せば解消', () => {
    const dsl = pinned();
    const first = run(dsl, null);
    const fixed = dsl.replace('Idle --> Busy : Dma_Configure', 'Idle --> Busy : Dma_Start');
    const second = run(fixed, first.memo);
    expect(second.entries[0].status).toBe('resolved');
  });

  test('対応済みの印が付いていれば解消', () => {
    const dsl = RP().setState(pinned(), '1', 'done');
    const r = run(dsl, null);
    expect(r.entries[0].status).toBe('resolved');
  });

  test('「直した」応答だけでは解消にしない (裏取りできるよう箱に残す)', () => {
    const dsl = PR().add(pinned(), '1', {
      verdict: 'done', author: 'primary', at: NOW, text: 'ラベルを直した',
    });
    const r = run(dsl, null);
    expect(r.entries[0].status).toBe('started');
    expect(r.entries[0].why.indexOf('指摘した行はそのまま') >= 0).toBe(true);
  });

  test('「直した」応答のあと本当に行が直っていれば解消', () => {
    const replied = PR().add(pinned(), '1', {
      verdict: 'done', author: 'primary', at: NOW, text: 'ラベルを直した',
    });
    const fixed = replied.replace(
      'Idle --> Busy : Dma_Configure\n', 'Idle --> Busy : Dma_Start\n');
    const r = run(fixed, null);
    expect(r.entries[0].status).toBe('resolved');
  });

  test('解消した指摘の控えは持ち越さない', () => {
    const dsl = pinned();
    const first = run(dsl, null);
    const done = RP().setState(dsl, '1', 'done');
    const second = run(done, first.memo);
    expect(Object.keys(second.memo).length).toBe(0);
  });

  test('図の指紋は指摘行と応答行を数えない', () => {
    const bare = PP().docFingerprint(DSL);
    const withPin = PP().docFingerprint(pinned());
    expect(withPin).toBe(bare);
    const withReply = PP().docFingerprint(
      PR().add(pinned(), '1', { verdict: 'held', author: 'p', at: NOW, text: 'あとで' }));
    expect(withReply).toBe(bare);
  });

  test('整形だけの差では見送りを増やさない', () => {
    const dsl = pinned();
    const first = run(dsl, null);
    const reformatted = dsl.replace('[*] --> Idle', '  [*]  -->  Idle  ') + '\n';
    const second = run(reformatted, first.memo);
    expect(second.entries[0].passes).toBe(0);
    expect(second.entries[0].status).toBe('untouched');
  });

  test('未解消だけを引ける', () => {
    const docs = [
      { name: 'a.puml', dsl: RP().add(DSL, { line: 4, text: 'x', at: AT, id: '1' }) },
      { name: 'b.puml', dsl: RP().setState(RP().add(DSL, { line: 5, text: 'y', at: AT, id: '1' }), '1', 'done') },
    ];
    const r = PP().observe(PI().collect(docs), docs, null, { now: NOW });
    expect(r.entries.length).toBe(2);
    const open = PP().openOnly(r.entries);
    expect(open.length).toBe(1);
    expect(open[0].item.doc).toBe('a.puml');
  });

  test('要約は状況ごとの件数と最古の経過を言う', () => {
    const r = run(pinned(), null);
    const sum = PP().summary(r.entries);
    expect(sum.total).toBe(1);
    expect(sum.untouched).toBe(1);
    expect(sum.open).toBe(1);
    expect(sum.oldest).toBe('1 時間前');
    expect(PP().headText(sum).indexOf('未着手 1') >= 0).toBe(true);
    expect(PP().headText(sum).indexOf('最古 1 時間前') >= 0).toBe(true);
  });

  test('経過は分・時間・日で言う', () => {
    expect(PP().ageText('2026-09-08T16:00', NOW)).toBe('3 分前');
    expect(PP().ageText('2026-09-08T13:03', NOW)).toBe('3 時間前');
    expect(PP().ageText('2026-09-06T16:03', NOW)).toBe('2 日前');
    expect(PP().ageText('', NOW)).toBe('');
    expect(PP().ageText('ではない日時', NOW)).toBe('');
  });

  test('1 行の表示は状況・経過・見送りを並べる', () => {
    const dsl = pinned();
    const first = run(dsl, null);
    const edited = dsl.replace('title Dma state', 'title x');
    const e = run(edited, first.memo).entries[0];
    expect(PP().entryText(e)).toBe('着手 · 1 時間前 · 見送り 1 回');
  });

  test('並べ替えは未着手を先に、見送りの多い順', () => {
    const entries = [
      { status: 'resolved', passes: 0, item: { at: AT } },
      { status: 'started', passes: 1, item: { at: AT } },
      { status: 'untouched', passes: 0, item: { at: AT } },
      { status: 'started', passes: 4, item: { at: AT } },
    ];
    const sorted = PP().sort(entries);
    expect(sorted[0].status).toBe('untouched');
    expect(sorted[1].passes).toBe(4);
    expect(sorted[2].passes).toBe(1);
    expect(sorted[3].status).toBe('resolved');
  });

  test('読めなかった図の指摘でも落ちない', () => {
    const dsl = pinned();
    const items = PI().collect(docsOf(dsl));
    const r = PP().observe(items, [], null, { now: NOW });
    expect(r.entries.length).toBe(1);
    expect(r.entries[0].status).toBe('untouched');
  });
});
