// @ts-check
// TICKET-owner-20261123-1922-1: 保存先を決めていない既定の画面で、FILES の「保存先」が既定のフォルダ (./autosave) の図を並べ、
// そこから開いた図の Ctrl+S・書き出しはその図に書かずダウンロードになり、`!include` も別のフォルダを探して描けなかった。
// 期待 (principles「画面の語は指す場所を偽らない」「手書きや他の道具で作った .puml は壊さず開ける」「利用者の図を失わない」):
//   - 既定の画面 (利用者の初回と同じ。保存先は未設定) では、試験用の DATA_ROOT の autosave/ に図があっても
//     FILES の保存先・保存先の一覧に図を並べず、保存先を決めていないこと・保存がダウンロードになること・決める入口の語を出す
//   - 本文を直して Ctrl+S → ダウンロードになり、autosave/ の図は 1 バイトも変わらない (一覧に並べた図が直らない形を作らない)
//   - 保存先を決めると、その保存先の図が並ぶ (決めた画面の振る舞いは変えない)
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const S = require('../e2e/scenarios/_scenario');
const H = require('./_helpers');

const DEF = './autosave';
const HAND = ['@startuml', "' 手書きの図", 'participant Ctl', 'participant Bus', '!include common.puml', 'Ctl -> Bus : Poll()', '@enduml', ''].join('\n');
const COMMON = ['participant Mon', ''].join('\n');

test('既定の画面では、保存先に決めていないフォルダの図を一覧に並べず、決める入口を言う', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  await S.bootPlain(page);
  await H.expectDefaultTabBar(page);
  await S.clearDir(page, DEF);
  await S.putDoc(page, DEF, 'hand_seq', HAND);
  await S.putDoc(page, DEF, 'common', COMMON);
  const before = await S.readDoc(page, DEF, 'hand_seq');
  expect(before).toContain('Ctl -> Bus : Poll()');
  // 図を置いた後に開き直す (利用者が既定のフォルダに図がある状態で起動したのと同じ)。
  await page.reload();
  await page.waitForSelector('html[data-app-ready="1"]', { state: 'attached' });

  // 上部バーは未設定 (ダウンロード) のまま。
  await expect(page.locator('#top-save-target')).toHaveAttribute('data-mode', 'download');
  // FILES の保存先の節: 既定のフォルダの図は並ばない。
  await expect(page.locator('#files-parts .files-part-file')).toHaveCount(0);
  await expect(page.locator('#folder-panel .folder-item')).toHaveCount(0);

  // 保存先の右クリック「保存先の一覧を開く」(実マウス) でも並ばず、理由と入口の語が出る。
  await S.openFolder(page);
  await expect(page.locator('#folder-panel .folder-item')).toHaveCount(0);
  await expect(page.locator('#folder-unset')).toContainText('保存先のフォルダを決めていません');
  await expect(page.locator('#folder-unset')).toContainText('ダウンロード');
  await expect(page.locator('#folder-unset-hint')).toContainText('保存先のフォルダを選ぶ…');
  await expect(page.locator('#folder-panel .folder-list-title')).toContainText('保存先は未設定');
  await expect(page.locator('#folder-panel .folder-list-title')).not.toContainText(DEF);
  await page.screenshot({ path: testInfo.outputPath('unset-list.png') });
  await S.closeFolderList(page);
  // 一覧を閉じても、FILES の保存先節に同じ案内が残る (図の行は 0)。
  await expect(page.locator('#files-target-unset')).toBeVisible();
  await expect(page.locator('#files-target-unset')).toContainText('保存先のフォルダを決めていません');
  await expect(page.locator('#files-parts .files-part-file')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('unset-tree.png') });

  // 本文を直して Ctrl+S → ダウンロード。既定のフォルダの図は 1 バイトも変わらない。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type("' memo\n");
  const dl = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  await dl;
  await page.waitForTimeout(600);
  expect(await S.readDoc(page, DEF, 'hand_seq')).toBe(before);
  expect((await S.listDir(page, DEF)).sort()).toEqual(['common', 'hand_seq']);

  // 保存先を決めると (窓のパスの欄 1 か所)、その保存先の図が並ぶ。
  await page.locator('#top-save-target').click();
  await expect(page.locator('#cfg-modal')).toBeVisible();
  await page.locator('#cfg-tab-autosave').click();
  await page.locator('#cfg-file-dir-pick').click();
  const dir = S.dirFor(__filename);
  fs.rmSync(S.absDirFor(__filename), { recursive: true, force: true });
  fs.mkdirSync(S.absDirFor(__filename), { recursive: true });
  await S.putDoc(page, dir, 'picked_seq', ['@startuml', 'A -> B : x', '@enduml', ''].join('\n'));
  await page.locator('#target-pick-path').fill(dir);
  await page.locator('#target-pick-ok').click();
  await expect(page.locator('#target-pick')).toHaveCount(0);
  const close = page.locator('#cfg-modal .modal-close, #cfg-close').first();
  if (await page.locator('#cfg-modal').isVisible() && await close.count()) await close.click();
  await expect(page.locator('#top-save-target')).toHaveAttribute('data-mode', 'file');
  await expect(page.locator('#folder-panel .folder-item[data-file-name="picked_seq"]')).toHaveCount(1, { timeout: 10000 });
  await expect(page.locator('#folder-unset')).toHaveCount(0);
  await expect(page.locator('#files-target-unset')).toHaveCount(0);
  await expect(page.locator('#files-parts .files-part-file[data-file-name="picked_seq"]')).toHaveCount(1);

  await S.clearDir(page, DEF);
});
