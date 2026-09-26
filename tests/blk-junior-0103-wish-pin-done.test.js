'use strict';
// BLK-junior-20260908-0103-wish: 指摘に「対応済み」を持たせ、どの指摘にどの修正が
// 対応するかを図に残す。ファイル名末尾の「(レビュー反映)」での状態管理を無くす。

const RP = () => window.MA.reviewPins;
const PI = () => window.MA.pinInbox;
// pin-jump.js は共通の読み込み一覧に無い (blk-junior-2303 と同じくここで読む)。
require('../src/core/pin-jump.js');
const PJ = () => window.MA.pinJump;

const DSL = [
  '@startuml',
  'title Timer state',
  '[*] --> Idle',
  'Idle --> Busy : Timer_StartConv',
  'Busy --> Idle : Timer_Ack',
  '@enduml',
].join('\n');

// 指摘を 1 件付けた DSL と、その指摘先の行を直した DSL を作る。
function pinned() {
  return RP().add(DSL, { line: 4, text: '遷移名が状態機械と合っていない', author: 'reviewer' });
}
function fixed(dsl) {
  return dsl.replace('Idle --> Busy : Timer_StartConv', 'Idle --> Busy : Timer_Start');
}

describe('review-pins — 対応済みと、対応した修正の記録', () => {

  test('直した行を渡すと対応済みになり、修正前の行が残る', () => {
    var out = RP().markDone(fixed(pinned()), '1', { line: 4 });
    var p = RP().list(out)[0];
    expect(p.state).toBe('done');
    expect(p.anchor).toBe('Idle --> Busy : Timer_Start');
    expect(p.before).toBe('Idle --> Busy : Timer_StartConv');
    expect(RP().fixText(p)).toBe('修正: Idle --> Busy : Timer_StartConv → Idle --> Busy : Timer_Start');
  });

  test('対応済みにすると anchor が貼り替わるので迷子にならない', () => {
    // 直しただけでは迷子 (指摘先の行が消えている)。
    expect(RP().list(fixed(pinned()))[0].stale).toBe(true);
    var out = RP().markDone(fixed(pinned()), '1', { line: 4 });
    var p = RP().list(out)[0];
    expect(p.stale).toBe(false);
    expect(p.line).toBe(4);
  });

  test('行を書き替えずに済んだ指摘は修正前を持たない', () => {
    var p = RP().list(RP().markDone(pinned(), '1', { line: 4 }))[0];
    expect(p.state).toBe('done');
    expect(p.before).toBe('');
    expect(RP().fixText(p)).toBe('');
  });

  test('対応済みの行は 7 番目のフィールドで書き戻され、読み直せる', () => {
    var out = RP().markDone(fixed(pinned()), '1', { line: 4 });
    var line = out.split('\n').filter((l) => RP().isPinLine(l))[0];
    expect(line.split('|').length).toBe(7);
    expect(RP().parsePinLine(line).before).toBe('Idle --> Busy : Timer_StartConv');
  });

  test('対応済みは 既読トグルで動かない (修正の記録を押し間違いで消さない)', () => {
    var out = RP().markDone(fixed(pinned()), '1', { line: 4 });
    expect(RP().list(RP().toggleState(out, '1'))[0].state).toBe('done');
  });

  test('未対応に戻しても修正前の記録は残る', () => {
    var out = RP().reopen(RP().markDone(fixed(pinned()), '1', { line: 4 }), '1');
    var p = RP().list(out)[0];
    expect(p.state).toBe('open');
    expect(p.before).toBe('Idle --> Busy : Timer_StartConv');
  });

  test('summary の pending は「対応済み以外」を数える', () => {
    var out = RP().add(pinned(), { line: 5, text: 'b' });
    out = RP().setState(out, '2', 'read');
    var sum = RP().summary(RP().list(out));
    expect(sum).toEqual({ total: 2, open: 1, read: 1, done: 0, pending: 2, stale: 0 });
    var sum2 = RP().summary(RP().list(RP().markDone(out, '2', {})));
    expect(sum2.done).toBe(1);
    expect(sum2.pending).toBe(1);
  });

  test('バッジは未対応件数を出す (既読でも直っていなければ数える)', () => {
    expect(RP().badgeText({ total: 3, open: 1, read: 2, done: 0, pending: 3 })).toBe('指摘 3/3');
    expect(RP().badgeText({ total: 3, open: 1, read: 0, done: 2, pending: 1 })).toBe('指摘 1/3');
  });

  test('図の上の印は対応済みなら「済」で色も別になる', () => {
    expect(RP().markerLabel({ id: '2', state: 'done' })).toBe('済');
    expect(RP().markerColor({ state: 'done' })).not.toBe(RP().markerColor({ state: 'read' }));
    expect(RP().markerColor({ state: 'done' })).not.toBe(RP().markerColor({ state: 'open' }));
  });

  test('一覧の 1 行に 指摘 → 修正 が並ぶ', () => {
    var p = RP().list(RP().markDone(fixed(pinned()), '1', { line: 4 }))[0];
    expect(RP().rowText(p)).toBe(
      '#1 L4 対応済み ・ 遷移名が状態機械と合っていない'
      + ' ・ 修正: Idle --> Busy : Timer_StartConv → Idle --> Busy : Timer_Start');
  });

  test('次の未読へは対応済みを飛ばす', () => {
    var pins = [
      { id: '1', state: 'done', line: 4, stale: false },
      { id: '2', state: 'open', line: 5, stale: false },
    ];
    expect(PJ().nextOpen(pins, null).id).toBe('2');
  });
});

describe('pin-inbox — 対応済みは受信箱から落ちる', () => {

  function docs(dsl) {
    return [{ name: 'timer_state.puml', dsl: dsl }];
  }

  test('pendingOnly は対応済みを落とす', () => {
    var done = RP().markDone(fixed(pinned()), '1', { line: 4 });
    var items = PI().collect(docs(done));
    expect(items.length).toBe(1);
    expect(PI().filter(items, { pendingOnly: true }).length).toBe(0);
    expect(PI().filter(items, {}).length).toBe(1);
  });

  test('未対応の数は対応済みを引いた数 (見出し・バッジ)', () => {
    var two = RP().add(pinned(), { line: 5, text: 'b' });
    var sum = PI().summary(PI().collect(docs(RP().markDone(two, '2', {}))));
    expect(sum.done).toBe(1);
    expect(sum.pending).toBe(1);
    expect(PI().headText(sum)).toBe('未対応 1 件 / 全 2 件 ・ 1 図');
    expect(PI().badgeText(sum)).toBe('指摘箱 1/2');
  });

  test('全部対応済みの図は未対応の図に数えない', () => {
    var sum = PI().summary(PI().collect(docs(RP().markDone(pinned(), '1', {}))));
    expect(sum.openDocs).toBe(0);
    expect(PI().groupText(PI().groupByDoc(PI().collect(docs(RP().markDone(pinned(), '1', {}))))[0]))
      .toBe('timer_state.puml — 未対応 0 / 1 件');
  });

  test('1 行の状態表示は 未読 / 既読 / 対応済み を書き分ける', () => {
    var p = PI().collect(docs(RP().markDone(fixed(pinned()), '1', { line: 4 })))[0];
    expect(PI().rowText(p).indexOf('対応済み')).toBeGreaterThan(-1);
  });
});
