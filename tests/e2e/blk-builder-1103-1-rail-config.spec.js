// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

// BLK-builder-20260908-1103-1 — design 7a の左レール最下段。
// 設定も 6 図種と同じ「線画 + 略号」にそろえ、絵文字 ⚙ をやめて CFG にする。
// 図種の列との間には 1px の区切り線を置く。
test.describe('レール最下段の設定 (design 7a)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
  });

  test('設定は線画 1 つと略号 CFG で出る (絵文字は使わない)', async ({ page }) => {
    await expect(page.locator('#rail-config')).toBeVisible();
    await expect(page.locator('#rail-config svg.rail-glyph')).toBeVisible();
    expect((await page.locator('#rail-config').innerText()).trim()).toBe('CFG');
    expect(await page.locator('#rail-config').innerHTML()).not.toContain('⚙');
  });

  test('線画は図種と同じ作り (1px・16x16・支援技術からは隠す)', async ({ page }) => {
    const g = page.locator('#rail-config svg.rail-glyph');
    expect(await g.getAttribute('stroke-width')).toBe('1');
    expect(await g.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(await g.getAttribute('aria-hidden')).toBe('true');

    // 図種のどの線画とも違う形
    const shapes = await page.locator('#rail .rail-btn svg.rail-glyph').evaluateAll(
      (els) => els.map((el) => el.innerHTML));
    expect(shapes.length).toBe(7);
    expect(new Set(shapes).size).toBe(7);
  });

  test('図種の列と設定の間に 1px の区切り線がある', async ({ page }) => {
    const line = page.locator('#rail .rail-divider');
    await expect(line).toBeVisible();
    const box = await line.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cfg = document.getElementById('rail-config').getBoundingClientRect();
      const types = document.getElementById('rail-types').getBoundingClientRect();
      return { h: r.height, above: r.top < cfg.top, below: r.top > types.bottom };
    });
    expect(Math.round(box.h)).toBe(1);
    expect(box.above).toBe(true);
    expect(box.below).toBe(true);
  });

  test('設定は図種ではない (押しても図種は変わらず、設定が開く)', async ({ page }) => {
    const before = await page.locator('#diagram-type').inputValue();
    await page.locator('#rail-config').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#cfg-modal')).toBeVisible();
    expect(await page.locator('#diagram-type').inputValue()).toBe(before);
    await expect(page.locator('#rail-config')).not.toHaveClass(/active/);
  });
});
