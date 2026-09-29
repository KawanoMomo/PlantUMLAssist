// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText, switchTypeWithSample } = require('../helpers');

test.describe('UC-5: 横展開 (ports を追加して詳細ブロック化)', () => {
  test.describe('α: DSL technical', () => {
    test('addPort emits port inside parent component block', async ({ page }) => {
      await gotoApp(page);
      await switchTypeWithSample(page, 'plantuml-component');
      await page.locator('#co-tail-kind-chip-port').click();
      await page.locator('#co-tail-parent').selectOption('WebApp');
      await page.locator('#co-tail-alias').fill('p1');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('port p1');
      expect(t).toMatch(/component WebApp\s*\{[\s\S]*port p1[\s\S]*\}/);
    });
    test('parser links port parentComponentId', async ({ page }) => {
      await gotoApp(page);
      await switchTypeWithSample(page, 'plantuml-component');
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
      await switchTypeWithSample(page, 'plantuml-component');
      // 種類のプルダウンは種別チップに置き換わった(選択肢名も「ポート (port)」)。チップが出ていることを見る。
      await expect(page.locator('#co-tail-kind-chip-port')).toBeVisible();
    });
    test('multi-port workflow keeps both inside same component block', async ({ page }) => {
      await gotoApp(page);
      await switchTypeWithSample(page, 'plantuml-component');
      await page.locator('#co-tail-kind-chip-port').click();
      await page.locator('#co-tail-parent').selectOption('WebApp');
      await page.locator('#co-tail-alias').fill('p1');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(200);
      await page.locator('#co-tail-kind-chip-port').click();
      await page.locator('#co-tail-parent').selectOption('WebApp');
      await page.locator('#co-tail-alias').fill('p2');
      await page.locator('#co-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('port p1');
      expect(t).toContain('port p2');
      expect(t).toMatch(/component WebApp\s*\{[\s\S]*port p1[\s\S]*port p2[\s\S]*\}/);
    });
  });
});
