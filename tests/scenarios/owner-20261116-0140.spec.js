// @ts-check
// TICKET-owner-20261116-0140-prune: 資料化の道具 (資料セット・資料の体裁・資料として見る・資料化・zip の一括書き出し) と
// Export ▾ の「渡す」見出しを外した後も、
// (1) Export ▾ は SVG / PNG / 透過 PNG / クリップボードの 4 項目で、押すと今の図の名前で書き出される。
// (2) Ctrl+K で「資料」と打っても資料セット・体裁・資料として見る・資料化の行が出ない。
// (3) 保存先に資料セットの控え (`_sets/sets.json`) と `(資料用).puml` が残っていても、エラー 0 で開けて描け、控えは消さない。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const S = require('../e2e/scenarios/_scenario');

const SEQ = ['@startuml', 'participant SpiDrv', 'participant Reg', 'SpiDrv -> Reg : write(CR1)', '@enduml', ''].join('\n');

test('owner 0140 Export ▾ は 1 枚の図の 4 項目で、資料化の控えが残った保存先でも開いて描ける', async ({ page, context }) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, '_sets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'spi_seq.puml'), SEQ, 'utf8');
  const material = path.join(dir, 'spi_seq(資料用).puml');
  fs.writeFileSync(material, SEQ, 'utf8');
  const sets = path.join(dir, '_sets', 'sets.json');
  const setsText = JSON.stringify({ sets: [{ name: '設計書', docs: ['spi_seq'], items: [] }] });
  fs.writeFileSync(sets, setsText, 'utf8');

  await S.bootWithSaveDir(page, S.dirFor(__filename));
  await S.openFolderItem(page, 'spi_seq');
  await S.closeFolderList(page);
  await expect(page.locator('#preview-svg svg')).toHaveCount(1, { timeout: 20000 });

  // (1) Export ▾ の項目は 4 つだけ。
  await page.locator('#btn-export').click();
  const items = page.locator('#export-menu > button');
  await expect(items).toHaveCount(4);
  await expect(items).toHaveText([/SVG/, /^PNGとして保存/, /透過/, /クリップボード/]);
  await expect(page.locator('#export-menu .exp-group-title')).toHaveCount(0);
  await page.keyboard.press('Escape');
  for (const [id, ext] of [['exp-svg', '.svg'], ['exp-png', '.png'], ['exp-png-transparent', '.png']]) {
    const dl = await S.exportVia(page, id);
    expect(dl, id).not.toBeNull();
    expect(dl.suggestedFilename(), id).toBe('spi_seq' + ext);
  }
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await page.locator('#btn-export').click();
  await page.locator('#exp-clipboard').click();

  // (2) Ctrl+K で「資料」と打っても資料化の行は出ない。
  await page.keyboard.press('Control+k');
  await page.waitForSelector('#cp-modal');
  for (const q of ['資料', '資料セット', '体裁', 'zip']) {
    await page.locator('#cp-input').fill(q);
    await page.waitForTimeout(150);
    await expect(page.locator('#cp-list .cp-item[data-cp-id*="export-"]'), q).toHaveCount(0);
    await expect(page.locator('#cp-list .cp-item[data-cp-id*="docset"]'), q).toHaveCount(0);
  }
  await page.keyboard.press('Escape');

  // (3) 資料用の図も普通の図として開けて描け、控えは消さない・書かない。
  await S.openFolderItem(page, 'spi_seq(資料用)');
  await S.closeFolderList(page);
  await expect(page.locator('#preview-svg svg')).toHaveCount(1, { timeout: 20000 });
  await page.waitForTimeout(1500);
  expect(fs.readFileSync(sets, 'utf8')).toBe(setsText);
  expect(fs.readFileSync(material, 'utf8')).toBe(SEQ);
  expect(errors).toEqual([]);
  fs.rmSync(dir, { recursive: true, force: true });
});
