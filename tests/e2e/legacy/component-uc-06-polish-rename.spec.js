// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText, switchTypeWithSample } = require('../helpers');

test.describe('UC-6: polish (component / interface id 命名見直し)', () => {
  test.describe('α: DSL technical', () => {
    test('renameWithRefs updates component and relation refs', async ({ page }) => {
      await gotoApp(page);
      await switchTypeWithSample(page, 'plantuml-component');
      var newT = await page.evaluate(() => {
        var t = document.getElementById('editor').value;
        return window.MA.modules.plantumlComponent.renameWithRefs(t, 'WebApp', 'Web');
      });
      expect(newT).toContain('component Web');
      expect(newT).toContain('Web -() IAuth');
    });
    test('renameWithRefs preserves quoted labels', async ({ page }) => {
      await gotoApp(page);
      await switchTypeWithSample(page, 'plantuml-component');
      await page.evaluate(() => {
        var ed = document.getElementById('editor');
        ed.value = '@startuml\ncomponent "Web App" as W\ninterface IAuth\nW -() IAuth\n@enduml';
        ed.dispatchEvent(new Event('input'));
      });
      await page.waitForTimeout(300);
      var newT = await page.evaluate(() => {
        var t = document.getElementById('editor').value;
        return window.MA.modules.plantumlComponent.renameWithRefs(t, 'W', 'WebApp');
      });
      expect(newT).toContain('"Web App"');
      expect(newT).toContain('as WebApp');
    });
  });

  test.describe('γ: workflow completion', () => {
    test('selection panel exposes rename button', async ({ page }) => {
      await gotoApp(page);
      await switchTypeWithSample(page, 'plantuml-component');
      await page.evaluate(() => {
        window.MA.selection.setSelected([{ type: 'component', id: 'WebApp', line: 3 }]);
      });
      await page.waitForTimeout(200);
      var hasRenameBtn = await page.locator('#co-rename-refs').count();
      expect(hasRenameBtn).toBeGreaterThan(0);
    });
    test('rename via Undo round-trip', async ({ page }) => {
      await gotoApp(page);
      await switchTypeWithSample(page, 'plantuml-component');
      await page.evaluate(() => {
        window.MA.history.pushHistory();
        var t = document.getElementById('editor').value;
        var newT = window.MA.modules.plantumlComponent.renameWithRefs(t, 'WebApp', 'Web');
        var ed = document.getElementById('editor');
        ed.value = newT;
        // 本文の書き換えは input で本文の持ち主 (mmdText) に届ける。届けないと Ctrl+Z は書き換え前を「今」と見る。
        ed.dispatchEvent(new Event('input'));
      });
      await page.waitForTimeout(200);
      var afterText = await getEditorText(page);
      expect(afterText).toContain('component Web');
      await page.evaluate(() => {
        if (window.MA.history && window.MA.history.undo) window.MA.history.undo();
      });
      await page.waitForTimeout(300);
      var undone = await getEditorText(page);
      expect(undone).toContain('component WebApp');
    });
  });
});
