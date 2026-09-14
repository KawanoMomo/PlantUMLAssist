// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

// BLK-builder-20260908-0823-1 — design 7a の左レール。
// 略号だけの箱をやめ、その図の形そのものを 1px の線画で添える。文字は従来の略号のまま、
// 選択中は塗りではなく左端 2px のバーで示す。幅は 48px → 56px。
test.describe('図種レールの線画 (design 7a)', () => {
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

  test('6 図種すべてに線画が 1 つずつ添う', async ({ page }) => {
    expect(await page.locator('#rail-types .rail-btn').count()).toBe(6);
    expect(await page.locator('#rail-types .rail-btn svg.rail-glyph').count()).toBe(6);
    for (const id of ['rail-seq', 'rail-uc', 'rail-cmp', 'rail-cls', 'rail-act', 'rail-st']) {
      await expect(page.locator('#' + id + ' svg.rail-glyph')).toBeVisible();
    }
  });

  test('線画は図種ごとに違う形で、1px の線で描かれている', async ({ page }) => {
    const shapes = await page.locator('#rail-types .rail-btn svg.rail-glyph').evaluateAll(
      (els) => els.map((el) => el.innerHTML));
    expect(new Set(shapes).size).toBe(6);
    const stroke = await page.locator('#rail-seq svg.rail-glyph').getAttribute('stroke-width');
    expect(stroke).toBe('1');
  });

  test('略号は線画を足しても従来のまま読める', async ({ page }) => {
    const codes = await page.locator('#rail-types .rail-btn').allInnerTexts();
    expect(codes.map((s) => s.trim())).toEqual(['SEQ', 'UC', 'CMP', 'CLS', 'ACT', 'ST']);
  });

  test('選択中は塗りではなく左端 2px のバーで示す', async ({ page }) => {
    await page.locator('#rail-cls').click();
    await page.waitForTimeout(600);
    await expect(page.locator('#rail-cls')).toHaveClass(/active/);

    const bar = await page.locator('#rail-cls').evaluate((el) => {
      const cs = getComputedStyle(el, '::before');
      return { width: cs.width, bg: cs.backgroundColor };
    });
    expect(bar.width).toBe('2px');
    // バーは透明ではない (アクセントで塗られている)
    expect(bar.bg).not.toBe('rgba(0, 0, 0, 0)');

    // ボタン本体は塗られていない
    const btnBg = await page.locator('#rail-cls').evaluate(
      (el) => getComputedStyle(el).backgroundColor);
    expect(btnBg).toBe('rgba(0, 0, 0, 0)');

    // 選ばれていないボタンのバーは透明
    const offBar = await page.locator('#rail-seq').evaluate(
      (el) => getComputedStyle(el, '::before').backgroundColor);
    expect(offBar).toBe('rgba(0, 0, 0, 0)');
  });

  test('レールの幅は 56px', async ({ page }) => {
    const w = await page.locator('#rail').evaluate((el) => el.getBoundingClientRect().width);
    expect(Math.round(w)).toBe(56);
  });

  test('線画は支援技術から隠され、押しても図種の切り替えを邪魔しない', async ({ page }) => {
    expect(await page.locator('#rail-st svg.rail-glyph').getAttribute('aria-hidden')).toBe('true');
    await page.locator('#rail-st svg.rail-glyph').click();
    await page.waitForTimeout(600);
    expect(await page.locator('#diagram-type').inputValue()).toBe('plantuml-state');
    await expect(page.locator('#rail-st')).toHaveClass(/active/);
  });
});
