// @ts-check
// reviewer 台本 手順8: 前回の指摘が反映されたか、前回の run ログと今回の DSL を比べて確認する。
// diff が無くても、手動指摘の対象行は毎回直接読み直して裏取りする。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');

// 前回返した指摘(図名・消えているべき名前)。
const PREVIOUS = [
  { doc: 'spi_init_sequence', gone: 'SpiDrv' },
  { doc: 'gpio_init_sequence', gone: 'GpioDrv' },
];

test('手順8 前回の指摘それぞれに、反映済みか継続かを言える', () => {
  const verdicts = PREVIOUS.map((p) => {
    const dsl = R.DOCS[p.doc];
    const stillThere = new RegExp('\\b' + p.gone + '\\b').test(dsl);
    return { doc: p.doc, applied: !stillThere };
  });
  // 到達条件: 反映済みと継続が 1 件ずつ、対象行を読み直した結果として出る。
  expect(verdicts).toEqual([
    { doc: 'spi_init_sequence', applied: true },
    { doc: 'gpio_init_sequence', applied: false },
  ]);
});
