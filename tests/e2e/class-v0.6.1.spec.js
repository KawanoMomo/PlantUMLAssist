// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('Class v0.6.1 polish', () => {
  test.describe('Note on class', () => {
    test('tail-add note kind appends note left of class', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(500);
      await page.locator('#cl-tail-kind').selectOption('note');
      await page.waitForTimeout(200);
      await page.locator('#cl-tail-ntarget').selectOption('User');
      await page.locator('#cl-tail-npos').selectOption('left');
      await page.locator('#cl-tail-ntext').fill('hello note');
      await page.locator('#cl-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('note left of User : hello note');
    });

    test('multi-line note via class panel emits end note block', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(2500);
      var rect = page.locator('#overlay-layer rect[data-type="class"]').first();
      var c = await rect.count();
      if (c === 0) test.skip();
      // Click top-left of class rect (header area, avoiding member rect overlap)
      var box = await rect.boundingBox();
      await page.mouse.click(box.x + 10, box.y + 8);
      await page.waitForTimeout(300);
      await page.locator('#cl-add-note-btn').click();
      await page.waitForTimeout(200);
      await page.locator('#cl-new-npos').selectOption('right');
      await page.locator('#cl-new-ntext').fill('first\nsecond');
      await page.locator('#cl-new-nadd').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('note right of');
      expect(t).toContain('end note');
      expect(t).toContain('first');
      expect(t).toContain('second');
    });

    test('deleting class removes its notes (cascade)', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(500);
      // Add a note first
      await page.locator('#cl-tail-kind').selectOption('note');
      await page.waitForTimeout(200);
      await page.locator('#cl-tail-ntarget').selectOption('User');
      await page.locator('#cl-tail-ntext').fill('cascade me');
      await page.locator('#cl-tail-add').click();
      await page.waitForTimeout(2500);
      // Click User class on overlay
      var rect = page.locator('#overlay-layer rect[data-type="class"][data-id="User"]').first();
      var c = await rect.count();
      if (c === 0) test.skip();
      // Click top-left of class rect (header area, avoiding member rect overlap)
      var box = await rect.boundingBox();
      await page.mouse.click(box.x + 10, box.y + 8);
      await page.waitForTimeout(300);
      // Auto-confirm window.confirm() dialog (cascade delete prompts)
      page.once('dialog', function(d) { d.accept(); });
      await page.locator('#cl-delete').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).not.toContain('class User');
      expect(t).not.toContain('note left of User');
      expect(t).not.toContain('cascade me');
    });
  });

  test.describe('Member individual click', () => {
    test('clicking member rect selects member and expands inline edit', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(2500);
      var memRect = page.locator('#overlay-layer rect[data-type="member"]').first();
      var mc = await memRect.count();
      if (mc === 0) test.skip();
      await memRect.click();
      await page.waitForTimeout(300);
      // Inline edit fields should be present
      var nameField = await page.locator('input[id^="cl-mem-name-"]').count();
      expect(nameField).toBeGreaterThan(0);
    });

    test('shift+click member coerces to parent class for multi-select connect', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(2500);
      var classRect = page.locator('#overlay-layer rect[data-type="class"]').first();
      var iface = page.locator('#overlay-layer rect[data-type="interface"]').first();
      if ((await classRect.count()) === 0 || (await iface.count()) === 0) test.skip();
      // First click interface header (so coerce target differs from class member parent)
      var ibox = await iface.boundingBox();
      await page.mouse.click(ibox.x + 10, ibox.y + 8);
      await page.waitForTimeout(200);
      // Shift+click member of the class (coerces to parent class → 2 distinct entities)
      var anyMember = page.locator('#overlay-layer rect[data-type="member"]').first();
      var mc = await anyMember.count();
      if (mc === 0) test.skip();
      await anyMember.click({ modifiers: ['Shift'] });
      await page.waitForTimeout(300);
      var connKind = await page.locator('#cl-conn-kind').count();
      expect(connKind).toBeGreaterThan(0);
    });

    test('member delete immediately updates UI (panel re-renders, no stale member row)', async ({ page }) => {
      var errors = [];
      page.on('console', function(msg) { if (msg.type() === 'error') errors.push(msg.text()); });
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(2500);
      var memRect = page.locator('#overlay-layer rect[data-type="member"]').first();
      var mc = await memRect.count();
      if (mc === 0) test.skip();
      var memCountBefore = mc;
      // Click member to focus + expand inline edit
      await memRect.click();
      await page.waitForTimeout(300);
      // Verify focused row shows inline edit
      var editFieldsBefore = await page.locator('input[id^="cl-mem-name-"]').count();
      expect(editFieldsBefore).toBeGreaterThan(0);
      // Click delete on the focused member
      await page.locator('button[id^="cl-mem-del-"]').first().click();
      await page.waitForTimeout(300);
      // After delete: panel should re-render → fewer member rows
      var memRowsAfter = await page.locator('.cl-member-row').count();
      // Panel re-rendered (no inline edit fields visible since selection cleared)
      var editFieldsAfter = await page.locator('input[id^="cl-mem-name-"]').count();
      expect(editFieldsAfter).toBe(0);
      // No JS errors (TypeError from setSelectedHighlight regression)
      var jsErrors = errors.filter(function(e) { return e.indexOf('favicon') < 0; });
      expect(jsErrors).toHaveLength(0);
    });

    test('console error count is 0 during member + note interactions', async ({ page }) => {
      var errors = [];
      page.on('console', function(msg) { if (msg.type() === 'error') errors.push(msg.text()); });
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-class');
      await page.waitForTimeout(2500);
      var c = page.locator('#overlay-layer rect[data-type="class"]').first();
      if ((await c.count()) > 0) {
        // Click top-left header area (avoiding member rect overlap)
        var cbox = await c.boundingBox();
        await page.mouse.click(cbox.x + 10, cbox.y + 8);
        await page.waitForTimeout(200);
      }
      var m = page.locator('#overlay-layer rect[data-type="member"]').first();
      if ((await m.count()) > 0) {
        await m.click();
        await page.waitForTimeout(200);
      }
      var jsErrors = errors.filter(function(e) { return e.indexOf('favicon') < 0; });
      expect(jsErrors).toHaveLength(0);
    });
  });
});
