// @ts-check
// BLK-primary-20260908-0103 「保存先が違うと 📂一覧が黙って空になる」。
// 保存先の綴りを 1 文字誤っても一覧は「保存フォルダに図がありません」としか
// 言わず、22 枚あるはずの図が 0 件に見えて手が止まっていた。
// (1) 実在しない保存先は名指しで「見つかりません」と言う
// (2) 壊れた値は ⚙設定 の時点で保存させない (往復で壊れる \ は / に直す)
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

async function setSaveDir(page, dir) {
  await page.evaluate((d) => {
    window.MA.autoSave.setConfig({ backend: 'file', fileDir: d });
  }, dir);
  await page.waitForTimeout(200);
}

// 保存先の一覧は FILES ツリーの「保存先」の右クリック「保存先の一覧を開く」で中央の枠に開く
// (scenarios/_scenario.js の openFolder と同じ経路)。旧経路 (見出しを畳んで開き直し #folder-panel.open を待つ) は
// 一覧が中央の枠へ移ってから見えないまま待ち続けていた (BLK-releaser-20260929-0851-1)。
const S = require('../scenarios/_scenario');
async function openFolder(page) {
  await S.openFolder(page);
  await page.waitForTimeout(700);
}

async function openSettings(page) {
  await page.locator('#rail-config').click();
  await page.waitForTimeout(400);
}

test.describe('BLK-primary-20260908-0103 保存先が違うことが分かる', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('実在しない保存先なら、一覧は「見つかりません」とパスを名指しで言う', async ({ page }) => {
    await gotoApp(page);
    await setSaveDir(page, './test-results/autosave/blk-primary-0103-save-dir-missing/e2e-blk-p0103-nope');
    await openFolder(page);

    await expect(page.locator('#folder-missing')).toBeVisible();
    await expect(page.locator('#folder-missing')).toContainText('保存先フォルダが見つかりません');
    await expect(page.locator('#folder-missing')).toContainText('e2e-blk-p0103-nope');
    // 直す場所まで出る。
    await expect(page.locator('#folder-missing-hint')).toContainText('⚙設定');
    // 「図がありません」とは言わない (0 件と取り違えない)。
    await expect(page.locator('#folder-panel')).not.toContainText('保存フォルダに図がありません');
  });

  test('実在する保存先が 0 件なら、従来どおり「図がありません」', async ({ page }) => {
    await gotoApp(page);
    // 保存を 1 度起こしてフォルダを作らせ、その図を消して 0 件にする。
    await setSaveDir(page, './test-results/autosave/blk-primary-0103-save-dir-missing/e2e-blk-p0103-empty');
    await page.evaluate(() => window.fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'tmp', dsl: '@startuml\n@enduml', dir: './test-results/autosave/blk-primary-0103-save-dir-missing/e2e-blk-p0103-empty' }),
    }));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.fetch('/autosave?dir=' + encodeURIComponent('./test-results/autosave/blk-primary-0103-save-dir-missing/e2e-blk-p0103-empty'), { method: 'DELETE' }));
    await page.waitForTimeout(400);

    await openFolder(page);
    await expect(page.locator('#folder-missing')).toHaveCount(0);
    await expect(page.locator('#folder-panel')).toContainText('保存フォルダに図がありません');
  });

  test('⚙設定: バックスラッシュ区切りで打っても / に直して保存する', async ({ page }) => {
    await gotoApp(page);
    await openSettings(page);
    await page.locator('#cfg-backend-cards input[value="file"]').check();
    await page.locator('#cfg-file-dir').fill('');
    await page.locator('#cfg-file-dir').type('E:' + '\\' + '01_Loop' + '\\' + 'persona-data' + '\\' + 'primary');
    await page.locator('#cfg-ok').click();
    await page.waitForTimeout(500);

    const dir = await page.evaluate(() => window.MA.autoSave.getConfig().fileDir);
    expect(dir).toBe('E:/01_Loop/persona-data/primary');
    // 設定モーダルは閉じている (通常の保存経路)。
    await expect(page.locator('#cfg-modal')).toBeHidden();
  });

  test('⚙設定: 壊れた値は保存させず、理由を出してモーダルを閉じない', async ({ page }) => {
    await gotoApp(page);
    await setSaveDir(page, './autosave');
    await openSettings(page);
    await page.locator('#cfg-backend-cards input[value="file"]').check();
    // BLK-primary-20260908-0103 の実際の壊れ値。
    await page.locator('#cfg-file-dir').fill('E:\u0001_Looppersona-dataprimary');
    await page.locator('#cfg-ok').click();
    await page.waitForTimeout(500);

    await expect(page.locator('#cfg-modal')).toBeVisible();
    await expect(page.locator('#cfg-file-dir-msg')).toContainText('バックスラッシュ');
    expect(await page.evaluate(() => window.MA.autoSave.getConfig().fileDir)).toBe('./autosave');
  });
});
