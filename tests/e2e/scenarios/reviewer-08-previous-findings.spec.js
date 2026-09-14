// @ts-check
// reviewer 台本 手順8: 前回の指摘が反映されたか確認する。
//
// BLK-reviewer-20260914-1206-wish: これまでは、前回の指摘文書・手順2〜7 で出した今回の指摘・
// 前回控えとの diff の 3 つを手で突き合わせ、1 件ずつ「反映済み / 継続」を頭の中で
// 振り分け、継続の回数も自分で憶えていた。いまは前回の 指摘.md をそのまま渡せば、
// 振り分けと継続 tick 数まで 1 枚の画面が出す。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');
const auditBoard = require('../../../src/core/audit-board');
const reviewBoard = require('../../../src/core/review-board');

// 前回 primary に返した指摘文書そのもの (reviewer が 指摘.md に上書き保存した形)。
const 指摘 = [
  '# primary への指摘(前回)',
  '',
  '## 【継続・2回目】gpio_init_sequence.puml の participant 名が他図と揃っていない',
  '`GpioDrv` は他図の `Gpio_Driver` と揃っていない。初出: runs/20260913-0206。継続 2 tick 目。',
  '',
  '## 【継続】spi_init_sequence.puml の participant 名が他図と揃っていない',
  '`SpiDrv` は他図の `Spi_Driver` と揃っていない。',
  '',
  '## 突合サマリ',
  '命名 2 件。どちらも継続・未着手。',
].join('\n');

// 手順2〜7 で今回出した指摘。台本どおり DSL を読んで拾う。
function findingsOfToday() {
  const out = [];
  Object.entries(R.DOCS).forEach(([doc, dsl]) => {
    dsl.split('\n').forEach((line, i) => {
      if (/^participant\s+\w+Drv\b/.test(line)) {
        const name = line.split(/\s+/)[1];
        out.push({ doc: doc + '.puml', line: i + 1, keep: false, label: '要再確認',
          text: name + ' は他図の Gpio_Driver と揃っていない' });
      }
    });
  });
  const seq = R.DOCS.gpio_init_sequence;
  const used = new Set(R.arrowEnds(seq));
  R.participants(seq).forEach((p) => {
    if (used.has(p)) return;
    out.push({ doc: 'gpio_init_sequence.puml', line: 0, keep: false, label: '要再確認',
      text: p + ' は宣言だけで使われていない' });
  });
  return out;
}

test('手順8 前回の指摘それぞれに、反映済みか継続かを画面が言う', () => {
  const board = auditBoard.build({ findings: findingsOfToday() });
  const view = reviewBoard.build({
    board: board,
    findings: 指摘,
    // 前回控えとの diff。spi 側だけが実際に書き換わっている。
    changedFiles: ['spi_init_sequence.puml'],
  });

  const byDoc = {};
  view.carried.forEach((c) => { byDoc[c.finding.docs[0]] = c; });

  // GpioDrv は今回も指摘に出る = 継続。tick 数は前回の 2 から 1 つ進む。
  const gpio = byDoc.gpio_init_sequence;
  expect(gpio.verdict).toBe('carried');
  expect(gpio.tick).toBe(3);
  expect(gpio.finding.since).toBe('runs/20260913-0206');
  expect(gpio.rows.length).toBe(1);
  // 前回控えから 1 行も変わっていない = 未着手、まで同じ行で分かる。
  expect(gpio.touched).toEqual([]);

  // SpiDrv は直っている = 解消。前回控えから中身も変わっている。
  const spi = byDoc.spi_init_sequence;
  expect(spi.verdict).toBe('resolved');
  expect(spi.rows).toEqual([]);

  // 件数表の節は指摘として振り分けない (本文に「継続・未着手」が出てきても)。
  expect(view.carried.length).toBe(2);
  expect(view.counts.carried).toBe(1);
  expect(view.counts.resolved).toBe(1);
  // 前回の指摘に当たらない今回の指摘は、新規として別に残る。
  expect(view.fresh.map((r) => r.title)).toEqual(['Dbg_Trace は宣言だけで使われていない']);

  // 到達条件: 4 種類の情報源を手で束ねずに、1 枚の文面がそのまま読める。
  const md = reviewBoard.markdown(view, '前回の指摘の反映状況');
  expect(md).toContain('## 前回の指摘 — 継続（1 件）');
  expect(md).toContain('3 tick 目');
  expect(md).toContain('前回控えから 1 行も変わっていません = 未着手');
  expect(md).toContain('## 前回の指摘 — 解消（1 件）');
  expect(md).toContain('## 今回の新規（1 件）');
  expect(md).toContain('## 前回控えから変わった図（1 枚）');
});
