// @ts-check
// TICKET-owner-20261124-0342-3: 保存先の無い図 (ダウンロード) の Export ▾ →「PNG（透過背景）で書き出す」が、
// 「PNG で書き出す」と同じ `{名前}.png` で落ちていた (2 つ出すと `(1)` が付き、どちらが透過か名前で分からない)。
// 期待:
//   - 透過 PNG のダウンロード名は `{今の図の名前}.transparent.png` (保存先の図・まとめての書き出しと同じ)。PNG は `{名前}.png` のまま
//   - 下端の「書き出しました: {名前} …」もその名前を言う
//   - 書き出しで本文は 1 行も動かない。手数は Export ▾ → 項目の 2 クリック
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function exportDownload(page, itemId) {
  const dlP = page.waitForEvent('download');
  await page.locator('#btn-export').click();
  await expect(page.locator('#' + itemId)).toBeVisible();
  await page.locator('#' + itemId).click();
  return dlP;
}

test('owner 0342-3 保存先の無い図の透過 PNG は {名前}.transparent.png で落ち、PNG と名前で分かれる', async ({ page }, testInfo) => {
  const src = H.fixture('state-1.puml');
  await H.bootWith(page, src);
  await H.waitDrawn(page, ['Idle', 'Running']);
  const before = await H.getEditorText(page);
  const name = await page.evaluate(() => window.MA.workspace.getActive().name);
  expect(name).toBeTruthy();

  const dlT = await exportDownload(page, 'exp-png-transparent');
  expect(dlT.suggestedFilename()).toBe(name + '.transparent.png');
  const outT = testInfo.outputPath(dlT.suggestedFilename());
  await dlT.saveAs(outT);
  expect(fs.readFileSync(outT).subarray(0, 8).equals(PNG_SIG)).toBe(true);
  await expect(page.locator('#status-save-result')).toContainText('書き出しました: ' + name + '.transparent.png');
  await page.screenshot({ path: testInfo.outputPath('download-transparent.png') });

  const dlP = await exportDownload(page, 'exp-png');
  expect(dlP.suggestedFilename()).toBe(name + '.png');
  await expect(page.locator('#status-save-result')).toContainText('書き出しました: ' + name + '.png');

  expect(H.diffLines(before, await H.getEditorText(page))).toBe(0);
  // 保存先の無い図では Export ▾ に「書き出し先:」の行が出ない (ダウンロードのまま)
  await page.locator('#btn-export').click();
  await expect(page.locator('#export-dest')).toBeHidden();
  await page.keyboard.press('Escape');
});
