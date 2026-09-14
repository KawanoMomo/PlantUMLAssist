// @ts-check
// primary 台本 手順9: 全図を、設計書に貼るために SVG で一括出力する(全図をSVGで保存 zip)。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順9 開いている全図を SVG の zip で 1 度に書き出せる', async ({ page }) => {
  test.setTimeout(90 * 1000);
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of ['spi_init_sequence', 'spi_state', 'can_state']) {
    await S.putDoc(page, DIR, n, S.docFor(n));
    await S.openFolderItem(page, n);
  }

  const download = await (await S.exportVia(page, 'exp-svg-all', 60000));
  // 到達条件: zip が 1 本書き出される。
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
});

// BLK-primary-20260909-0003-wish: 2 度目以降の書き出しで「前回書き出しから
// 変わった図だけ」に絞れる。控えは保存フォルダに置くので、開き直しても残る。
test('手順9 2 度目は前回書き出しからの差分が出て、変わった図だけに絞れる', async ({ page }) => {
  test.setTimeout(120 * 1000);
  const NAMES = ['spi_init_sequence', 'spi_state', 'can_state'];
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of NAMES) {
    await S.putDoc(page, DIR, n, S.docFor(n));
    await S.openFolderItem(page, n);
  }

  // 1 度目。ここが次回の基準になる。
  expect(await S.exportVia(page, 'exp-svg-all', 60000)).not.toBeNull();
  await page.waitForFunction(async (d) => {
    const r = await fetch('/autosave?dir=' + encodeURIComponent(d));
    const j = r.ok ? await r.json() : null;
    return !!(j && j.exportLog);
  }, DIR, { timeout: 20000 });

  // 3 枚のうち 1 枚だけをフォルダ側で書き換え、開き直す。
  // 控えは localStorage ではなく保存フォルダにあるので開き直しても残る。
  await S.putDoc(page, DIR, 'spi_state', S.docFor('spi_state') + "\n' 追記\n");
  await S.bootWithSaveDir(page, DIR);
  for (const n of NAMES) await S.openFolderItem(page, n);

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-svg-pick').click();
  await expect(page.locator('#expick-modal')).toBeVisible();
  // 「初回」ではなく前回書き出しの時点が基準として出る。
  await expect(page.locator('#expick-since')).toContainText('前回SVG 一括出力');
  await expect(page.locator('#expick-since')).not.toContainText('初回');
  await page.locator('#expick-mode-since').click();
  await expect(page.locator('#expick-count')).toContainText('前回書き出しから変わった図のみ');
  // 3 枚のうち直した 1 枚だけが残る (最初から開いている白紙の図は前回書き出しに
  // 含まれているので、ここでは数に入らない)。
  await expect(page.locator('#expick-count')).toContainText(/：1 \/ \d+ 枚/);
});

// BLK-primary-20260914-1806-wish: 「新人に引き継ぐ」ために全図を SVG にしたら、zip の中身は
// その回に開いた 2 枚だけだった (書き出しの対象が開いているタブなので)。渡す資料を作るには
// 14 枚を毎回 1 枚ずつ開き直すしかなく、手順1 で数えた 14 枚を開き直す作業そのものが手順だった。
// 📂一覧で印を付けた図を、1 枚も開かずに zip へ入れられることを到達条件にする。
test('手順9 保存フォルダの図を、1 枚も開き直さずに選んで zip にできる', async ({ page }) => {
  test.setTimeout(120 * 1000);
  const NAMES = ['spi_init_sequence', 'spi_state', 'can_state', 'can_init_sequence'];
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // 保存フォルダには 4 枚ある。タブは開いたままの白紙 1 枚だけ (= 開き直していない)。
  for (const n of NAMES) await S.putDoc(page, DIR, n, S.docFor(n));
  await S.bootWithSaveDir(page, DIR);

  // 保存フォルダにあるのは 4 枚 + 開いたままの白紙 (自動保存で 1 枚増える)。
  const saved = await S.listDir(page, DIR);
  for (const n of NAMES) expect(saved).toContain(n);

  await S.openFolder(page);
  await page.locator('#folder-panel .folder-pick-all').click();
  const btn = page.locator('#folder-panel .folder-export-svg');
  // 到達条件 1: 印を付けた枚数が、開いているタブの数ではなく保存フォルダの枚数で出る。
  await expect(btn).toBeEnabled();
  await expect(btn).toContainText(saved.length + ' 枚');

  const dl = page.waitForEvent('download', { timeout: 90000 }).catch(() => null);
  await btn.click();
  const download = await dl;
  // 到達条件 2: 1 枚も開かずに zip が出る。
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.zip$/);

  // 到達条件 3: zip の中身は保存フォルダの図 (開いたタブの枚数ではない)。
  const fs = require('fs');
  const zip = fs.readFileSync(await download.path());
  const entries = [];
  const re = /\x50\x4b\x03\x04/g;
  let m;
  while ((m = re.exec(zip.toString('latin1'))) !== null) {
    const at = m.index;
    const len = zip.readUInt16LE(at + 26);
    entries.push(zip.toString('utf-8', at + 30, at + 30 + len));
  }
  for (const n of NAMES) expect(entries).toContain(n + '.svg');
  expect(entries.filter((e) => e.endsWith('.svg')).length).toBe(saved.length);
});
