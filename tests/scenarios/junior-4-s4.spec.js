// @ts-check
// junior 台本 場面 4「初期化の図を SVG に書き出して設計書に貼る」手順 4:
//   手順 1〜3 を通しで行い、開いた回数・操作の数・待ちの秒数を記録する。
//   開く = Import ▾ → .puml を開く…、書き出し = Export ▾ → SVGとして保存 / PNGとして保存。
// 期待 (principles.md「押した対象だけが変わる」「描ける」「操作コストは計る」):
//   - 開いた回数は 1 回 (書き出しのたびに開き直さない)
//   - 各手順のクリック数は台本の操作数 (1) の 2 倍まで、通しで 6 以下
//   - 開いてから描けるまでの待ちは 3 秒以内 (全体実行の負荷の上限)。renderMs として summary.json に残す
//   - 通しで本文の差分は 0 行。開いた本文は手元のファイルと同じ。最後まで描けている
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

const STATES = ['Idle', 'Running', 'RunningSlow'];
const LABELS = ['Spi_Start', 'Spi_Stop', 'Spi_Throttle'];

test('junior 手順4 開く・SVG・PNG を通しで行い、開いた回数・操作数・待ちを記録する', async ({ page }, testInfo) => {
  const src = H.fixture('state-1.puml');
  const file = testInfo.outputPath('state3.puml');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, src);
  await H.bootWith(page, null);

  const log = { opens: 0, clicks: { open: 0, svg: 0, png: 0 }, waitMs: { open: 0, svg: 0, png: 0 } };

  // 手順 1: 開き、状態 3 つと条件付きの遷移が描けているのを見る。
  let t0 = Date.now();
  await page.locator('#btn-import').click(); log.clicks.open++;
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#imp-file').click()]);
  log.clicks.open++;
  await fc.setFiles(file);
  log.opens++;
  await H.waitDrawn(page, STATES.concat(LABELS));
  log.waitMs.open = Date.now() - t0;
  H.annotate(testInfo, 'renderMs', log.waitMs.open);
  await H.expectRendered(page);
  const opened = await H.getEditorText(page);
  expect(opened.replace(/\r\n/g, '\n')).toBe(src.replace(/\r\n/g, '\n'));

  // 手順 2: SVG。
  t0 = Date.now();
  let dlP = page.waitForEvent('download');
  await page.locator('#btn-export').click(); log.clicks.svg++;
  await page.locator('#exp-svg').click(); log.clicks.svg++;
  const svgDl = await dlP;
  log.waitMs.svg = Date.now() - t0;
  const svgOut = testInfo.outputPath('out.svg');
  await svgDl.saveAs(svgOut);
  const svg = fs.readFileSync(svgOut, 'utf8');
  expect(svg).toContain('<svg');
  for (const w of STATES.concat(LABELS)) expect(svg, 'svg text ' + w).toContain(w);

  // 手順 3: PNG。
  t0 = Date.now();
  dlP = page.waitForEvent('download');
  await page.locator('#btn-export').click(); log.clicks.png++;
  await page.locator('#exp-png').click(); log.clicks.png++;
  const pngDl = await dlP;
  log.waitMs.png = Date.now() - t0;
  const pngOut = testInfo.outputPath('out.png');
  await pngDl.saveAs(pngOut);
  const png = fs.readFileSync(pngOut);
  expect(Array.from(png.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  expect(png.readUInt32BE(16)).toBeGreaterThan(0);
  expect(png.readUInt32BE(20)).toBeGreaterThan(0);

  // 手順 4: 記録。開いた回数・操作数・待ちの秒数を結果に残す。
  const total = log.clicks.open + log.clicks.svg + log.clicks.png;
  H.annotate(testInfo, 'opens', log.opens);
  H.annotate(testInfo, 'clicks', total);
  H.annotate(testInfo, 'waitSec', [log.waitMs.open, log.waitMs.svg, log.waitMs.png].map((ms) => (ms / 1000).toFixed(2)).join('/'));
  expect(log.opens).toBe(1);
  for (const k of ['open', 'svg', 'png']) expect(log.clicks[k], 'clicks ' + k).toBeLessThanOrEqual(2);
  expect(total).toBeLessThanOrEqual(6);
  expect(log.waitMs.open).toBeLessThanOrEqual(3000);

  // 押した対象だけが変わる: 通しで本文は 1 行も動かない。描けたまま。
  const after = await H.getEditorText(page);
  const d = H.diffLines(opened, after);
  H.annotate(testInfo, 'diffLines', d);
  expect(d).toBe(0);
  await H.expectRendered(page);
});
