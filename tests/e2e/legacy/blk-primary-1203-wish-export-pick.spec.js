// @ts-check
// BLK-primary-20260908-1203-wish 提出用 zip の図選び — 「全図をSVGで保存（zip）」は
// 開いている図を無条件に全部詰めるだけで、▤ ボードの [要修正] 印も「前回提出後に
// 変わったか」も使われない。zip を作る画面に同じ絞り込みを付け、見比べた結果を
// 頭に置き直さずにその場で提出セットを確定できることを確かめる。
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

// Kept / Changed / Fixed の 3 枚。Kept は基準どおり、Changed は基準の後で書き換え、
// Fixed は基準どおりだが [要修正] の印を 1 件持つ。
async function seedThree(page) {
  await gotoApp(page);
  await page.evaluate((mk) => {
    try { window.localStorage.clear(); } catch (e) {}
    const ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), 'Kept');
    ws.updateActive({ dsl: mk.Kept, diagramType: 'plantuml-sequence' });
    ws.open({ name: 'Changed', diagramType: 'plantuml-sequence', dsl: mk.Changed });
    ws.open({ name: 'Fixed', diagramType: 'plantuml-sequence', dsl: mk.Fixed });
    // 3 枚とも「前回提出時の基準」を取る
    window.MA.saveDiff.markAll(ws.list());
    // Changed だけ基準の後で中身が変わった
    const ch = ws.list().filter((d) => d.name === 'Changed')[0];
    ws.updateDoc(ch.id, { dsl: mk.Changed + '\nnote over ChangedDrv: after\n' });
    // Fixed に [要修正] の印を 1 件
    window.MA.reviewVerdicts.set('Fixed', 'add|note over FixedDrv: check', '要修正');
    ws.setActive(ws.list()[0].id);
  }, { Kept: dsl('Kept'), Changed: dsl('Changed'), Fixed: dsl('Fixed') });
  await page.reload();
  await page.waitForSelector('#preview-svg svg', { timeout: 20000 });
}

async function openPicker(page) {
  await page.locator('#btn-export').click();
  await page.locator('#exp-svg-pick').click();
  await expect(page.locator('#expick-modal')).toBeVisible();
}

async function savedNames(page, timeoutMs) {
  const waitDownload = page.waitForEvent('download', { timeout: timeoutMs });
  await page.locator('#expick-save').click();
  const download = await waitDownload;
  return readZipNames(fs.readFileSync(await download.path()));
}

test.describe('BLK-primary-1203-wish 提出用 zip の図選び', () => {
  test('Export から図選びの画面を開ける', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#btn-export').click();
    await expect(page.locator('#exp-svg-pick')).toBeVisible();
  });

  test('開いている図が印付きで並び、既定は全部選択', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await seedThree(page);
    await openPicker(page);
    await expect(page.locator('#expick-body label.expick-row')).toHaveCount(3);
    await expect(page.locator('#expick-count')).toHaveText('全部：3 / 3 枚を zip に詰めます');
    await expect(page.locator('#expick-body')).toContainText('変更あり');
    await expect(page.locator('#expick-body')).toContainText('要修正 1');
  });

  test('[変更図のみ] は基準から変わった図だけを残す', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await seedThree(page);
    await openPicker(page);
    await page.locator('#expick-mode-changed').click();
    await expect(page.locator('#expick-count')).toHaveText('変更図のみ：1 / 3 枚を zip に詰めます');
    await expect(page.locator('#expick-body input.expick-check:checked')).toHaveCount(1);
  });

  test('[要修正のみ] で絞った図だけが zip に入る', async ({ page }) => {
    test.setTimeout(150 * 1000);
    await seedThree(page);
    await openPicker(page);
    await page.locator('#expick-mode-fix').click();
    await expect(page.locator('#expick-count')).toHaveText('要修正のみ：1 / 3 枚を zip に詰めます');
    expect(await savedNames(page, 120 * 1000)).toEqual(['Fixed.svg']);
  });

  test('絞り込んだ後に 1 枚だけ足せる', async ({ page }) => {
    test.setTimeout(150 * 1000);
    await seedThree(page);
    await openPicker(page);
    await page.locator('#expick-mode-fix').click();
    await page.locator('#expick-body label.expick-row', { hasText: 'Changed' }).locator('input').check();
    await expect(page.locator('#expick-count')).toHaveText('要修正のみ：2 / 3 枚を zip に詰めます');
    expect(await savedNames(page, 120 * 1000)).toEqual(['Changed.svg', 'Fixed.svg']);
  });

  test('該当が 0 枚なら保存できないことが分かる', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await gotoApp(page);
    await page.evaluate(() => {
      try { window.localStorage.clear(); } catch (e) {}
      const ws = window.MA.workspace;
      ws.rename(ws.getActiveId(), 'OnlyOne');
      ws.updateActive({ dsl: '@startuml\nA -> B: x\n@enduml', diagramType: 'plantuml-sequence' });
      window.MA.saveDiff.markAll(ws.list());
    });
    await page.reload();
    await page.waitForSelector('#preview-svg svg', { timeout: 20000 });
    await openPicker(page);
    await page.locator('#expick-mode-fix').click();
    await expect(page.locator('#expick-count')).toHaveText('要修正のみ：該当なし（0 / 1 枚）');
    await expect(page.locator('#expick-save')).toBeDisabled();
  });

  test('「全図をSVGで保存」はこれまでどおり全部詰める', async ({ page }) => {
    test.setTimeout(150 * 1000);
    await seedThree(page);
    const waitDownload = page.waitForEvent('download', { timeout: 120 * 1000 });
    await page.locator('#btn-export').click();
    await page.locator('#exp-svg-all').click();
    const download = await waitDownload;
    expect(readZipNames(fs.readFileSync(await download.path())))
      .toEqual(['Changed.svg', 'Fixed.svg', 'Kept.svg']);
  });
});
