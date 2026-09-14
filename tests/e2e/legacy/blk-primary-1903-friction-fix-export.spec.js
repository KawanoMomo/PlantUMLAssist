// @ts-check
// BLK-primary-20260908-1903-friction 指摘の付いた図だけを 1 押しで再エクスポート —
// 指摘.md で名指しされた 2 枚を出すのに、図を 1 枚ずつ開いて Export ▾ → SVG を
// 繰り返していた (2 枚で 6 クリック)。絞り込みの画面はあるが Export メニューからは
// 「全図」しか見えないので、指摘対応の場面で見つからない。メニューに該当枚数を出し、
// そこから 1 押しで [要修正] の図だけが zip に入ることを確かめる。
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

function dsl(n) {
  return '@startuml\nparticipant ' + n + 'Drv\nparticipant ' + n + 'Hw\n' + n + 'Drv -> ' + n + 'Hw: init\n@enduml';
}

// zip は無圧縮 (store)。中身の名前だけ拾えればよい。
function readZipNames(buf) {
  const u16 = (o) => buf.readUInt16LE(o);
  const u32 = (o) => buf.readUInt32LE(o);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (u32(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('EOCD not found');
  const count = u16(eocd + 10);
  const names = [];
  let p = u32(eocd + 16);
  for (let n = 0; n < count; n++) {
    const nameLen = u16(p + 28);
    names.push(buf.slice(p + 46, p + 46 + nameLen).toString('utf8'));
    p += 46 + nameLen + u16(p + 30) + u16(p + 32);
  }
  return names.sort();
}

// 4 枚のうち dma_state と dma_transfer_sequence の 2 枚だけが指摘つき
// (primary の 指摘.md 依頼2 と同じ形)。
async function seed(page) {
  await gotoApp(page);
  await page.evaluate((mk) => {
    try { window.localStorage.clear(); } catch (e) {}
    const ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), 'dma_state');
    ws.updateActive({ dsl: mk.a, diagramType: 'plantuml-sequence' });
    ws.open({ name: 'dma_transfer_sequence', diagramType: 'plantuml-sequence', dsl: mk.b });
    ws.open({ name: 'gpio_init', diagramType: 'plantuml-sequence', dsl: mk.c });
    ws.open({ name: 'can_init', diagramType: 'plantuml-sequence', dsl: mk.d });
    window.MA.saveDiff.markAll(ws.list());
    window.MA.reviewVerdicts.set('dma_state', 'add|note over dmaDrv: fix', '要修正');
    window.MA.reviewVerdicts.set('dma_transfer_sequence', 'add|note over dmaDrv: fix', '要修正');
    ws.setActive(ws.list()[0].id);
  }, { a: dsl('dma'), b: dsl('dmaX'), c: dsl('gpio'), d: dsl('can') });
  await page.reload();
  await page.waitForSelector('#preview-svg svg', { timeout: 20000 });
}

test('Export メニューに、指摘の付いた枚数が名前として出る', async ({ page }) => {
  await seed(page);
  await page.locator('#btn-export').click();
  await expect(page.locator('#exp-svg-fix')).toHaveText('要修正のみ 2 枚をSVGで保存（zip）');
  await expect(page.locator('#exp-svg-fix')).toBeEnabled();
});

test('指摘が 1 件も無ければ押せず、全部詰めるほうへ落ちない', async ({ page }) => {
  await gotoApp(page);
  await page.evaluate((d) => {
    try { window.localStorage.clear(); } catch (e) {}
    const ws = window.MA.workspace;
    ws.updateActive({ dsl: d, diagramType: 'plantuml-sequence' });
  }, dsl('gpio'));
  await page.reload();
  await page.waitForSelector('#preview-svg svg', { timeout: 20000 });
  await page.locator('#btn-export').click();
  await expect(page.locator('#exp-svg-fix')).toHaveText('要修正のみはありません');
  await expect(page.locator('#exp-svg-fix')).toBeDisabled();
});

test('2 クリック（Export ▾ + 1 押し）で指摘の付いた 2 枚だけが zip に入る', async ({ page }) => {
  await seed(page);

  let clicks = 0;
  const click = async (sel) => { clicks++; await page.locator(sel).click(); };

  const waitDownload = page.waitForEvent('download', { timeout: 120000 });
  await click('#btn-export');
  await click('#exp-svg-fix');
  const download = await waitDownload;

  // 指摘.md で名指しされた 2 枚だけ。指摘の無い gpio_init / can_init は入らない。
  const names = readZipNames(fs.readFileSync(await download.path()))
    .filter((n) => n.endsWith('.svg'));
  expect(names).toEqual(['dma_state.svg', 'dma_transfer_sequence.svg']);

  // 起票時は 2 枚で 6 クリック。図が増えても 2 クリックのまま。
  expect(clicks).toBe(2);
});

test('印を増やすと次にメニューを開いたときの枚数も増える', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    window.MA.reviewVerdicts.set('gpio_init', 'add|note over gpioDrv: fix', '要修正');
  });
  await page.locator('#btn-export').click();
  await expect(page.locator('#exp-svg-fix')).toHaveText('要修正のみ 3 枚をSVGで保存（zip）');
});
