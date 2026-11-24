// @ts-check
// TICKET-junior-20261123-1142-wish (roadmap v9.0 必須 1・クライテリア 1): PNG が貼って読める大きさで出る。
// 期待 (利用者の初回と同じ既定の画面・実マウス、PUA_DATA_ROOT の試験用フォルダだけ。画素数は IHDR、地は四隅の画素で測る):
//   - 保存先から開いた sequence の図 (参加者 4・メッセージ 8 本) を何も選ばずに「PNG で書き出す」「PNG（透過背景）で書き出す」
//     → 2 枚の幅・高さが SVG の width・height の 2 倍 (±1 px)。白地は四隅が白・透過は四隅の α が 0、最外周に図の線が無い
//   - Export ▾ の「PNG の大きさ」で 3 クリック以内に 4 倍・1 倍へ替えると次の書き出しはその倍率で、下端が画素数を言う。
//     別の図・開き直しの後も同じ値。2 倍の PNG は 1 倍の PNG を 2 倍に引き伸ばした絵と画素で一致しない (SVG から描き直す)
//   - 本文に `scale 2` を書いた図・保存先の一覧の「選んだ N 枚を書き出す」・保存先の無い図 (download) でも SVG の寸法 × 倍率
//   - SVG のバイト列は倍率に依らず同じ。.puml は全部バイト一致、増えたファイルは押した書き出しだけ
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const SEQ = H.fixture('png-scale-seq.puml');
const SCALED = SEQ.replace('@startuml\n', '@startuml\nscale 2\n');
const WORDS = ['SpiDrv', 'Dma_Done', 'E_OK'];
const EXPORT_MS_MAX = 1000;

async function svgSize(page) {
  return page.evaluate(() => {
    const svg = /** @type {SVGSVGElement} */ (document.querySelector('#preview-svg svg'));
    return { w: parseFloat(svg.getAttribute('width') || '0'), h: parseFloat(svg.getAttribute('height') || '0') };
  });
}
function corners(img) {
  const at = (x, y) => Array.from(img.px.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4));
  return [at(0, 0), at(img.w - 1, 0), at(0, img.h - 1), at(img.w - 1, img.h - 1)];
}
function expectScaled(img, size, scale, what) {
  expect(Math.abs(img.w - size.w * scale), what + ' の幅は SVG の ' + scale + ' 倍').toBeLessThanOrEqual(1);
  expect(Math.abs(img.h - size.h * scale), what + ' の高さは SVG の ' + scale + ' 倍').toBeLessThanOrEqual(1);
}
// Export ▾ が開いたまま、中の項目を押して書き出しの 1 行を待つ。
async function pressExport(page, itemId) {
  const st = page.locator('#status-save-result');
  const before = Number((await st.getAttribute('data-export-seq')) || 0);
  await page.locator('#' + itemId).click();
  await page.waitForFunction((n) => {
    const el = document.getElementById('status-save-result');
    return el && Number(el.getAttribute('data-export-seq') || 0) > n;
  }, before, { timeout: 20000 });
  return st.evaluate((el) => ({ path: el.getAttribute('data-export-path') || '', msg: el.getAttribute('data-full') || '' }));
}
// Export ▾ を開いて「PNG の大きさ」を替える (2 クリック)。メニューは開いたまま。
async function chooseScale(page, scale) {
  await page.locator('#btn-export').click();
  await expect(page.locator('#export-menu')).toHaveClass(/\bopen\b/);
  await page.locator('#export-png-scale .eps-opt[data-scale="' + scale + '"]').click();
  await expect(page.locator('#export-menu'), '倍率を選んでもメニューは閉じない').toHaveClass(/\bopen\b/);
  await expect(page.locator('#export-png-scale .eps-opt[aria-pressed="true"]')).toHaveAttribute('data-scale', String(scale));
  return 2;
}
async function pressedScale(page) {
  await page.locator('#btn-export').click();
  const v = await page.locator('#export-png-scale .eps-opt[aria-pressed="true"]').getAttribute('data-scale');
  await page.keyboard.press('Escape');
  return Number(v);
}

test('junior 1142 何も選ばずに PNG は SVG の 2 倍で出て、Export ▾ の 1 か所で替えた倍率がどの入口にも効き覚えられる', async ({ page }, testInfo) => {
  test.setTimeout(150 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  let downloads = 0;
  page.on('download', () => { downloads++; });
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const orig = { 'spi-seq': Buffer.from(SEQ, 'utf8'), scaled: Buffer.from(SCALED, 'utf8') };
  for (const [n, b] of Object.entries(orig)) fs.writeFileSync(path.join(dir, n + '.puml'), b);

  await H.bootWithSaveDir(page, S.dirFor(__filename));
  await S.openFolderItem(page, 'spi-seq');
  await S.closeFolderList(page);
  await H.waitDrawn(page, WORDS);
  await H.expectRendered(page);
  const text = await H.getEditorText(page);
  const size = await svgSize(page);
  expect(size.w).toBeGreaterThan(100);

  // (1) 何も選ばずに PNG・透過 PNG → SVG の 2 倍。白地は四隅が白、透過は四隅の α が 0、外周に線が無い。
  expect(await pressedScale(page), '既定の倍率').toBe(H.PNG_SCALE);
  const t0 = Date.now();
  const r2 = await S.exportToFolder(page, 'exp-png');
  const exportMs = Date.now() - t0;
  H.annotate(testInfo, 'exportMs', exportMs);
  expect(exportMs, '既定の倍率の書き出しの時間').toBeLessThanOrEqual(EXPORT_MS_MAX);
  const png2buf = fs.readFileSync(r2.path);
  const png2 = H.decodePng(png2buf);
  expectScaled(png2, size, 2, 'spi-seq.png');
  for (const c of corners(png2)) expect(c, '白地の四隅').toEqual([255, 255, 255, 255]);
  const st2 = H.inkStats(png2);
  expect(st2.ink, '線・文字がある').toBeGreaterThan(2000);
  expect(st2.edge, '最外周に図の線が無い').toBe(0);
  expect(r2.msg, '下端が画素数を言う').toContain(png2.w + '×' + png2.h + ' px (2 倍)');

  const rt = await S.exportToFolder(page, 'exp-png-transparent');
  const pngT = H.decodePng(fs.readFileSync(rt.path));
  expectScaled(pngT, size, 2, 'spi-seq.transparent.png');
  for (const c of corners(pngT)) expect(c[3], '透過の四隅の α').toBe(0);
  expect(H.inkStats(pngT).edge, '透過も最外周に線が無い').toBe(0);
  H.annotate(testInfo, 'png', 'default ' + png2.w + 'x' + png2.h + ' svg ' + size.w + 'x' + size.h);

  const svgAt2 = fs.readFileSync((await S.exportToFolder(page, 'exp-svg')).path);

  // (2) 4 倍へ替えて書き出す: Export ▾ → 4 倍 → PNG で書き出す の 3 クリック。SVG は倍率で 1 バイトも変わらない。
  let clicks = await chooseScale(page, 4);
  const r4 = await pressExport(page, 'exp-png');
  clicks += 1;
  H.annotate(testInfo, 'clicks', clicks);
  expect(clicks, '4 倍へ替えて書き出すまでの手数').toBeLessThanOrEqual(3);
  const png4 = H.decodePng(fs.readFileSync(r4.path));
  expectScaled(png4, size, 4, '4 倍の spi-seq.png');
  expect(r4.msg).toContain(png4.w + '×' + png4.h + ' px (4 倍)');
  const svgAt4 = fs.readFileSync((await S.exportToFolder(page, 'exp-svg')).path);
  expect(Buffer.compare(svgAt4, svgAt2), 'SVG のバイト列は倍率に依らず同じ').toBe(0);

  // (3) 1 倍: SVG の寸法どおり。2 倍の PNG は 1 倍を引き伸ばした絵ではない (SVG から描き直している)。
  await chooseScale(page, 1);
  const r1 = await pressExport(page, 'exp-png');
  const png1 = H.decodePng(fs.readFileSync(r1.path));
  expectScaled(png1, size, 1, '1 倍の spi-seq.png');
  expect(r1.msg).toContain(png1.w + '×' + png1.h + ' px (1 倍)');
  let differ = 0;
  const W = Math.min(png2.w, png1.w * 2), Hh = Math.min(png2.h, png1.h * 2);
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      const a = ((y >> 1) * png1.w + (x >> 1)) * 4, b = (y * png2.w + x) * 4;
      if (Math.abs(png1.px[a] - png2.px[b]) + Math.abs(png1.px[a + 1] - png2.px[b + 1]) + Math.abs(png1.px[a + 2] - png2.px[b + 2]) > 24) differ++;
    }
  }
  H.annotate(testInfo, 'redrawDiffPx', differ);
  expect(differ, '2 倍の PNG は 1 倍の PNG を引き伸ばした絵と画素で一致しない').toBeGreaterThan(500);

  // (4) 別の図 (本文に scale 2 を書いた図) でも同じ値で、PNG は SVG の寸法 × 倍率。
  await S.openFolderItem(page, 'scaled');
  await S.closeFolderList(page);
  await H.waitDrawn(page, WORDS);
  const sSize = await svgSize(page);
  expect(sSize.w, 'scale 2 の図の SVG は大きい').toBeGreaterThan(size.w * 1.5);
  expect(await pressedScale(page), '別の図でも同じ倍率').toBe(1);
  const s1 = H.decodePng(fs.readFileSync((await S.exportToFolder(page, 'exp-png')).path));
  expectScaled(s1, sSize, 1, 'scaled.png (1 倍)');
  await chooseScale(page, 4);
  await page.keyboard.press('Escape');

  // (5) 開き直しても同じ値 (道具に覚える)。
  await S.reopenApp(page);
  await S.openFolderItem(page, 'spi-seq');
  await S.closeFolderList(page);
  await H.waitDrawn(page, WORDS);
  expect(await pressedScale(page), '開き直しの後も同じ倍率').toBe(4);
  const again = H.decodePng(fs.readFileSync((await S.exportToFolder(page, 'exp-png')).path));
  expectScaled(again, size, 4, '開き直した後の spi-seq.png');

  // (6) 保存先の一覧の「選んだ N 枚を書き出す」も同じ倍率。
  await S.openFolder(page);
  for (const n of ['spi-seq', 'scaled']) await page.locator('#folder-panel .folder-pick[data-pick-name="' + n + '"]').click();
  await page.locator('#folder-export-kind').selectOption('png');
  const seq0 = Number((await page.locator('#folder-export-result').getAttribute('data-seq')) || 0);
  await page.locator('#folder-export-many').click();
  await page.waitForFunction((n) => {
    const el = document.getElementById('folder-export-result');
    return el && Number(el.getAttribute('data-seq') || 0) > n;
  }, seq0, { timeout: 60000 });
  await expect(page.locator('#folder-export-result')).toContainText('書き出しました: 2 枚 (PNG)');
  expectScaled(H.decodePng(fs.readFileSync(path.join(dir, 'spi-seq.png'))), size, 4, 'まとめての spi-seq.png');
  expectScaled(H.decodePng(fs.readFileSync(path.join(dir, 'scaled.png'))), sSize, 4, 'まとめての scaled.png');
  await page.screenshot({ path: testInfo.outputPath('batch.png') });

  // 本文・.puml は動かず、増えたのは押した書き出しだけ。ダウンロード・alert は 0。
  await S.closeFolderList(page);
  expect(await H.getEditorText(page)).toBe(text);
  await page.waitForTimeout(1200);
  for (const [n, b] of Object.entries(orig)) {
    expect(Buffer.compare(fs.readFileSync(path.join(dir, n + '.puml')), b), n + '.puml は 1 バイトも変わらない').toBe(0);
  }
  expect(fs.readdirSync(dir).sort()).toEqual(['scaled.png', 'scaled.puml', 'spi-seq.png', 'spi-seq.puml', 'spi-seq.svg', 'spi-seq.transparent.png']);
  expect(downloads).toBe(0);
  expect(dialogs).toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('junior 1142 保存先の無い図 (download) も PNG は SVG の寸法 × 倍率で、下端が画素数を言う', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  await H.bootWith(page, SEQ);
  await H.waitDrawn(page, WORDS);
  const size = await svgSize(page);
  const before = await H.getEditorText(page);

  const dl2 = await S.exportVia(page, 'exp-png');
  expect(dl2).not.toBeNull();
  const out2 = testInfo.outputPath('dl-2.png');
  await dl2.saveAs(out2);
  const p2 = H.decodePng(fs.readFileSync(out2));
  expectScaled(p2, size, 2, 'ダウンロードの PNG');
  await expect(page.locator('#status-save-result')).toHaveAttribute('data-full', new RegExp(p2.w + '×' + p2.h + ' px \\(2 倍\\)'));

  await chooseScale(page, 4);
  await page.screenshot({ path: testInfo.outputPath('export-menu-scale.png') });
  const dlP = page.waitForEvent('download', { timeout: 20000 });
  await page.locator('#exp-png').click();
  const dl4 = await dlP;
  const out4 = testInfo.outputPath('dl-4.png');
  await dl4.saveAs(out4);
  const p4 = H.decodePng(fs.readFileSync(out4));
  expectScaled(p4, size, 4, '4 倍のダウンロードの PNG');
  for (const c of corners(p4)) expect(c).toEqual([255, 255, 255, 255]);
  expect(await H.getEditorText(page)).toBe(before);
  expect(dialogs).toEqual([]);
});
