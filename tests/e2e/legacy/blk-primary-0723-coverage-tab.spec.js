// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

// BLK-primary-20260908-0723-design — design 5d「UML 要素の網羅一覧」。
// 図種ごとの「常時表示 / その他パレット」の配分を 1 枚の表で見せ、配分そのものを
// レビュー対象にする。今まではこの対応表を見る手段が GUI に無く、どの操作が
// どの図種のどの UI 要素に効くのかを図を 1 枚ずつ開いて確かめるしかなかった。
test.describe('design 5d: UML 要素の網羅一覧タブ', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => localStorage.removeItem('plantuml-settings-tab'));
    await page.locator('#rail-config').click();
    await expect(page.locator('#cfg-modal')).toBeVisible();
  });

  test('設定の「UML 要素の網羅一覧」タブに 6 図種の対応表が出る', async ({ page }) => {
    await page.locator('#cfg-tab-coverage').click();
    await expect(page.locator('#cfg-pane-coverage')).toBeVisible();
    await expect(page.locator('#cfg-pane-autosave')).toBeHidden();

    await expect(page.locator('#cfg-cv-table')).toHaveAttribute('data-cv-rows', '6');
    await expect(page.locator('.cfg-cv-row')).toHaveCount(6);
    for (const name of ['Sequence', 'UseCase', 'Component', 'Class', 'Activity', 'State']) {
      await expect(page.locator('#cfg-cv-table')).toContainText(name);
    }
    // 表の 2 列が「常時表示」と「その他パレット」であること
    await expect(page.locator('#cfg-cv-table thead')).toContainText('常時表示');
    await expect(page.locator('#cfg-cv-table thead')).toContainText('その他パレット');
    // 配分の中身が読める (Sequence の常時表示と、畳まれている側の要素)
    await expect(page.locator('.cfg-cv-row[data-cv-type="plantuml-sequence"]')).toContainText('alt・loop');
    await expect(page.locator('.cfg-cv-row[data-cv-type="plantuml-sequence"]')).toContainText('autonumber');
  });

  test('いま編集している図種の行に「編集中」が付く', async ({ page }) => {
    await page.locator('#cfg-tab-coverage').click();
    await expect(page.locator('.cfg-cv-row[data-cv-current="1"]')).toHaveCount(1);
    await expect(page.locator('.cfg-cv-row[data-cv-type="plantuml-sequence"]')).toContainText('編集中');

    // 図種を State に替えて開き直すと、印もその行へ移る
    await page.locator('#cfg-cancel').click();
    await page.locator('#diagram-type').selectOption('plantuml-state');
    await page.waitForTimeout(1200);
    await page.locator('#rail-config').click();
    await page.locator('#cfg-tab-coverage').click();
    await expect(page.locator('.cfg-cv-row[data-cv-current="1"]')).toHaveCount(1);
    await expect(page.locator('.cfg-cv-row[data-cv-type="plantuml-state"]')).toContainText('編集中');
  });

  test('要素名で絞ると、その要素を持つ図種だけが残る', async ({ page }) => {
    await page.locator('#cfg-tab-coverage').click();
    await page.locator('#cfg-cv-search').fill('スイムレーン');
    await page.waitForTimeout(300);
    await expect(page.locator('.cfg-cv-row')).toHaveCount(1);
    await expect(page.locator('.cfg-cv-row')).toContainText('Activity');

    await page.locator('#cfg-cv-search').fill('まったく無い要素');
    await page.waitForTimeout(300);
    await expect(page.locator('#cfg-cv-empty')).toContainText('該当する要素がありません');

    await page.locator('#cfg-cv-search').fill('');
    await page.waitForTimeout(300);
    await expect(page.locator('.cfg-cv-row')).toHaveCount(6);
  });

  test('タブを開き直しても網羅一覧が選ばれたまま残る', async ({ page }) => {
    await page.locator('#cfg-tab-coverage').click();
    await expect(page.locator('#cfg-pane-coverage')).toBeVisible();
    await page.locator('#cfg-cancel').click();
    await page.locator('#rail-config').click();
    await expect(page.locator('#cfg-tab-coverage')).toHaveClass(/active/);
    await expect(page.locator('#cfg-pane-coverage')).toBeVisible();
    await expect(page.locator('#cfg-cv-table')).toHaveAttribute('data-cv-rows', '6');
  });
});
