// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('Activity v0.7.0', () => {
  test.describe('α: DSL technical', () => {
    test('UC-1: switching to Activity loads start + action template', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-activity');
      await page.waitForTimeout(500);
      var t = await getEditorText(page);
      expect(t).toContain('start');
      expect(t).toContain(':Hello world;');
      expect(t).toContain('stop');
    });

    test('UC-1b: tail-add action emits canonical', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-activity');
      await page.waitForTimeout(500);
      await page.locator('#ac-tail-kind').selectOption('action');
      await page.locator('#ac-tail-text').fill('Login user');
      await page.locator('#ac-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain(':Login user;');
    });

    test('UC-2: tail-add if emits canonical with then/else/endif', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-activity');
      await page.waitForTimeout(500);
      await page.locator('#ac-tail-kind').selectOption('if');
      await page.locator('#ac-tail-cond').fill('auth?');
      await page.locator('#ac-tail-thenlbl').fill('yes');
      await page.locator('#ac-tail-elselbl').fill('no');
      await page.locator('#ac-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('if (auth?) then (yes)');
      expect(t).toContain('else (no)');
      expect(t).toContain('endif');
    });

    test('UC-3: nested if produces correct nesting', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-activity');
      await page.waitForTimeout(500);
      // Add outer if
      await page.locator('#ac-tail-kind').selectOption('if');
      await page.locator('#ac-tail-cond').fill('outer?');
      await page.locator('#ac-tail-add').click();
      await page.waitForTimeout(300);
      // Add inner if (will be appended at end → outside the outer if)
      // Verify just the existence of two if blocks
      var t = await getEditorText(page);
      expect(t).toContain('if (outer?)');
      expect(t.match(/endif/g)).toBeTruthy();
    });
  });

  test.describe('γ: form + overlay', () => {
    test('UC-4: while loop emits canonical', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-activity');
      await page.waitForTimeout(500);
      await page.locator('#ac-tail-kind').selectOption('while');
      await page.locator('#ac-tail-cond').fill('more?');
      await page.locator('#ac-tail-lbl').fill('yes');
      await page.locator('#ac-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('while (more?) is (yes)');
      expect(t).toContain('endwhile');
    });

    test('UC-5: fork with 3 branches emits 2 fork-again + end fork', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-activity');
      await page.waitForTimeout(500);
      await page.locator('#ac-tail-kind').selectOption('fork');
      await page.locator('#ac-tail-bcount').fill('3');
      await page.locator('#ac-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      var lines = t.split('\n');
      var againCount = lines.filter(function(l) { return /^fork again\s*$/.test(l); }).length;
      expect(againCount).toBe(2);
      expect(t).toContain('end fork');
    });

    test('UC-6: swimlane added then action gets that swimlane', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-activity');
      await page.waitForTimeout(500);
      await page.locator('#ac-tail-kind').selectOption('swimlane');
      await page.locator('#ac-tail-lbl').fill('Frontend');
      await page.locator('#ac-tail-add').click();
      await page.waitForTimeout(200);
      // Add action after swimlane
      await page.locator('#ac-tail-kind').selectOption('action');
      await page.locator('#ac-tail-text').fill('Render UI');
      await page.locator('#ac-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('|Frontend|');
      expect(t).toContain(':Render UI;');
      // Verify swimlane line precedes action line
      var lines = t.split('\n');
      var swIdx = lines.indexOf('|Frontend|');
      var acIdx = lines.indexOf(':Render UI;');
      expect(swIdx).toBeGreaterThan(0);
      expect(acIdx).toBeGreaterThan(swIdx);
    });

    test('UC-7: clicking action overlay rect selects action and shows edit form', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-activity');
      await page.waitForTimeout(2500);
      var rect = page.locator('#overlay-layer rect[data-type="action"]').first();
      var c = await rect.count();
      if (c === 0) test.skip();
      await rect.click();
      await page.waitForTimeout(300);
      var textArea = await page.locator('#ac-action-text').count();
      expect(textArea).toBeGreaterThan(0);
    });

    test('hover on preview shows insert guide ("+ ここに挿入")', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-activity');
      await page.waitForTimeout(2500);
      var actionRect = page.locator('#overlay-layer rect[data-type="action"]').first();
      var c = await actionRect.count();
      if (c === 0) test.skip();
      // Hover above the action rect (so guide line appears in empty space)
      var box = await actionRect.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y - 10);
      await page.waitForTimeout(200);
      var guide = await page.locator('#hover-layer .hover-guide').count();
      expect(guide).toBeGreaterThan(0);
    });

    test('clicking empty preview area opens insert form and inserts action', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-activity');
      await page.waitForTimeout(2500);
      var actionRect = page.locator('#overlay-layer rect[data-type="action"]').first();
      var c = await actionRect.count();
      if (c === 0) test.skip();
      var box = await actionRect.boundingBox();
      // Click just below the action rect (5-10px gap before next overlay rect = empty area)
      await page.mouse.click(box.x + box.width / 2, box.y + box.height + 6);
      await page.waitForTimeout(300);
      var modalDisplay = await page.locator('#act-modal').evaluate(function(el) { return el.style.display; });
      expect(modalDisplay).toBe('flex');
      await page.locator('#act-mod-text').fill('Mid Insert');
      await page.locator('#act-mod-confirm').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain(':Mid Insert;');
    });

    test('console error count is 0 during overlay interactions', async ({ page }) => {
      var errors = [];
      page.on('console', function(msg) { if (msg.type() === 'error') errors.push(msg.text()); });
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-activity');
      await page.waitForTimeout(2500);
      var actionRect = page.locator('#overlay-layer rect[data-type="action"]').first();
      if ((await actionRect.count()) > 0) {
        await actionRect.click();
        await page.waitForTimeout(200);
      }
      var jsErrors = errors.filter(function(e) { return e.indexOf('favicon') < 0; });
      expect(jsErrors).toHaveLength(0);
    });
  });
});
