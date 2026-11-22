// @ts-check
// TICKET-owner-20261115-2141-prune: 読むだけ節と「並べて比較」から生えた比べる・突き合わせる枝を外し、
// 2 枚を比べるのは「この図の履歴」の版との比較だけにした後も、
// (1) 読むだけ節の図を押すと、その 1 枚を書かずに右の枠に出す (そのフォルダのファイルの mtime は変わらない)。
// (2) 前の設定 (並べて比較の据え置く / 1 回だけ・対応表の憶え) が残っていてもエラー無しで開けて描ける。
// (3) 「この図の履歴」の行の「比較」で前の版が並ぶ。比べる相手に別のタブの図は出ない。
// (4) 外した入口 (⇔・下端の札・ツール ▾ のレビュー・Ctrl+K の比較の行) が画面に無い。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const SEQ = ['@startuml', 'title SPI 初期化', 'participant App', 'participant SpiDrv', 'App -> SpiDrv : Spi_Init()', '@enduml', ''].join('\n');
const SEQ2 = SEQ.replace('@enduml', 'SpiDrv --> App : E_OK\n@enduml');
const SENIOR = ['@startuml', 'title SPI 状態遷移 (先輩)', '[*] --> Uninit', 'Uninit --> Ready : Spi_Init', '@enduml', ''].join('\n');

test('owner 2141 読むだけの図は右の枠に 1 枚で出てどこにも書かず、比べるのはこの図の履歴の版だけ', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const root = S.absDirFor(__filename);
  const mineAbs = path.join(root, 'mine');
  const seniorAbs = path.join(root, 'senior');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(mineAbs, { recursive: true });
  fs.mkdirSync(seniorAbs, { recursive: true });
  const seniorFile = path.join(seniorAbs, 'spi_state.puml');
  fs.writeFileSync(seniorFile, SENIOR, 'utf8');
  const before = fs.statSync(seniorFile).mtimeMs;

  // (2) 外した仕組みの憶えが残った設定。
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pua.senior.pane', JSON.stringify({ open: false, dir: '', name: '', mode: 'once', width: 360 }));
      localStorage.setItem('pua.compare.target', 'folder');
    } catch (e) {}
  });
  const mine = S.dirFor(__filename) + '/mine';
  await H.bootWithSaveDir(page, mine);
  await S.putDoc(page, mine, 'spi_seq', SEQ);
  await page.waitForTimeout(1100);   // server の刻印は秒。版が同じ秒に潰れないように
  await S.putDoc(page, mine, 'spi_seq', SEQ2);
  await S.reopenApp(page);

  // (4) 外した入口が無い。
  for (const id of ['btn-tab-senior', 'btn-tab-diff', 'status-diff', 'status-senior', 'senior-mode', 'senior-dir', 'senior-target', 'compare-target-row', 'folder-ro-hint']) {
    await expect(page.locator('#' + id), id).toHaveCount(0);
  }

  // (1) 読むだけ節の図を押すと、その 1 枚が右の枠に出る。
  await page.locator('#files-sec-readonly').click();
  const folder = page.locator('#files-ro-list .files-ro-folder[data-ro-name="senior"]');
  await folder.click();
  await page.locator('#files-ro-list .files-ro-file[data-file-name="spi_state"]').click();
  await expect(page.locator('#senior-pane')).toBeVisible();
  await expect(page.locator('#senior-head strong')).toHaveText('読むだけ');
  await expect(page.locator('#senior-notice')).toContainText('senior の spi_state');
  await expect(page.locator('#senior-svg svg')).toHaveCount(1);
  await expect(page.locator('#files-ro-list .files-ro-tag')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('readonly.png') });
  await page.waitForTimeout(1500);
  expect(fs.statSync(seniorFile).mtimeMs).toBe(before);
  expect(fs.readFileSync(seniorFile, 'utf8')).toBe(SENIOR);
  await page.locator('#senior-close').click();
  await expect(page.locator('#senior-pane')).toBeHidden();

  // (3) この図の履歴の「比較」で前の版が並ぶ。相手の候補はこの図の版だけ (別のタブの図は出ない)。
  await page.locator('#btn-tab-new').click();
  await S.openFolder(page);
  const hist = page.locator('#folder-panel [data-versions-name="spi_seq"]');
  await expect(hist).toHaveText(/履歴 \d/);
  await hist.click();
  await expect(page.locator('#vt-modal')).toBeVisible();
  await page.locator('#vt-body [data-version-compare][data-version-of="spi_seq"]').first().click();
  await expect(page.locator('#vt-modal')).toBeHidden();
  await expect(page.locator('#compare-pane')).toBeVisible();
  await expect(page.locator('#compare-select option:checked')).toContainText('spi_seq@');
  const opts = await page.locator('#compare-select option').allTextContents();
  expect(opts.every((t) => t.indexOf('spi_seq') === 0)).toBe(true);
  await expect(page.locator('#compare-svg svg')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#compare-status')).toHaveText('前の版 (読むだけ)', { timeout: 20000 });
  // 履歴を開くのに使った中央の保存先の一覧を閉じると、今の図と前の版が並んで見える。
  await S.closeFolderList(page);
  await expect(page.locator('#compare-pane')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('history-compare.png') });

  // (4) ツール ▾ に「レビュー」の分類は無く、Ctrl+K の比較の行も出ない。
  await page.locator('#btn-compare-close').click();
  await expect(page.locator('#compare-pane')).toBeHidden();
  await H.openToolMenu(page);
  await expect(page.locator('#tool-menu')).toBeVisible();
  // TICKET-roadmap-20261115-2114-2: パネルは 1 段の一覧。レビューの項目 (指摘・変更の履歴) が無いことを見る。
  await expect(page.locator('#tool-menu .tool-menu-list .tool-menu-item').first()).toBeVisible();
  await expect(page.locator('#tool-menu')).not.toContainText('変更の履歴');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.waitForSelector('#cp-modal');
  for (const q of ['並べて比較', '前回保存からの差分']) {
    await page.locator('#cp-input').fill(q);
    await page.waitForTimeout(150);
    await expect(page.locator('#cp-list .cp-item[data-cp-id*="compare-"]')).toHaveCount(0);
    await expect(page.locator('#cp-list .cp-item[data-cp-id$=":tab-diff"]')).toHaveCount(0);
  }
  await page.keyboard.press('Escape');

  expect(errors).toEqual([]);
  fs.rmSync(root, { recursive: true, force: true });
});
