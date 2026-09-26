'use strict';
// BLK-primary-20260914-2206-wish: 影響が届く図を「1 枚ずつ順に手当てする列」として持てること。
// ここで固定するのは、開いた図から次の未手当てへ進めるところと、端で巻き戻さないところ。

var W = (typeof window !== 'undefined' && window) || global.window;
var FW = W.MA.fixWalk;

var IMPACT = [
  { doc: 'spi_init_sequence', hop: 0, via: ['Spi_Driver'] },
  { doc: 'spi_state', hop: 0, via: ['Spi_Driver'] },
  { doc: 'driver_common_class', hop: 0, via: ['Spi_Driver'] },
  { doc: 'can_init_sequence', hop: 1, via: ['Hw_Ctrl'] },
  { doc: 'irq_init_sequence', hop: 2, via: ['IRQCtrl'] },
];

describe('fix-walk: 影響一覧を手当ての列にする', function() {
  test('一覧の並びのまま列になり、1 枚目から始まる', function() {
    var w = FW.start('Spi_Driver', IMPACT, {});
    expect(w.items.length).toBe(5);
    expect(w.index).toBe(0);
    expect(FW.current(w).doc).toBe('spi_init_sequence');
    expect(FW.progress(w)).toEqual({
      done: 0, total: 5, remaining: 5, complete: false, position: 1,
    });
  });

  test('押した行から始められる (その行が 1 枚目ではなくても)', function() {
    var w = FW.start('Spi_Driver', IMPACT, { startDoc: 'can_init_sequence' });
    expect(w.index).toBe(3);
    expect(FW.current(w).doc).toBe('can_init_sequence');
    expect(FW.progress(w).position).toBe(4);
  });

  test('空の一覧では現在地を持たない', function() {
    var w = FW.start('Spi_Driver', [], {});
    expect(w.index).toBe(-1);
    expect(FW.current(w)).toBe(null);
    expect(FW.labelText(w)).toBe('手当てする図がありません');
  });
});

describe('fix-walk: 次の図へ進む', function() {
  test('直した印を立てると、次のまだの図へ進む', function() {
    var w = FW.doneNext(FW.start('Spi_Driver', IMPACT, {}));
    expect(FW.current(w).doc).toBe('spi_state');
    expect(w.items[0].done).toBe(true);
    expect(FW.progress(w).remaining).toBe(4);
  });

  test('飛ばした図は残り、最後まで行くと戻って拾う', function() {
    var w = FW.start('Spi_Driver', IMPACT, {});
    w = FW.go(w, 1);                       // 1 枚目を飛ばして 2 枚目へ
    w = FW.doneNext(w);                    // spi_state 済 → driver_common_class
    w = FW.doneNext(w);                    // driver_common_class 済 → can_init_sequence
    w = FW.doneNext(w);                    // can_init_sequence 済 → irq_init_sequence
    w = FW.doneNext(w);                    // irq_init_sequence 済 → 飛ばした 1 枚目へ戻る
    expect(FW.current(w).doc).toBe('spi_init_sequence');
    expect(FW.progress(w).remaining).toBe(1);
  });

  test('全部済むと現在地はその場に残り、見出しが済みを言う', function() {
    var w = FW.start('Spi_Driver', IMPACT, {});
    for (var i = 0; i < 5; i++) w = FW.doneNext(w);
    expect(FW.nextUndone(w)).toBe(-1);
    expect(FW.progress(w).complete).toBe(true);
    expect(FW.labelText(w)).toBe('Spi_Driver: 5 図すべて手当て済み');
  });

  test('端では巻き戻さない (1 周したことに気付かないまま直し直さない)', function() {
    var w = FW.start('Spi_Driver', IMPACT, {});
    expect(FW.go(w, -1).index).toBe(0);
    expect(FW.go(FW.go(w, 9), 1).index).toBe(4);
  });

  test('一覧の行を押せばその図へ飛べる。列に無い図では現在地が動かない', function() {
    var w = FW.start('Spi_Driver', IMPACT, {});
    expect(FW.toDoc(w, 'irq_init_sequence').index).toBe(4);
    expect(FW.toDoc(w, 'uart_state').index).toBe(0);
  });
});

describe('fix-walk: 見出しと印', function() {
  test('見出しが 何枚目 / 全体 / 今の図 / 残り を 1 行で言う', function() {
    var w = FW.start('Spi_Driver', IMPACT, { startDoc: 'can_init_sequence' });
    expect(FW.labelText(w)).toBe(
      'Spi_Driver の影響 4 / 5 図 · can_init_sequence (連鎖 1 段) · 残り 5');
  });

  test('印は付け外しでき、元の列は書き換わらない', function() {
    var w = FW.start('Spi_Driver', IMPACT, {});
    var marked = FW.setDone(w, 'spi_state', true);
    expect(marked.items[1].done).toBe(true);
    expect(w.items[1].done).toBe(false);
    expect(FW.setDone(marked, 'spi_state', false).items[1].done).toBe(false);
  });

  test('札から始めた列は札の id と直した印を引き継ぐ', function() {
    var rows = IMPACT.map(function(r, i) {
      return { doc: r.doc, hop: r.hop, via: r.via, done: i === 0 };
    });
    var w = FW.start('Spi_Driver', rows, { ticketId: 'ct-20260914-220600', hops: 3 });
    expect(w.ticketId).toBe('ct-20260914-220600');
    expect(w.hops).toBe(3);
    expect(FW.progress(w).done).toBe(1);
    expect(FW.nextUndone(FW.start('Spi_Driver', rows, {}))).toBe(1);
  });
});

// BLK-primary-20260924-1132-wish: 変更チケットから入った列は、帯に札の名前 (何の変更か) を出し、
// 今の図を保存したら「✓ 直した · 次へ」を目立たせる合図を持つ。保存だけでは印を付けない。
describe('fix-walk: 変更チケットから入った列', function() {
  test('帯の 1 行に札の名前が出る', function() {
    var w = FW.start('IRQCtrl', IMPACT, { ticketId: 't1', title: 'IRQCtrl の仕様変更' });
    expect(FW.labelText(w)).toBe(
      'IRQCtrl の仕様変更 — 1 / 5 図 · spi_init_sequence (直接) · 残り 5');
    var done = IMPACT.map(function(r) { return Object.assign({}, r, { done: true }); });
    expect(FW.labelText(FW.start('IRQCtrl', done, { title: 'IRQCtrl の仕様変更' })))
      .toBe('IRQCtrl の仕様変更: 5 図すべて手当て済み');
  });

  test('札の名前は列を送っても保たれる', function() {
    var w = FW.doneNext(FW.start('IRQCtrl', IMPACT, { title: 'IRQCtrl の仕様変更' }));
    expect(w.title).toBe('IRQCtrl の仕様変更');
    expect(FW.go(w, 1).title).toBe('IRQCtrl の仕様変更');
  });

  test('今の図を保存すると合図が立つ。印は付かない', function() {
    var w = FW.start('IRQCtrl', IMPACT, { title: 'T' });
    var s = FW.noteSaved(w, 'spi_init_sequence.puml');
    expect(FW.isSaved(s)).toBe(true);
    expect(s.items[0].done).toBe(false);
    expect(FW.progress(s).done).toBe(0);
    expect(FW.labelText(s)).toContain('保存しました。直し終えたら「✓ 直した · 次へ」');
  });

  test('別の図の保存では立たず、次の図へ移ると消える', function() {
    var w = FW.start('IRQCtrl', IMPACT, {});
    expect(FW.noteSaved(w, 'spi_state')).toBe(w);
    var s = FW.noteSaved(w, 'spi_init_sequence');
    expect(FW.isSaved(FW.go(s, 1))).toBe(false);
    expect(FW.isSaved(FW.doneNext(s))).toBe(false);
  });
});
