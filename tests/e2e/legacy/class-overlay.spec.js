// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

// クラス矩形はボックス全体を覆うが、その中心には member 矩形が重なる
// (UML のクラスは中央が属性/操作コンパートメント)。中心クリックは member を
// 選ぶのが正しい振る舞いなので、クラス自体を掴むときはヘッダ帯を狙う。
// class-v0.6.1.spec.js が既に使っている規約と同じ。
async function clickEntity(page, locator, opts) {
  var o = Object.assign({ position: { x: 10, y: 8 } }, opts || {});
  await locator.click(o);
}

test.describe('Class diagram (v0.6.0)', () => {
  test.describe('α: DSL technical', () => {
    // BLK-junior-20260909-0703 / BLK-owner-20260925-0312-2: 白紙・見本のままのタブで図種を選ぶと、見本 (class User 等) は
    // 入れず切り替え先の白紙にする。クラス図の追加フォームが出て、そこから 1 件目を足せる。
    test('switching a blank tab to Class gives a blank class diagram and the class add form', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(500);
      var t = await getEditorText(page);
      expect(t).toMatch(/^@startuml/);
      expect(t.trim()).toMatch(/@enduml$/);
      expect(t).not.toContain('class User');
      expect(t).not.toContain('interface IAuth');
      await expect(page.locator('#cl-tail-kind')).toBeVisible();
    });

    test('add class via tail-add emits canonical', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(500);
      await page.locator('#cl-tail-kind').selectOption('class');
      await page.locator('#cl-tail-alias').fill('Order');
      await page.locator('#cl-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('class Order');
    });

    test('add abstract class with stereotype', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(500);
      await page.locator('#cl-tail-kind').selectOption('abstract');
      await page.locator('#cl-tail-alias').fill('Shape');
      await page.locator('#cl-tail-stereo').fill('Geometry');
      await page.locator('#cl-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('abstract class Shape');
      expect(t).toContain('<<Geometry>>');
    });

    test('add enum with values', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(500);
      await page.locator('#cl-tail-kind').selectOption('enum');
      await page.locator('#cl-tail-alias').fill('Color');
      await page.locator('#cl-tail-values').fill('RED\nGREEN\nBLUE');
      await page.locator('#cl-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('enum Color');
      expect(t).toContain('RED');
      expect(t).toContain('GREEN');
      expect(t).toContain('BLUE');
    });

    test('add inheritance relation emits canonical (parent <|-- child)', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(500);
      await page.locator('#cl-tail-kind').selectOption('class');
      await page.locator('#cl-tail-alias').fill('Animal');
      await page.locator('#cl-tail-add').click();
      await page.waitForTimeout(200);
      await page.locator('#cl-tail-kind').selectOption('class');
      await page.locator('#cl-tail-alias').fill('Dog');
      await page.locator('#cl-tail-add').click();
      await page.waitForTimeout(200);
      await page.locator('#cl-tail-kind').selectOption('relation');
      await page.locator('#cl-tail-rkind').selectOption('inheritance');
      // BLK-owner-20260929-0351-1: From は矢の根元 = 子 (Dog)、To は親 (Animal)
      await page.locator('#cl-tail-from').selectOption('Dog');
      await page.locator('#cl-tail-to').selectOption('Animal');
      await page.locator('#cl-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('Animal <|-- Dog');
    });

    test('add generics class', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(500);
      await page.locator('#cl-tail-kind').selectOption('class');
      await page.locator('#cl-tail-alias').fill('Container');
      await page.locator('#cl-tail-generics').fill('T');
      await page.locator('#cl-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('class Container<T>');
    });
  });

  test.describe('γ: overlay-driven', () => {
    test('clicking class in SVG selects it', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(2500);
      var rect = page.locator('#overlay-layer rect[data-type="class"]').first();
      var count = await rect.count();
      if (count === 0) test.skip();
      await clickEntity(page, rect);
      await page.waitForTimeout(300);
      var sel = await page.evaluate(function() { return window.MA.selection.getSelected(); });
      expect(sel[0].type).toBe('class');
    });

    test('clicking interface selects with interface type', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(2500);
      var rect = page.locator('#overlay-layer rect[data-type="interface"]').first();
      var count = await rect.count();
      if (count === 0) test.skip();
      await rect.click();
      await page.waitForTimeout(300);
      var sel = await page.evaluate(function() { return window.MA.selection.getSelected(); });
      expect(sel[0].type).toBe('interface');
    });

    test('shift+click 2 elements opens connect panel with 6 kind options', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(2500);
      var c = page.locator('#overlay-layer rect[data-type="class"]').first();
      var i = page.locator('#overlay-layer rect[data-type="interface"]').first();
      if ((await c.count()) === 0 || (await i.count()) === 0) test.skip();
      await clickEntity(page, c);
      await clickEntity(page, i, { modifiers: ['Shift'] });
      await page.waitForTimeout(300);
      var options = await page.locator('#cl-conn-kind option').allTextContents();
      expect(options.some(function(o) { return o.indexOf('Inheritance') >= 0; })).toBe(true);
      expect(options.some(function(o) { return o.indexOf('Implementation') >= 0; })).toBe(true);
      expect(options.some(function(o) { return o.indexOf('Composition') >= 0; })).toBe(true);
      expect(options.some(function(o) { return o.indexOf('Aggregation') >= 0; })).toBe(true);
      expect(options.some(function(o) { return o.indexOf('Dependency') >= 0; })).toBe(true);
      expect(options.some(function(o) { return o.indexOf('Association') >= 0; })).toBe(true);
    });

    test('multi-select connect creates relation in DSL', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(2500);
      var c = page.locator('#overlay-layer rect[data-type="class"]').first();
      var i = page.locator('#overlay-layer rect[data-type="interface"]').first();
      if ((await c.count()) === 0 || (await i.count()) === 0) test.skip();
      var lineCountBefore = (await getEditorText(page)).split('\n').length;
      await clickEntity(page, c);
      await clickEntity(page, i, { modifiers: ['Shift'] });
      await page.waitForTimeout(300);
      await page.locator('#cl-conn-create').click();
      await page.waitForTimeout(800);
      var lineCountAfter = (await getEditorText(page)).split('\n').length;
      expect(lineCountAfter).toBeGreaterThan(lineCountBefore);
    });

    test('console error count is 0 during overlay interactions', async ({ page }) => {
      var errors = [];
      page.on('console', function(msg) { if (msg.type() === 'error') errors.push(msg.text()); });
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(2500);
      var c = page.locator('#overlay-layer rect[data-type="class"]').first();
      if ((await c.count()) > 0) {
        await clickEntity(page, c);
        await page.waitForTimeout(300);
      }
      var jsErrors = errors.filter(function(e) { return e.indexOf('favicon') < 0; });
      expect(jsErrors).toHaveLength(0);
    });

    // v1.1.2: Japanese class alias normalizes to ASCII alias + label so the
    // class is selectable via overlay click (parser CLASS_KW_RE only accepts
    // ASCII identifiers).
    test('UC-bug-jp v1.1.2: Japanese-named class is selectable', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(3000);
      await page.locator('#cl-tail-kind').selectOption('class');
      await page.locator('#cl-tail-alias').fill('クラスA');
      await page.locator('#cl-tail-add').click();
      // Class template is bigger (multiple classes + relations) so the render
      // round-trip + buildOverlay takes longer than other modules. The
      // expect.toHaveCount below polls up to 5s on its own, but the overlay
      // is only attached after the render fetch resolves.
      await page.waitForTimeout(4500);
      var t = await getEditorText(page);
      expect(t).toContain('class "クラスA" as C1');
      var rect = page.locator('#overlay-layer rect[data-id="C1"]');
      await expect(rect).toHaveCount(1, { timeout: 8000 });
    });
  });
});
