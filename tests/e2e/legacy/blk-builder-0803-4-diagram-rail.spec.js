// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

// BLK-builder-20260907-0803-4 — design 1a「Quiet Rail」の図種レール。
// 画面左端のレールから 1 クリックで図種を切り替えられ、現在の図種が
// 常時ハイライトされることを実機で確かめる。
test.describe('図種レール (design 1a)', () => {
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

  test('レールに 6 図種が SEQ/UC/CMP/CLS/ACT/ST の順で並ぶ', async ({ page }) => {
    const codes = await page.locator('#rail-types .rail-btn').allInnerTexts();
    expect(codes).toEqual(['SEQ', 'UC', 'CMP', 'CLS', 'ACT', 'ST']);
  });

  test('起動時は現在の図種 (Sequence) がハイライトされている', async ({ page }) => {
    await expect(page.locator('#rail-seq')).toHaveClass(/active/);
    expect(await page.locator('#rail-types .rail-btn.active').count()).toBe(1);
  });

  test('レールを 1 クリックで図種が切り替わり、ハイライトも移る', async ({ page }) => {
    await page.locator('#rail-st').click();
    await page.waitForTimeout(600);
    expect(await page.locator('#diagram-type').inputValue()).toBe('plantuml-state');
    await expect(page.locator('#rail-st')).toHaveClass(/active/);
    await expect(page.locator('#rail-seq')).not.toHaveClass(/active/);
    expect(await page.locator('#rail-types .rail-btn.active').count()).toBe(1);
    // 状態遷移図のテンプレートが入っている
    expect(await page.locator('#editor').inputValue()).toContain('@startuml');
  });

  test('select 側から切り替えてもレールのハイライトが追随する', async ({ page }) => {
    await page.locator('#diagram-type').selectOption('plantuml-class');
    await page.waitForTimeout(600);
    await expect(page.locator('#rail-cls')).toHaveClass(/active/);
    expect(await page.locator('#rail-types .rail-btn.active').count()).toBe(1);
  });

  test('レールで切り替えた図種は編集内容ごと往復できる', async ({ page }) => {
    await page.locator('#rail-cls').click();
    await page.waitForTimeout(600);
    await page.locator('#editor').fill('@startuml\nclass Marker_RAIL\n@enduml');
    await page.waitForTimeout(800);
    await page.locator('#rail-seq').click();
    await page.waitForTimeout(600);
    expect(await page.locator('#editor').inputValue()).not.toContain('Marker_RAIL');
    await page.locator('#rail-cls').click();
    await page.waitForTimeout(600);
    expect(await page.locator('#editor').inputValue()).toContain('Marker_RAIL');
  });

  test('レール下端の ⚙ で設定モーダルが開く', async ({ page }) => {
    await page.locator('#rail-config').click();
    await expect(page.locator('#cfg-modal')).toBeVisible();
  });
});
