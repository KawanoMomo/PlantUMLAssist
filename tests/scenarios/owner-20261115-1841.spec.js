// @ts-check
// TICKET-owner-20261115-1841-prune: 図をまたぐ監査 (突合ボード・系統チェック・トレース漏れ・表記統一・
// 要求 ID 対応 ほか) を外した後も、それらの注記 (`' @req` / `' @covers` / 要求 ID の legend) を本文に
// 書いた既存の図は、本文を変えずに開けて描け、無変更で保存するとバイト一致する
// (GUI が読まなくなるだけで、行は消さない・書き換えない)。
// 画面には「突合」「表記統一」「トレース漏れ」「要求ID」の入口が残らない。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

test('owner 1841 要求 ID・担当範囲の注記を持つ図は、開いて保存してもバイト一致で描ける', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const original = H.fixture('req-1.puml').replace(/\r\n/g, '\n');
  const file = path.join(dir, 'req-1.puml');
  fs.writeFileSync(file, original, 'utf8');
  const bytes = fs.readFileSync(file);

  await H.bootWithSaveDir(page, S.dirFor(__filename));
  await S.openFolder(page);
  await page.locator('#folder-panel .folder-item[data-file-name="req-1"]').first().dblclick();
  await expect(page.locator('#editor')).toHaveValue(original, { timeout: 20000 });
  await H.waitDrawn(page, ['Spi_Driver', 'Spi_Config']);
  await S.closeFolderList(page);
  await expect(page.locator('#diagram-type')).toHaveValue('plantuml-class');
  await H.expectRendered(page);

  // 無変更のまま Ctrl+S。注記の行は 1 字も変わらず、保存先のファイルもバイト一致。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(1500);
  const now = await H.getEditorText(page);
  expect(now).toBe(original);
  H.annotate(testInfo, 'diffLines', H.diffLines(original, now));
  expect(Buffer.compare(fs.readFileSync(file), bytes), 'req-1.puml はバイト一致').toBe(0);

  // 外した監査の入口は、タブ列・下端・Export ▾ のどこにも無い。
  for (const id of ['btn-tab-cross', 'btn-tab-family', 'btn-tab-drivermap', 'btn-tab-trace', 'btn-tab-pattern',
    'btn-tab-unify', 'exp-req-trace', 'status-consistency', 'status-eventsync']) {
    await expect(page.locator('#' + id), id).toHaveCount(0);
  }
  await H.openToolMenu(page);
  const menu = page.locator('#tool-menu');
  await expect(menu).toBeVisible();
  await expect(menu).not.toContainText('確かめる');
  await expect(menu).not.toContainText('突合');
  await expect(menu).not.toContainText('表記統一');
});
