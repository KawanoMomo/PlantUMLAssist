// @ts-check
// TICKET-owner-20261116-0840-prune: 書き出しを Export ▾ の 4 項目に絞った後に残った痕跡
// (保存先の一覧の版バッジ「資」・図種の食い違いの監査の 1 行と ⚠ 印・状態遷移表の「CSV で書き出し」) を外した後も、
// (1) 括弧の付いた名前 `spi_seq(資料用).puml` を置いた保存先の一覧を開くと、行に版の印も監査の印も無く普通の図として並ぶ。
//     図種の印は残る。その図を開くとエラー 0 で描け、無変更で保存してもバイト一致。
// (2) 状態遷移図で状態遷移表を開くと、見出しに CSV のボタンが無く、表は今までどおり開いて ▾ で畳める。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const SEQ = ['@startuml', 'participant SpiDrv', 'participant Reg', 'SpiDrv -> Reg : write(CR1)', '@enduml', ''].join('\n');
const STATE = ['@startuml', '[*] --> Idle', 'Idle --> Running : start', 'Running --> Idle : stop', '@enduml', ''].join('\n');

test('owner 0840 括弧付きの名前の図は一覧で普通の図として並んで開け、状態遷移表に CSV のボタンが無い', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'spi_seq.puml'), SEQ, 'utf8');
  const material = path.join(dir, 'spi_seq(資料用).puml');
  fs.writeFileSync(material, SEQ, 'utf8');
  fs.writeFileSync(path.join(dir, 'gpio_state.puml'), STATE, 'utf8');

  await S.bootWithSaveDir(page, S.dirFor(__filename));

  // (1) 一覧の行に版の印・監査の印は無い。図種の印は残る。
  await S.openFolder(page);
  const row = page.locator('#folder-panel .folder-item[data-file-name="spi_seq(資料用)"]');
  await expect(row).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('folder-list.png') });
  for (const sel of ['.folder-variant', '[data-variant-of]', '#folder-kind-mismatch', '[data-kind-mismatch]']) {
    await expect(page.locator('#folder-panel ' + sel), sel).toHaveCount(0);
  }
  const listText = await page.locator('#folder-panel').innerText();
  for (const w of ['資料用 の版', '図種ずれ', '本番用']) expect(listText, w).not.toContain(w);
  await expect(page.locator('#folder-panel [data-kind-of="spi_seq(資料用)"]')).toContainText('シーケンス');

  // その図を開くと描け、無変更の保存でバイト一致。
  await S.openFolderItem(page, 'spi_seq(資料用)', { pin: true });
  await S.closeFolderList(page);
  await expect(page.locator('#preview-svg svg')).toHaveCount(1, { timeout: 20000 });
  expect(await page.locator('#editor').inputValue()).toContain('SpiDrv -> Reg : write(CR1)');
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(1200);
  expect(fs.readFileSync(material, 'utf8')).toBe(SEQ);

  // (2) 状態遷移表の見出しに CSV のボタンは無く、表は開いて畳める。
  await S.openFolderItem(page, 'gpio_state', { pin: true });
  await S.closeFolderList(page);
  await expect(page.locator('#preview-svg svg')).toHaveCount(1, { timeout: 20000 });
  const toggle = page.locator('#btn-state-table-toggle');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator('#state-table-body')).toBeVisible();
  await expect(page.locator('#state-table-body')).toContainText('Running');
  await page.screenshot({ path: testInfo.outputPath('state-table.png') });
  await expect(page.locator('#btn-state-table-csv')).toHaveCount(0);
  await expect(page.locator('#state-table-head')).not.toContainText('CSV');
  await toggle.click();
  await expect(page.locator('#state-table-body')).toBeHidden();
  expect(fs.readFileSync(path.join(dir, 'gpio_state.puml'), 'utf8')).toBe(STATE);

  await H.expectRendered(page);
  H.annotate(testInfo, 'diffLines', 0);
  expect(errors, errors.join('\n')).toEqual([]);
  fs.rmSync(dir, { recursive: true, force: true });
});
