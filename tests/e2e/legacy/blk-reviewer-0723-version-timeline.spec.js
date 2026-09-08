// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

// BLK-reviewer-20260908-0723-wish: 1 図の中身が保存のたびにどう変わったかを通しで見る。
// 単発 diff では「変わりました」としか出ず、A → B → A の往復に気付けなかった。
// 履歴を積んで並べ、前の版に戻った版へ印を付ける。

const A = '@startuml\nAlice -> Bob : hi\n@enduml';
const B = '@startuml\nAlice -> Bob : hi\nBob -> Carol : dma\n@enduml';

// 保存経路 (ネイティブのフォルダ書き込み) は E2E で踏めないので、
// 保存のたびに呼ばれるのと同じ入口を直接叩いて版を積む。
async function pushVersions(page, name, dsls) {
  await page.evaluate(([n, list]) => {
    list.forEach((d, i) => {
      window.MA.versionTimeline.push(n, d, '2026-09-08T0' + (i + 1) + ':00:00Z');
    });
  }, [name, dsls]);
}

test.describe('BLK-reviewer-20260908-0723-wish: 変遷履歴', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => window.MA.versionTimeline.reset());
  });

  test('⟲ 変遷 から、その図の版が新しい順に並ぶ', async ({ page }) => {
    const name = await page.evaluate(() => window.MA.workspace.getActive().name);
    await pushVersions(page, name, [A, B]);
    await page.locator('#btn-tab-versions').click();
    await expect(page.locator('#vt-modal')).toBeVisible();

    await expect(page.locator('.vt-row')).toHaveCount(2);
    // 新しい版が上。v2 は 1 行増えている
    const first = page.locator('.vt-row').first();
    await expect(first).toHaveAttribute('data-vt-rev', '2');
    await expect(first).toContainText('+1');
    await expect(first).toContainText('Bob -> Carol : dma');
    // 最初の版はそう言う (増減を出しても意味がないため)
    await expect(page.locator('.vt-row').last()).toContainText('最初の版');
    await expect(page.locator('#vt-summary')).toContainText('2 版');
    await expect(page.locator('#vt-summary')).toContainText('往復なし');
  });

  test('A → B → A の往復に印が付き、戻り先の版を名指しする', async ({ page }) => {
    const name = await page.evaluate(() => window.MA.workspace.getActive().name);
    await pushVersions(page, name, [A, B, A]);
    await page.locator('#btn-tab-versions').click();

    await expect(page.locator('.vt-row')).toHaveCount(3);
    const top = page.locator('.vt-row[data-vt-rev="3"]');
    await expect(top).toHaveAttribute('data-vt-revisit', '1');
    await expect(top).toContainText('往復');
    await expect(top).toContainText('v1 と同じ中身に戻っています');
    await expect(page.locator('#vt-summary')).toContainText('往復 1 回');
  });

  test('往復した版だけに絞れる', async ({ page }) => {
    const name = await page.evaluate(() => window.MA.workspace.getActive().name);
    await pushVersions(page, name, [A, B, A]);
    await page.locator('#btn-tab-versions').click();
    await page.locator('#vt-only-revisit').check();
    await page.waitForTimeout(200);
    await expect(page.locator('.vt-row')).toHaveCount(1);
    await expect(page.locator('.vt-row')).toHaveAttribute('data-vt-rev', '3');

    await page.locator('#vt-only-revisit').uncheck();
    await page.waitForTimeout(200);
    await expect(page.locator('.vt-row')).toHaveCount(3);
  });

  test('往復があるとボタンの見出しがそれを言う (開かなくても気付ける)', async ({ page }) => {
    const name = await page.evaluate(() => window.MA.workspace.getActive().name);
    await expect(page.locator('#btn-tab-versions')).toContainText('変遷');
    await pushVersions(page, name, [A, B, A]);
    await page.evaluate(() => window.MA.workspace.updateActive({}));
    await page.evaluate(() => { if (window.renderVersionBadge) window.renderVersionBadge(); });
    await page.locator('#btn-tab-versions').click();
    await expect(page.locator('#vt-summary')).toContainText('往復 1 回');
  });

  test('履歴がまだ無い図では、そう言う', async ({ page }) => {
    await page.locator('#btn-tab-versions').click();
    await expect(page.locator('#vt-empty')).toContainText('この図の履歴はまだありません');
  });

  test('この図の履歴を消すと空になり、閉じられる', async ({ page }) => {
    const name = await page.evaluate(() => window.MA.workspace.getActive().name);
    await pushVersions(page, name, [A, B]);
    await page.locator('#btn-tab-versions').click();
    await expect(page.locator('.vt-row')).toHaveCount(2);
    await page.locator('#vt-forget').click();
    await page.waitForTimeout(200);
    await expect(page.locator('#vt-empty')).toBeVisible();
    await page.locator('#vt-close').click();
    await expect(page.locator('#vt-modal')).toBeHidden();
  });

  test('図を切り替えると、その図の履歴に切り替わる', async ({ page }) => {
    const name = await page.evaluate(() => window.MA.workspace.getActive().name);
    await pushVersions(page, name, [A, B, A]);
    await pushVersions(page, 'other.puml', [A, B]);
    await page.locator('#btn-tab-versions').click();
    await expect(page.locator('#vt-summary')).toContainText('往復 1 回');

    await page.locator('#vt-file').selectOption('other.puml');
    await page.waitForTimeout(200);
    await expect(page.locator('.vt-row')).toHaveCount(2);
    await expect(page.locator('#vt-summary')).toContainText('往復なし');
  });
});
