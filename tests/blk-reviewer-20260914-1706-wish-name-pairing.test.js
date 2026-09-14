'use strict';
// BLK-reviewer-20260914-1706-wish: primary⇔junior の表記揺れ (IRQCtrl/Irq_Ctrl、
// ClockCtrl/Clock_Ctrl) を突合したが、画面は「primary だけ / junior だけ」の 2 列で、
// どの名前がどの名前の別表記かは読む側が結び直していた。1 つの対応表にする。
const NP = window.MA.namePairing;

describe('namePairing.normalize', function() {
  test('記号と大小を落とす (表記揺れの判定はこれだけで決める)', function() {
    expect(NP.normalize('IRQCtrl')).toBe(NP.normalize('Irq_Ctrl'));
    expect(NP.normalize('Clock-Ctrl')).toBe('clockctrl');
    expect(NP.normalize(null)).toBe('');
  });
});

describe('namePairing.table — 片方だけの 2 列を対応表にする', function() {
  const part = {
    both: ['Hw_Ctrl'],
    onlyA: ['IRQCtrl', 'ClockCtrl', 'Spi_Driver', 'Adc_Driver'],
    onlyB: ['Irq_Ctrl', 'Clock_Ctrl', 'SpiDrv', 'Dma_Engine'],
  };
  const t = NP.table(part, 'primary', 'junior');

  test('記号と大小だけの違いは表記揺れとして 1 行に並ぶ', function() {
    const v = t.rows.filter((r) => r.kind === 'variant');
    expect(v.map((r) => r.a + '⇔' + r.b).sort())
      .toEqual(['ClockCtrl⇔Clock_Ctrl', 'IRQCtrl⇔Irq_Ctrl']);
    expect(t.variants).toBe(2);
  });
  test('頭が揃っているだけの組は「似ている」に落とす (別物かもしれない)', function() {
    const sim = t.rows.filter((r) => r.kind === 'similar');
    expect(sim.map((r) => r.a + '⇔' + r.b)).toEqual(['Spi_Driver⇔SpiDrv']);
    expect(sim[0].note).toContain('要確認');
  });
  test('相手のいない名前は片方だけとして残る (過不足を消さない)', function() {
    const only = t.rows.filter((r) => r.kind === 'onlyA' || r.kind === 'onlyB');
    expect(only.map((r) => (r.a || r.b)).sort()).toEqual(['Adc_Driver', 'Dma_Engine']);
    expect(only.find((r) => r.a === 'Adc_Driver').note).toBe('primary だけにある');
    expect(only.find((r) => r.b === 'Dma_Engine').note).toBe('junior だけにある');
  });
  test('1 つの名前を 2 度使わない', function() {
    const used = t.rows.filter((r) => r.b).map((r) => r.b);
    expect(new Set(used).size).toBe(used.length);
  });
  test('揺れている行が先、一致している行は最後', function() {
    expect(t.rows[0].kind).toBe('variant');
    expect(t.rows[t.rows.length - 1].kind).toBe('same');
    expect(t.same).toBe(1);
  });
  test('揺れている行だけを取り出せる (画面が既定で出すのはここ)', function() {
    expect(NP.mismatchRows(t).map((r) => r.kind)).toEqual(['variant', 'variant', 'similar']);
  });
  test('要約は母数まで言う (0 件が何を見ての 0 件か分かるように)', function() {
    expect(NP.summaryLine(t)).toBe('部品名: 表記揺れ 2 / 似ている 1 / 片方だけ 2 / 一致 1');
  });
});

describe('namePairing.table — 突合が「一致」に混ぜた綴り割れ', function() {
  // domain-cohort は記号と大小を落とした鍵で突き合わせるので、綴りの割れた組は
  // `IRQCtrl / Irq_Ctrl` という 1 つの値として both に入ってくる。ここが実データ。
  const t = NP.table({ both: ['IRQCtrl / Irq_Ctrl', 'Hw_Ctrl'], onlyA: [], onlyB: [] },
    'primary', 'junior');
  test('一致の列に混ざった綴り割れを、表記揺れとして取り出す', function() {
    const v = NP.mismatchRows(t);
    expect(v.length).toBe(1);
    expect(v[0].a).toBe('IRQCtrl');
    expect(v[0].b).toBe('Irq_Ctrl');
    expect(v[0].kind).toBe('variant');
  });
  test('綴りまで同じ部品は一致のまま', function() {
    expect(t.same).toBe(1);
    expect(NP.summaryLine(t)).toBe('部品名: 表記揺れ 1 / 似ている 0 / 片方だけ 0 / 一致 1');
  });
});

describe('namePairing.table — 揺れが無いとき', function() {
  test('全部一致なら揺れは 0 行 (空の表でも落ちない)', function() {
    const t = NP.table({ both: ['Gpio_Driver'], onlyA: [], onlyB: [] }, 'primary', 'junior');
    expect(NP.mismatchRows(t)).toEqual([]);
    expect(NP.summaryLine(t)).toContain('表記揺れ 0');
    expect(NP.table(null, 'a', 'b').rows).toEqual([]);
  });
});
