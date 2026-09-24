// @ts-check
// BLK-primary-20260907-0443: 11 枚を設計書添付用に SVG で書き出す。
// これまでは タブ切替 → Export を開く → SVG を選ぶ の 3 クリックが枚数ぶん必要で、
// 13 枚で clicks=39 まで伸びていた。Export の「全図をSVGで保存（zip）」で、枚数に
// 関係なく 2 クリックで全部落ちてくることを確認する。
//
// 1 ファイル = 1 ダウンロードにしないのは、ブラウザが 1 操作から連続して発生する
// 自動ダウンロードを 2 件目以降黙って捨てるため。zip 1 個にまとめている。
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

async function freshWorkspace(page) {
  // addInitScript は reload のたびに走る。seedDocs が reload をまたぐので、
  // 掃除は初回ロードのときだけにする (でないと積んだタブごと消える)。
  await page.addInitScript(() => {
    try {
      if (!window.sessionStorage.getItem('__bulk_export_spec_init')) {
        window.sessionStorage.setItem('__bulk_export_spec_init', '1');
        window.localStorage.clear();
      }
    } catch (e) {}
  });
}

// タブを 1 枚ずつ GUI で作らずに workspace へ直接積む。本 BLK が測るのは
// 「書き出し」の手数なので、準備の手数は数えない。
async function seedDocs(page, names) {
  await page.evaluate((ns) => {
    function dsl(n) {
      return '@startuml\nparticipant ' + n + 'Drv\nparticipant ' + n + 'Hw\n'
        + n + 'Drv -> ' + n + 'Hw: init\n@enduml';
    }
    ns.forEach(function(n, i) {
      if (i === 0) {
        window.MA.workspace.rename(window.MA.workspace.getActiveId(), n);
        window.MA.workspace.updateActive({ dsl: dsl(n), diagramType: 'plantuml-sequence' });
      } else {
        window.MA.workspace.open({ name: n, diagramType: 'plantuml-sequence', dsl: dsl(n) });
      }
    });
    window.MA.workspace.setActive(window.MA.workspace.list()[0].id);
  }, names);
  await page.reload();
  await page.waitForSelector('#preview-svg svg', { timeout: 20000 });
}

// zip は無圧縮 (store) なので、ヘッダを辿って中身をそのまま取り出せる。
function readZip(buf) {
  const u16 = (o) => buf.readUInt16LE(o);
  const u32 = (o) => buf.readUInt32LE(o);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (u32(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('EOCD not found');
  const count = u16(eocd + 10);
  const entries = {};
  let p = u32(eocd + 16);
  for (let n = 0; n < count; n++) {
    const nameLen = u16(p + 28);
    const local = u32(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
    const size = u32(local + 18);
    const dataAt = local + 30 + u16(local + 26) + u16(local + 28);
    entries[name] = buf.slice(dataAt, dataAt + size).toString('utf8');
    p += 46 + nameLen + u16(p + 30) + u16(p + 32);
  }
  return { count, entries };
}

// Export を開く + 📦 資料セット + 開いている図すべて の 3 クリック。タブ切替は 1 回もしない。
// BLK-owner-20260923-2332-prune: Export ▾ の独立項目「全図をSVGで保存（zip）」は
// 📦 資料セットの「対象の選び方」→「開いている図すべて」に移った。
async function exportAllAndRead(page, timeoutMs) {
  const waitDownload = page.waitForEvent('download', { timeout: timeoutMs });
  await page.locator('#btn-export').click();
  await page.locator('#exp-docset').click();
  await page.locator('#dsc-open').click();
  const download = await waitDownload;
  const path = await download.path();
  return { filename: download.suggestedFilename(), zip: readZip(fs.readFileSync(path)) };
}

test.describe('BLK-primary-0443 全図の一括 SVG 書き出し', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('📦 資料セットの対象に「開いている図すべて」がある', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#btn-export').click();
    await page.locator('#exp-docset').click();
    await expect(page.locator('#dsc-open')).toBeVisible();
  });

  test('11 枚を 2 クリック（Export を開く + 全図をSVGで保存）で書き出せる', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await gotoApp(page);
    const names = [];
    for (let i = 1; i <= 11; i++) names.push('Fig' + i);
    await seedDocs(page, names);

    const { filename, zip } = await exportAllAndRead(page, 150 * 1000);
    expect(filename).toContain('.zip');
    expect(zip.count).toBe(11);
    expect(Object.keys(zip.entries).sort()).toEqual(names.map((n) => n + '.svg').sort());
  });

  test('書き出したファイルの中身が各タブの図になっている', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await gotoApp(page);
    await seedDocs(page, ['SpiInit', 'CanInit']);

    const { zip } = await exportAllAndRead(page, 90 * 1000);
    expect(Object.keys(zip.entries).sort()).toEqual(['CanInit.svg', 'SpiInit.svg']);
    expect(zip.entries['SpiInit.svg']).toContain('<svg');
    expect(zip.entries['SpiInit.svg']).toContain('SpiInitDrv');
    expect(zip.entries['CanInit.svg']).toContain('CanInitDrv');
    expect(zip.entries['CanInit.svg']).not.toContain('SpiInitDrv');
  });

  test('編集中の内容がそのまま書き出される（保存前の内容にならない）', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await gotoApp(page);
    await seedDocs(page, ['Edited']);

    await page.evaluate(() => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      ed.value = '@startuml\nparticipant FreshName\nFreshName -> FreshName: tick\n@enduml';
      ed.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(1000);

    const { zip } = await exportAllAndRead(page, 60 * 1000);
    expect(zip.entries['Edited.svg']).toContain('FreshName');
  });

  test('結果を件数で知らせる', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await gotoApp(page);
    await seedDocs(page, ['A1', 'B1', 'C1']);
    await exportAllAndRead(page, 90 * 1000);
    await expect(page.locator('#bulk-export-status')).toContainText('3 枚');
  });
});
