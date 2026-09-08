// @ts-check
// reviewer 台本 手順5: 前回 run の控えと比べ、意図しない変更(無関係な行の差分・整形だけの差分)が
// 混ざっていないか確認する。今回の DSL も控える。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');

function diffLines(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) out.push({ line: i + 1, before: a[i], after: b[i] });
  }
  return out;
}

test('手順5 意図した差分と、整形だけの差分を分けて言える', () => {
  const before = R.DOCS.spi_state;
  // 意図した変更: 遷移ラベルを 1 つ直した。
  const intended = before.replace('Spi_Driver_Write', 'Spi_Driver_Send');
  // 意図しない変更: 各行の末尾に空白を足しただけ(整形差)。
  const cosmetic = before.split('\n').map((l) => l + ' ').join('\n');

  const d1 = diffLines(before, intended);
  expect(d1.length).toBe(1);
  expect(d1[0].after).toContain('Spi_Driver_Send');

  const d2 = diffLines(before, cosmetic);
  // 到達条件: 整形だけの差は、trim すると 1 件も残らない。
  expect(d2.length).toBeGreaterThan(0);
  expect(d2.filter((d) => (d.before || '').trim() !== (d.after || '').trim())).toEqual([]);
});
