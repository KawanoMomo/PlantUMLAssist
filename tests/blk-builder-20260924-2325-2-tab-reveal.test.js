'use strict';
// BLK-builder-20260924-2325-2 (design 10a): 図を開いてタブが増えても、選ばれているタブが右端に貼り付いた
// 「＋」「ツール ▾」の下に潜らないよう、タブ列を横に送る量を決める。

const TR = () => window.MA.tabReveal;

// 実機の値: タブ列 400px、中身 520px (最後のタブの後ろに貼り付けの分も並ぶ)、右端の貼り付け (＋ 26px + ツール ▾ 62px + 間) ≒ 96px。
const BASE = { scrollLeft: 0, viewWidth: 400, contentWidth: 520, reserveRight: 96 };

describe('tab-reveal — 選ばれているタブが見える所まで送る', () => {
  test('右の貼り付けの下に潜ったタブは、右端が貼り付けの手前に来るまで送る', () => {
    // spi_state.puml のタブ: 中身の左から 301〜420px
    const s = TR().scrollFor(Object.assign({}, BASE, { itemLeft: 301, itemWidth: 119 }));
    expect(s).toBe(420 + 4 - (400 - 96));
    // 送った後、タブの右端は貼り付けより左
    expect(301 + 119 - s).toBeLessThan(400 - 96);
  });

  test('もう見えているタブでは動かさない', () => {
    expect(TR().scrollFor(Object.assign({}, BASE, { itemLeft: 4, itemWidth: 121 }))).toBe(0);
    expect(TR().scrollFor(Object.assign({}, BASE, { scrollLeft: 50, itemLeft: 127, itemWidth: 100 }))).toBe(50);
  });

  test('左に切れているタブは、左端がそろうまで戻す', () => {
    expect(TR().scrollFor(Object.assign({}, BASE, { scrollLeft: 115, itemLeft: 4, itemWidth: 121 }))).toBe(0);
    expect(TR().scrollFor({ scrollLeft: 300, viewWidth: 400, contentWidth: 900, reserveRight: 96,
      itemLeft: 200, itemWidth: 80 })).toBe(196);
  });

  test('送り量は 0 〜 (中身 − 見える幅) に収める', () => {
    const s = TR().scrollFor({ scrollLeft: 0, viewWidth: 400, contentWidth: 450, reserveRight: 96,
      itemLeft: 330, itemWidth: 110 });
    expect(s).toBe(50);
  });

  test('中身が見える幅に収まっていれば送らない', () => {
    expect(TR().scrollFor({ scrollLeft: 0, viewWidth: 400, contentWidth: 400, reserveRight: 96,
      itemLeft: 250, itemWidth: 120 })).toBe(0);
  });

  test('見える幅より広いタブは左端をそろえる', () => {
    expect(TR().scrollFor({ scrollLeft: 0, viewWidth: 200, contentWidth: 900, reserveRight: 96,
      itemLeft: 500, itemWidth: 180 })).toBe(496);
  });

  test('タブ列がまだ描かれていない (幅 0) ときは今の値のまま', () => {
    expect(TR().scrollFor({ scrollLeft: 0, viewWidth: 0, contentWidth: 0, itemLeft: 300, itemWidth: 100 })).toBe(0);
  });
});
