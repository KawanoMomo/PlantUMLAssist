// @ts-check
// junior 台本 場面 4「初期化の図を SVG に書き出して設計書に貼る」手順 3:
//   同じ状態遷移図を PNG でも書き出し、描けている文字が読めるかを確かめる。
//   書き出しの入口は上部バーの Export ▾ → PNGとして保存 (ツール ▾ には書き出しを置かない)。
// 期待 (principles.md「押した対象だけが変わる」「描ける」):
//   - 書き出しで本文は 1 行も動かない
//   - 受けた .png は PNG の署名を持ち、幅・高さが描いた図 (SVG) と同じ寸法 (縮めて字を潰さない)
//   - 画像は空同然でない: 白地の上に図の線と文字の画素がある (書き出しが知らせ無しに空にならない)
//   - 書き出しの失敗の知らせ (alert) が出ない。手数は Export ▾ → PNGとして保存 の 2 クリック
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

const WORDS = ['Idle', 'Running', 'RunningSlow', 'Spi_Start', 'Spi_Stop'];

test('junior 手順3 同じ状態遷移図を Export ▾ から PNG で書き出し、図の寸法で中身のある画像を受ける', async ({ page }, testInfo) => {
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  await H.bootWith(page, H.fixture('state-1.puml'));
  await H.waitDrawn(page, WORDS);
  await H.expectRendered(page);
  const before = await H.getEditorText(page);
  const svgSize = await page.evaluate(() => {
    const svg = /** @type {SVGSVGElement} */ (document.querySelector('#preview-svg svg'));
    return { w: Math.round(parseFloat(svg.getAttribute('width') || '0')), h: Math.round(parseFloat(svg.getAttribute('height') || '0')) };
  });
  expect(svgSize.w).toBeGreaterThan(50);
  expect(svgSize.h).toBeGreaterThan(50);

  let clicks = 0;
  const t0 = Date.now();
  const dlP = page.waitForEvent('download');
  await page.locator('#btn-export').click(); clicks++;
  await expect(page.locator('#exp-png')).toBeVisible();
  await page.locator('#exp-png').click(); clicks++;
  const dl = await dlP;
  H.annotate(testInfo, 'renderMs', Date.now() - t0);

  expect(dl.suggestedFilename()).toMatch(/\.png$/i);
  const out = testInfo.outputPath(dl.suggestedFilename());
  await dl.saveAs(out);
  const buf = fs.readFileSync(out);
  // PNG の署名と IHDR の幅・高さ。
  expect(buf.length).toBeGreaterThan(1000);
  expect(Array.from(buf.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  expect(w).toBeGreaterThan(0);
  expect(h).toBeGreaterThan(0);
  // 縮めて字を潰さない: 描いた図と同じ寸法で書き出す。
  expect(Math.abs(w - svgSize.w)).toBeLessThanOrEqual(1);
  expect(Math.abs(h - svgSize.h)).toBeLessThanOrEqual(1);

  // 描ける: 受けた画像をページで読み直し、白地以外の画素 (線・文字) を数える。
  const ink = await page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let dark = 0, total = c.width * c.height;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0 && (d[i] + d[i + 1] + d[i + 2]) < 384) dark++;
    }
    return { dark, total };
  }, buf.toString('base64'));
  // 図の線と文字の分だけ濃い画素がある (真っ白でも真っ黒でもない)。
  expect(ink.dark).toBeGreaterThan(500);
  expect(ink.dark / ink.total).toBeLessThan(0.5);

  // 押した対象だけが変わる: 書き出しは本文を変えない。
  const after = await H.getEditorText(page);
  const d = H.diffLines(before, after);
  H.annotate(testInfo, 'diffLines', d);
  expect(d).toBe(0);
  expect(after).toBe(before);
  expect(dialogs).toEqual([]);
  expect(clicks).toBeLessThanOrEqual(2);
  await H.expectRendered(page);
});
