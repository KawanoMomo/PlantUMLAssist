// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

// BLK-builder-20260907-0803-4b — design 1a のフローティング・ズーム。
// キャンバスの上に浮いた帯から倍率を変えられ、表示がツールバー側と食い違わない。
test.describe('フローティング・ズーム (design 1a)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => {
      Object.keys(localStorage).forEach(function(k) {
        if (k.indexOf('plantuml-autosave-') === 0 || k === 'plantuml-diagram-type'
          || k === 'plantuml-workspace') localStorage.removeItem(k);
      });
    });
    await page.reload();
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
  });

  test('キャンバス上に帯が乗り、図種と倍率を並べて出す', async ({ page }) => {
    await expect(page.locator('#zoom-hud')).toBeVisible();
    await expect(page.locator('#hud-label')).toHaveText('Sequence · 100%');
    await expect(page.locator('#hud-percent')).toHaveText('100%');
  });

  test('帯の ＋ / − で倍率が変わり、ツールバー側の表示も一致する', async ({ page }) => {
    await page.locator('#hud-zoom-in').click();
    await expect(page.locator('#hud-percent')).toHaveText('110%');
    await expect(page.locator('#zoom-display')).toHaveText('110%');  // 実体は #toolbar-actions
    await page.locator('#hud-zoom-out').click();
    await page.locator('#hud-zoom-out').click();
    await expect(page.locator('#hud-percent')).toHaveText('90%');
    await expect(page.locator('#zoom-display')).toHaveText('90%');
  });

  test('倍率は実際にプレビューへ効く', async ({ page }) => {
    await page.locator('#hud-zoom-in').click();
    const t = await page.locator('#preview-svg').evaluate(el => el.style.transform);
    expect(t).toContain('scale(1.1)');
  });

  test('ツールバー側から変えても帯の表示が追随する', async ({ page }) => {
    await page.locator('#btn-zoom-in').dispatchEvent('click');
    await expect(page.locator('#hud-percent')).toHaveText('110%');
    await expect(page.locator('#hud-label')).toHaveText('Sequence · 110%');
  });

  test('Fit はキャンバス幅に合わせ、帯の表示もその倍率になる', async ({ page }) => {
    await page.locator('#hud-zoom-fit').click();
    await page.waitForTimeout(300);
    const pct = await page.locator('#hud-percent').innerText();
    const disp = await page.locator('#zoom-display').textContent();
    expect(pct).toBe(disp);
    expect(pct).not.toBe('100%');
  });

  test('図種を変えると帯のラベルも変わる', async ({ page }) => {
    await page.locator('#diagram-type').selectOption('plantuml-class');
    await page.waitForTimeout(600);
    await expect(page.locator('#hud-label')).toContainText('Class');
  });

  test('端では対応するボタンが押せなくなる', async ({ page }) => {
    // setZoom は module scope なのでツールバー経由で上限まで上げる
    for (let i = 0; i < 45; i++) await page.locator('#btn-zoom-in').dispatchEvent('click');
    await expect(page.locator('#hud-percent')).toHaveText('500%');
    await expect(page.locator('#hud-zoom-in')).toBeDisabled();
    await expect(page.locator('#hud-zoom-out')).toBeEnabled();
  });
});
