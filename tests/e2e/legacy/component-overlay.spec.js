// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText, switchTypeWithSample } = require('../helpers');

// アプリは前回の図を開き直すので、図種を切り替えただけでは前の図が残り、枠が無いまま skip していた。
// component の見本 (WebApp / IAuth / WebApp -() IAuth) を置き、その枠が張られるまで待つ。
async function openComponentSample(page) {
  await gotoApp(page);
  await switchTypeWithSample(page, 'plantuml-component');
  await page.locator('#overlay-layer rect[data-type="relation"]').first()
    .waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
}

test.describe('Component overlay-driven', () => {
  test('clicking component in SVG selects it', async ({ page }) => {
    await openComponentSample(page);
    var rect = page.locator('#overlay-layer rect[data-type="component"]').first();
    var count = await rect.count();
    expect(count, '部品の枠がある').toBeGreaterThan(0);
    await rect.click();
    await page.waitForTimeout(300);
    var sel = await page.evaluate(function() { return window.MA.selection.getSelected(); });
    expect(sel.length).toBeGreaterThan(0);
    expect(sel[0].type).toBe('component');
  });

  test('shift+click 2 elements opens connect panel with 4 kind options', async ({ page }) => {
    await openComponentSample(page);
    var c = page.locator('#overlay-layer rect[data-type="component"]').first();
    var i = page.locator('#overlay-layer rect[data-type="interface"]').first();
    var cCount = await c.count();
    var iCount = await i.count();
    expect(cCount * iCount, '部品と interface の枠がある').toBeGreaterThan(0);
    await c.click();
    await i.click({ modifiers: ['Shift'] });
    await page.waitForTimeout(300);
    await expect(page.locator('#co-conn-create')).toBeVisible();
    var options = await page.locator('#co-conn-kind option').allTextContents();
    expect(options.some(function(o) { return o.indexOf('Association') >= 0; })).toBe(true);
    expect(options.some(function(o) { return o.indexOf('Dependency') >= 0; })).toBe(true);
    expect(options.some(function(o) { return o.indexOf('Provides') >= 0; })).toBe(true);
    expect(options.some(function(o) { return o.indexOf('Requires') >= 0; })).toBe(true);
  });

  test('multi-select connect creates relation in DSL', async ({ page }) => {
    await openComponentSample(page);
    var c = page.locator('#overlay-layer rect[data-type="component"]').first();
    var i = page.locator('#overlay-layer rect[data-type="interface"]').first();
    var cCount = await c.count();
    var iCount = await i.count();
    expect(cCount * iCount, '部品と interface の枠がある').toBeGreaterThan(0);
    var lineCountBefore = (await getEditorText(page)).split('\n').length;
    await c.click();
    await i.click({ modifiers: ['Shift'] });
    await page.waitForTimeout(300);
    await page.locator('#co-conn-create').click();
    await page.waitForTimeout(800);
    var lineCountAfter = (await getEditorText(page)).split('\n').length;
    expect(lineCountAfter).toBeGreaterThan(lineCountBefore);
  });

  test('relation kind selector switches DSL arrow on update', async ({ page }) => {
    await openComponentSample(page);
    var relRect = page.locator('#overlay-layer rect[data-type="relation"]').first();
    var count = await relRect.count();
    expect(count, '関係の枠がある').toBeGreaterThan(0);
    // 関係の線は細い当たり (path.link-hit) が枠の rect より手前にあるので、実マウスで枠の真ん中を押す。
    var relBox = await relRect.boundingBox();
    await page.mouse.click(relBox.x + relBox.width / 2, relBox.y + relBox.height / 2);
    await page.waitForTimeout(300);
    // BLK-builder-20260907-1003-3 (design 3b): 種別は select ではなくカードで選び、即反映する
    await page.locator('.co-rel-card[data-value="dependency"]').click();
    await page.waitForTimeout(800);
    var t = await getEditorText(page);
    expect(t).toContain('..>');
  });

  test('console error count is 0 during overlay interactions', async ({ page }) => {
    var errors = [];
    page.on('console', function(msg) { if (msg.type() === 'error') errors.push(msg.text()); });
    await openComponentSample(page);
    var c = page.locator('#overlay-layer rect[data-type="component"]').first();
    if ((await c.count()) > 0) {
      await c.click();
      await page.waitForTimeout(300);
    }
    var jsErrors = errors.filter(function(e) { return e.indexOf('favicon') < 0; });
    expect(jsErrors).toHaveLength(0);
  });

  // v1.1.2: Japanese component alias normalizes to ASCII alias + quoted label
  // so the new component is selectable (parser COMPONENT_KW_RE only accepts
  // ASCII identifiers).
  test('UC-bug-jp v1.1.2: Japanese-named component is selectable', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(2000);
    await page.locator('#co-tail-kind').selectOption('component');
    await page.locator('#co-tail-alias').fill('コンポA');
    await page.locator('#co-tail-add').click();
    await page.waitForTimeout(2500);
    var t = await getEditorText(page);
    expect(t).toContain('component "コンポA" as C1');
    var rect = page.locator('#overlay-layer rect[data-id="C1"]');
    await expect(rect).toHaveCount(1);
  });
});
