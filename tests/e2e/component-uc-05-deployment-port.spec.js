// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('UC-5: 横展開 (ports を追加して詳細ブロック化)', () => {
  test.describe('α: DSL technical', () => {
    test('addPort emits canonical', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('port');
      await page.locator('#co-tail-alias').fill('p1');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('port p1');
    });
    test('parser links port parentComponentId', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        var ed = document.getElementById('editor');
        ed.value = '@startuml\ncomponent W\nport p1\n@enduml';
        ed.dispatchEvent(new Event('input'));
      });
      await page.waitForTimeout(300);
      var port = await page.evaluate(() => {
        var t = document.getElementById('editor').value;
        var p = window.MA.modules.plantumlComponent.parse(t);
        return p.elements.find(function(e) { return e.kind === 'port'; });
      });
      expect(port.parentComponentId).toBe('W');
    });
  });

  test.describe('γ: workflow completion', () => {
    test('port option visible in kind selector', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      var options = await page.locator('#co-tail-kind option').allTextContents();
      expect(options.some(function(o) { return o.includes('Port'); })).toBe(true);
    });
    test('multi-port workflow', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-component');
      await page.waitForTimeout(300);
      await page.locator('#co-tail-kind').selectOption('port');
      await page.locator('#co-tail-alias').fill('p1');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(200);
      await page.locator('#co-tail-kind').selectOption('port');
      await page.locator('#co-tail-alias').fill('p2');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('port p1');
      expect(t).toContain('port p2');
    });
  });
});
