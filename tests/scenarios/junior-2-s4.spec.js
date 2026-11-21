// @ts-check
// junior 台本 場面 4「初期化の図を SVG に書き出して設計書に貼る」手順 2:
//   状態遷移図を開き、書き出しの経路で SVG を選んで受ける。受けたファイルが空でないことを確かめる。
//   書き出しの入口は上部バーの Export ▾ (ツール ▾ には書き出しを置かない。tool-menu.js の GROUPS)。
// 期待 (principles.md「押した対象だけが変わる」「描ける」):
//   - 書き出しで本文は 1 行も動かない
//   - 受けた .svg は空でなく <svg を含み、状態名と遷移のラベルの文字を持つ
//   - 手数は Export ▾ → SVGとして保存 の 2 クリック (台本の操作数の 2 倍まで)
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

const WORDS = ['Idle', 'Running', 'RunningSlow', 'Spi_Start', 'Spi_Stop'];

test('junior 手順2 状態遷移図を Export ▾ から SVG で書き出し、空でないファイルを受ける', async ({ page }, testInfo) => {
  const src = H.fixture('state-1.puml');
  await H.bootWith(page, src);
  await H.waitDrawn(page, WORDS);
  await H.expectRendered(page);
  const before = await H.getEditorText(page);

  let clicks = 0;
  const t0 = Date.now();
  const dlP = page.waitForEvent('download');
  await page.locator('#btn-export').click(); clicks++;
  await expect(page.locator('#exp-svg')).toBeVisible();
  await page.locator('#exp-svg').click(); clicks++;
  const dl = await dlP;
  H.annotate(testInfo, 'renderMs', Date.now() - t0);

  expect(dl.suggestedFilename()).toMatch(/\.svg$/i);
  const out = testInfo.outputPath(dl.suggestedFilename());
  await dl.saveAs(out);
  const body = fs.readFileSync(out, 'utf8');
  // 受けたファイルが空でない。描かれた図の SVG である。
  expect(body.length).toBeGreaterThan(200);
  expect(body).toContain('<svg');
  expect(body).toContain('</svg>');
  // 描ける: 状態名と遷移のラベルが SVG の文字として入っている (画像に化けていない)。
  for (const w of WORDS) expect(body, 'svg text ' + w).toContain(w);

  // 押した対象だけが変わる: 書き出しは本文を変えない。
  const after = await H.getEditorText(page);
  const d = H.diffLines(before, after);
  H.annotate(testInfo, 'diffLines', d);
  expect(d).toBe(0);
  expect(after).toBe(before);
  expect(clicks).toBeLessThanOrEqual(2);
  await H.expectRendered(page);
});
