'use strict';
// BLK-primary-20260909-0603-wish: 依存グラフで洗った影響一覧を「変更チケット」として
// 束ね、run をまたいで「15 枚中どこまで直したか」を持ち越せること。
// ここで固定するのは、洗い直しても直した印が消えないところ (消えたら札の意味が無い)。

var W = (typeof window !== 'undefined' && window) || global.window;
var CT = W.MA.changeTicket;

var IMPACT = [
  { doc: 'irq_init_sequence', hop: 0, via: ['IRQCtrl'] },
  { doc: 'irq_state', hop: 0, via: ['IRQCtrl'] },
  { doc: 'driver_common_class', hop: 0, via: ['IRQCtrl'] },
  { doc: 'spi_init_sequence', hop: 1, via: ['Hw_Ctrl'] },
];

describe('change-ticket: 影響一覧を札にする', function() {
  test('依存グラフの一覧が、直した印つきの札になる', function() {
    var t = CT.fromImpact('IRQCtrl', IMPACT, { at: '2026-09-09T06:30:00Z', hops: 2 });
    expect(t.subject).toBe('IRQCtrl');
    expect(t.title).toBe('IRQCtrl の仕様変更');
    expect(t.items.length).toBe(4);
    expect(t.items[0].done).toBe(false);
    expect(t.items[3].hop).toBe(1);
    expect(t.hops).toBe(2);
    expect(/^ct-\d{8}-\d{6}$/.test(t.id)).toBe(true);
  });

  test('一覧の並びは依存グラフのまま (直接 → 連鎖)', function() {
    var t = CT.fromImpact('IRQCtrl', IMPACT, {});
    expect(t.items.map(function(i) { return i.doc; })).toEqual([
      'irq_init_sequence', 'irq_state', 'driver_common_class', 'spi_init_sequence',
    ]);
  });
});

describe('change-ticket: どこまで直したか', function() {
  var base = CT.fromImpact('IRQCtrl', IMPACT, { at: '2026-09-09T06:30:00Z' });

  test('印を立てると残りが減る', function() {
    expect(CT.progress(base).remaining).toBe(4);
    var t = CT.setDone(base, 'irq_state', true, '2026-09-09T07:00:00Z');
    var p = CT.progress(t);
    expect(p.done).toBe(1);
    expect(p.remaining).toBe(3);
    expect(p.complete).toBe(false);
    expect(CT.progressText(t)).toBe('1 / 4 図 済 (残り 3)');
    // 元の札は書き換えない (呼ぶ側が持ち回る)。
    expect(CT.progress(base).done).toBe(0);
  });

  test('印を下ろすと済んだ日時も消える', function() {
    var t = CT.setDone(base, 'irq_state', true, '2026-09-09T07:00:00Z');
    expect(CT.find([t], t.id).items[1].doneAt).toBe('2026-09-09T07:00:00Z');
    var back = CT.setDone(t, 'irq_state', false);
    expect(back.items[1].done).toBe(false);
    expect(back.items[1].doneAt).toBe(null);
  });

  test('未チェックだけを引ける (全図を見比べなくてよい)', function() {
    var t = CT.setDone(CT.setDone(base, 'irq_state', true), 'irq_init_sequence', true);
    expect(CT.remaining(t).map(function(i) { return i.doc; }))
      .toEqual(['driver_common_class', 'spi_init_sequence']);
  });

  test('全部済むと complete が立つ', function() {
    var t = base;
    IMPACT.forEach(function(r) { t = CT.setDone(t, r.doc, true); });
    expect(CT.progress(t).complete).toBe(true);
    expect(CT.progressText(t)).toBe('全 4 図を直し終えています');
  });
});

describe('change-ticket: 洗い直し', function() {
  var base = CT.setDone(CT.fromImpact('IRQCtrl', IMPACT, {}), 'irq_state', true);

  test('図が増えても、直した印は残る', function() {
    var next = CT.refresh(base, IMPACT.concat([{ doc: 'can_state', hop: 1, via: ['Hw_Ctrl'] }]));
    expect(next.items.length).toBe(5);
    expect(CT.progress(next).done).toBe(1);
    expect(next.items[1].doc).toBe('irq_state');
    expect(next.items[1].done).toBe(true);
  });

  test('影響から外れた図は黙って消えず、印が付く', function() {
    var next = CT.refresh(base, IMPACT.slice(0, 3));
    var gone = next.items.filter(function(i) { return i.gone; });
    expect(gone.length).toBe(1);
    expect(gone[0].doc).toBe('spi_init_sequence');
    // 消えた図は残りに数えない (直しようがない)。
    var p = CT.progress(next);
    expect(p.total).toBe(3);
    expect(p.remaining).toBe(2);
  });
});

describe('change-ticket: 保存フォルダから読み戻す', function() {
  test('新しい札が上に並び、欠けた欄は埋まる', function() {
    var rows = CT.rows({ tickets: [
      { id: 'ct-20260908-100000', subject: 'SpiDrv', at: '2026-09-08T10:00:00Z' },
      { id: 'ct-20260909-063000', subject: 'IRQCtrl', at: '2026-09-09T06:30:00Z',
        items: [{ doc: 'irq_state', hop: 0, done: true }] },
      { subject: '壊れた札' },
    ] });
    expect(rows.length).toBe(2);
    expect(rows[0].subject).toBe('IRQCtrl');
    expect(rows[0].updatedAt).toBe('2026-09-09T06:30:00Z');
    expect(rows[1].title).toBe('SpiDrv の仕様変更');
    expect(rows[1].items).toEqual([]);
    expect(CT.find(rows, 'ct-20260908-100000').subject).toBe('SpiDrv');
  });

  test('見出しで未完の本数が分かる', function() {
    expect(CT.listText([])).toBe('変更チケットはまだありません');
    var done = CT.setDone(CT.fromImpact('A', [{ doc: 'a', hop: 0 }], { id: 'ct-1' }), 'a', true);
    var open = CT.fromImpact('B', [{ doc: 'b', hop: 0 }], { id: 'ct-2' });
    expect(CT.listText([done, open])).toBe('2 件 (未完 1)');
  });
});
