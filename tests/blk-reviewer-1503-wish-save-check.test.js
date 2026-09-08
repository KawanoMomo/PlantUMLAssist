'use strict';
// BLK-reviewer-20260908-1503-wish: 保存したその場で突合を掛け、いま保存した図に
// 新しく生えた不一致だけを警告する。ここでは「新規と未解消の分け方」「無視回数の
// 積み方」「直したら消えること」を固定する (突合そのものは audit-board の職掌)。

const board = require('../src/core/audit-board');
const sc = require('../src/core/save-check');

function ok(result) { return { status: 'ok', result: result }; }

// dma_state.puml に架空の遷移ラベルがある状態の board (起票の実例)。
function boardWithEventGap() {
  return board.build({
    audits: {
      consistency: ok({
        naming: [], unused: [], methods: [],
        events: [{ event: 'Dma_Configure', cls: 'Dma', docs: ['dma_state.puml'] }],
        granularity: [], count: 1,
      }),
    },
  });
}

function cleanBoard() {
  return board.build({
    audits: {
      consistency: ok({ naming: [], unused: [], methods: [], events: [], granularity: [], count: 0 }),
    },
  });
}

describe('save-check — 保存した図の不一致をその場で分ける', function() {
  test('初回の保存では、その図の不一致が「新規」として挙がる', function() {
    const res = sc.evaluate(boardWithEventGap(), { doc: 'dma_state.puml', state: { seen: {} } });
    expect(res.added.length).toBe(1);
    expect(res.repeated.length).toBe(0);
    expect(res.added[0].row.title).toBe('Dma_Configure');
    expect(res.added[0].row.category).toBe('整合/イベント');
    expect(sc.shouldWarn(res)).toBe(true);
    expect(sc.summaryLine(res)).toContain('新しい不一致 1 件');
  });

  test('他の図の不一致は、いま保存した図の警告に混ざらない', function() {
    const res = sc.evaluate(boardWithEventGap(), { doc: 'can_state.puml', state: { seen: {} } });
    expect(res.total).toBe(0);
    expect(sc.shouldWarn(res)).toBe(false);
  });

  test('図をまたぐ指摘は、巻き込まれている図の保存でも出る', function() {
    const b = board.build({
      audits: {
        name: ok({
          variants: [{ key: 'irq', suggested: 'IrqCtrl', members: [
            { name: 'IrqCtrl', docs: ['a.puml'], refs: 3 },
            { name: 'IRQ_Ctrl', docs: ['b.puml'], refs: 1 },
          ] }],
          undeclared: [],
        }),
      },
    });
    const res = sc.evaluate(b, { doc: 'b.puml', state: { seen: {} } });
    expect(res.added.length).toBe(1);
    expect(res.added[0].row.doc).toBe(board.CROSS);
  });

  test('直さずに保存し直すと「未解消」になり、無視回数が積み上がる', function() {
    const b = boardWithEventGap();
    let state = { seen: {} };
    let res = sc.evaluate(b, { doc: 'dma_state.puml', state: state });
    state = sc.advance(state, res, '2026-09-08T16:00:00Z');

    res = sc.evaluate(b, { doc: 'dma_state.puml', state: state });
    expect(res.added.length).toBe(0);
    expect(res.repeated.length).toBe(1);
    expect(res.repeated[0].ignored).toBe(1);
    state = sc.advance(state, res);

    res = sc.evaluate(b, { doc: 'dma_state.puml', state: state });
    expect(res.repeated[0].ignored).toBe(2);
    expect(res.maxIgnored).toBe(2);
    expect(sc.summaryLine(res)).toContain('2 回そのまま保存');
  });

  test('直すと控えから落ち、解消として数える', function() {
    let state = sc.advance({ seen: {} },
      sc.evaluate(boardWithEventGap(), { doc: 'dma_state.puml', state: { seen: {} } }));
    const res = sc.evaluate(cleanBoard(), { doc: 'dma_state.puml', state: state });
    expect(res.total).toBe(0);
    expect(res.resolved).toBe(1);
    expect(sc.shouldWarn(res)).toBe(false);
    expect(sc.summaryLine(res)).toContain('1 件が解消');
    state = sc.advance(state, res);
    expect(Object.keys(state.seen).length).toBe(0);
  });

  test('他の図の控えは、別の図を保存しても消えない', function() {
    const b = board.build({
      audits: {
        consistency: ok({
          naming: [], methods: [], events: [], granularity: [], count: 2,
          unused: [{ name: 'Watchdog', doc: 'a.puml' }, { name: 'Timer', doc: 'b.puml' }],
        }),
      },
    });
    let state = sc.advance({ seen: {} }, sc.evaluate(b, { doc: 'a.puml', state: { seen: {} } }));
    state = sc.advance(state, sc.evaluate(b, { doc: 'b.puml', state: state }));
    expect(Object.keys(state.seen).length).toBe(2);
    // a.puml を直しても b.puml の控えは残る
    const fixedA = board.build({
      audits: {
        consistency: ok({ naming: [], methods: [], events: [], granularity: [], count: 1,
          unused: [{ name: 'Timer', doc: 'b.puml' }] }),
      },
    });
    state = sc.advance(state, sc.evaluate(fixedA, { doc: 'a.puml', state: state }));
    expect(Object.keys(state.seen).length).toBe(1);
    expect(sc.evaluate(b, { doc: 'b.puml', state: state }).repeated.length).toBe(1);
  });

  test('帯の行は新規が先、未解消は無視回数の多い順', function() {
    const b = board.build({
      audits: {
        consistency: ok({
          naming: [], methods: [], events: [], granularity: [], count: 3,
          unused: [{ name: 'Old1', doc: 'a.puml' }, { name: 'Old2', doc: 'a.puml' },
                   { name: 'New1', doc: 'a.puml' }],
        }),
      },
    });
    const state = { seen: {
      'consistency.unused|a.puml|Old1': { count: 1, doc: 'a.puml' },
      'consistency.unused|a.puml|Old2': { count: 5, doc: 'a.puml' },
    } };
    const lines = sc.lines(sc.evaluate(b, { doc: 'a.puml', state: state }));
    expect(lines.length).toBe(3);
    expect(lines[0].isNew).toBe(true);
    expect(lines[0].text).toContain('New1');
    expect(lines[1].ignored).toBe(5);
    expect(lines[2].ignored).toBe(1);
  });

  test('控えは保存フォルダごとに分かれ、壊れた値でも空として読む', function() {
    expect(sc.storageKey('./autosave')).not.toBe(sc.storageKey('D:/work'));
    expect(sc.storageKey(null)).toBe(sc.storageKey('./autosave'));
    const store = {
      _v: 'not json',
      getItem: function() { return this._v; },
      setItem: function(k, v) { this._v = v; },
    };
    expect(sc.load(store, './autosave')).toEqual({ seen: {} });
    expect(sc.save(store, './autosave', { seen: { x: { count: 1, doc: 'a.puml' } } })).toBe(true);
    expect(sc.load(store, './autosave').seen.x.count).toBe(1);
    expect(sc.load(null, './autosave')).toEqual({ seen: {} });
  });

  test('突合が動かなかったときは「不一致なし」と言わない', function() {
    const res = sc.evaluate(board.build({ audits: {} }), { doc: 'a.puml', state: { seen: {} } });
    expect(sc.summaryLine(res)).toContain('突合は動きませんでした');
  });

  test('checkLine は突合の結果だけを述べ、「保存しました」を言わない', function() {
    // ステータスバーでは保存先の文言の後ろに足すので、ここが「保存しました」で
    // 始まると「どこに書いたか」を押しのけてしまう (known-red の 2 件の原因)。
    const cases = [
      sc.evaluate(board.build({ audits: {} }), { doc: 'a.puml', state: { seen: {} } }),
      sc.evaluate(board.build({ audits: { 'a.puml': { rows: [{ text: 'New1', kind: 'diff' }] } } }),
        { doc: 'a.puml', state: { seen: {} } }),
    ];
    cases.forEach(function(res) {
      expect(sc.checkLine(res)).not.toContain('保存しました');
      expect(sc.summaryLine(res)).toBe('保存しました。' + sc.checkLine(res));
    });
  });
});
