// @ts-check
// junior 台本 場面 4「場面 3 の状態遷移図を SVG と PNG に書き出して設計書に貼る」手順 1:
//   Import ▾ →「.puml を開く」で状態遷移図の .puml を開き、Export ▾ から SVG で書き出す。
//   台本では場面 3 の out.puml を開くが、scenario は persona-data を読まず fixture の state-1.puml を使う
//   (コメント・字下げ・状態の説明を持つ手書きの状態遷移図)。
// 期待 (principles.md「押した対象だけが変わる」「描ける」):
//   - 開いただけで本文は fixture と 1 字も変わらない (コメント・字下げも残る)
//   - 書き出しただけで本文は 1 行も動かない
//   - 開いた図が状態遷移図として描け、受けた .svg は空でなく状態名と遷移のラベルの文字を持つ
//   - 手数は Import ▾ → .puml を開く と Export ▾ → SVGとして保存 の 4 クリック以内 (利用者の手数。
//     以前は隠れた file input へ直接渡して 3 と数えていた。TICKET-owner-20261116-0340-1)
//   - 開いてから描画までは 1 秒以内 (全体実行の負荷の下は 3 秒。上限で揺れを吸収する)
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

const FILE = 'state-1.puml';
const WORDS = ['Idle', 'Running', 'RunningSlow', 'Spi_Start', 'Spi_Stop', 'Spi_Throttle'];

test('junior 手順1 (場面4) .puml を Import ▾ から開き、Export ▾ から SVG で書き出す', async ({ page }, testInfo) => {
  const src = H.fixture(FILE).replace(/\r\n/g, '\n');
  await H.bootWith(page, null);

  let clicks = 0;
  // Import ▾ →「.puml を開く」。利用者と同じく項目を押し、開いたファイル選択の窓で選ぶ
  // (項目を押すとメニューは閉じるので Escape は押さない)。
  await page.locator('#btn-import').click(); clicks++;
  await expect(page.locator('#imp-file')).toBeVisible();
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#imp-file').click()]);
  clicks++;
  const t0 = Date.now();
  await fc.setFiles(path.join(H.FIXTURES, FILE));
  await expect.poll(() => H.getEditorText(page)).toContain('Spi_Throttle');
  await expect(page.locator('#imp-file')).toBeHidden();
  await H.waitDrawn(page, WORDS);
  const renderMs = Date.now() - t0;
  H.annotate(testInfo, 'renderMs', renderMs);
  expect(renderMs).toBeLessThanOrEqual(3000);
  await H.expectRendered(page);

  // 押した対象だけが変わる: 開いただけで本文は fixture と同じ (コメント・字下げも)。
  const opened = await H.getEditorText(page);
  expect(opened.replace(/\r\n/g, '\n')).toBe(src);
  expect(opened).toContain("'");
  expect(opened).toMatch(/^ {2}Running --> Idle : Spi_Stop$/m);

  // Export ▾ → SVGとして保存。
  const dlP = page.waitForEvent('download');
  await page.locator('#btn-export').click(); clicks++;
  await expect(page.locator('#exp-svg')).toBeVisible();
  await page.locator('#exp-svg').click(); clicks++;
  const dl = await dlP;
  expect(dl.suggestedFilename()).toMatch(/\.svg$/i);
  const out = testInfo.outputPath(dl.suggestedFilename());
  await dl.saveAs(out);
  const body = fs.readFileSync(out, 'utf8');
  // 受けたファイルが空でない。描かれた状態遷移図の SVG である。
  expect(body.length).toBeGreaterThan(200);
  expect(body).toContain('<svg');
  expect(body).toContain('</svg>');
  for (const w of WORDS) expect(body, 'svg text ' + w).toContain(w);

  // 押した対象だけが変わる: 書き出しは本文を変えない。
  const after = await H.getEditorText(page);
  const d = H.diffLines(opened, after);
  H.annotate(testInfo, 'diffLines', d);
  expect(d).toBe(0);
  expect(after).toBe(opened);
  H.annotate(testInfo, 'clicks', clicks);
  expect(clicks).toBeLessThanOrEqual(4);
  await H.expectRendered(page);
});
