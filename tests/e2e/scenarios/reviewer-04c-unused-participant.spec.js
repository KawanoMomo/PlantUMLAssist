// @ts-check
// reviewer 台本 手順4.6: 宣言されているが送受信どちらにも使われていない participant を検出する。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');

test('手順4.6 使われていない participant を名指しできる', () => {
  const dsl = R.DOCS.gpio_init_sequence;
  const used = new Set(R.arrowEnds(dsl));
  const unused = R.participants(dsl).filter((p) => !used.has(p));
  // 到達条件: 宣言だけの Dbg_Trace が出て、使われている名前は出ない。
  expect(unused).toEqual(['Dbg_Trace']);
});
