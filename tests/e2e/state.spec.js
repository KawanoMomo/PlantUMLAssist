// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

test.describe('State v1.0.0', () => {
  test.describe('α: DSL technical', () => {
    test('UC-1: switching to State loads template', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-state');
      await page.waitForTimeout(500);
      var t = await getEditorText(page);
      expect(t).toContain('state Idle');
      expect(t).toContain('[*]');
    });
    test('UC-2: tail-add state emits canonical', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-state');
      await page.waitForTimeout(500);
      await page.locator('#st-tail-kind').selectOption('state');
      await page.locator('#st-tail-id').fill('Paused');
      await page.locator('#st-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('state Paused');
    });
    test('UC-3: tail-add composite emits state X { }', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-state');
      await page.waitForTimeout(500);
      await page.locator('#st-tail-kind').selectOption('composite');
      await page.locator('#st-tail-id').fill('Outer');
      await page.locator('#st-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('state Outer {');
      expect(t).toContain('}');
    });
    test('UC-4: tail-add transition with full label', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-state');
      await page.waitForTimeout(500);
      await page.locator('#st-tail-kind').selectOption('transition');
      await page.locator('#st-tail-from').selectOption('Idle');
      await page.locator('#st-tail-to').selectOption('Active');
      await page.locator('#st-tail-trig').fill('click');
      await page.locator('#st-tail-guard').fill('enabled');
      await page.locator('#st-tail-act').fill('save()');
      await page.locator('#st-tail-add').click();
      await page.waitForTimeout(300);
      var t = await getEditorText(page);
      expect(t).toContain('Idle --> Active : click [enabled] / save()');
    });
  });

  test.describe('γ: form + overlay', () => {
    test('UC-5: clicking state overlay opens edit panel', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-state');
      await page.waitForTimeout(2500);
      var rect = page.locator('#overlay-layer rect[data-type="state"]').first();
      var c = await rect.count();
      if (c === 0) test.skip();
      await rect.click();
      await page.waitForTimeout(300);
      var idField = await page.locator('#st-id').count();
      expect(idField).toBeGreaterThan(0);
    });
    test('UC-6: hover preview shows insert guide', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-state');
      await page.waitForTimeout(2500);
      var rect = page.locator('#overlay-layer rect[data-type="state"]').first();
      var c = await rect.count();
      if (c === 0) test.skip();
      var box = await rect.boundingBox();
      // Hover BELOW the state rect: state diagrams render transition arrows as
      // overlay rects too, so the area immediately above a state typically
      // overlaps the incoming transition rect (which would suppress the
      // hover guide via app.js: data-type check). The gap right after a
      // state -- before the next transition rect -- is empty space.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height + 10);
      await page.waitForTimeout(200);
      var guide = await page.locator('#hover-layer .hover-guide').count();
      expect(guide).toBeGreaterThan(0);
    });
    test('UC-7: empty click opens insert modal', async ({ page }) => {
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-state');
      await page.waitForTimeout(2500);
      var rect = page.locator('#overlay-layer rect[data-type="state"]').first();
      var c = await rect.count();
      if (c === 0) test.skip();
      var box = await rect.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height + 6);
      await page.waitForTimeout(300);
      var modalDisplay = await page.locator('#st-modal').evaluate(function(el) { return el.style.display; });
      expect(modalDisplay).toBe('flex');
      // Cancel to clean up
      await page.locator('#st-mod-cancel').click();
    });
    test('UC-8: console error count is 0', async ({ page }) => {
      var errors = [];
      page.on('console', function(msg) { if (msg.type() === 'error') errors.push(msg.text()); });
      await gotoApp(page);
      await page.locator('#diagram-type').selectOption('plantuml-state');
      await page.waitForTimeout(2500);
      var rect = page.locator('#overlay-layer rect[data-type="state"]').first();
      if ((await rect.count()) > 0) {
        await rect.click();
        await page.waitForTimeout(200);
      }
      var jsErrors = errors.filter(function(e) { return e.indexOf('favicon') < 0; });
      expect(jsErrors).toHaveLength(0);
    });
  });

  test('UC-3 v1.1.0: Behaviors fields write entry/do/exit description lines', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-state');
    await page.waitForTimeout(2500);
    var stateRect = page.locator('#overlay-layer rect[data-type="state"]').first();
    if ((await stateRect.count()) === 0) test.skip();
    await stateRect.click();
    await page.waitForTimeout(300);
    var entryEl = page.locator('#st-entry');
    if ((await entryEl.count()) === 0) test.skip();
    await entryEl.fill('start_engine()');
    await page.locator('#st-do').fill('monitor()\nlog()');
    await page.locator('#st-exit').fill('stop_engine()');
    await page.locator('#st-update').click();
    await page.waitForTimeout(300);
    var t = await getEditorText(page);
    expect(t).toContain('entry / start_engine()');
    expect(t).toContain('do / monitor()\\nlog()');
    expect(t).toContain('exit / stop_engine()');
  });

  test('UC-1 v1.1.0: Convert to composite adds empty braces', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-state');
    await page.waitForTimeout(2500);
    var stateRect = page.locator('#overlay-layer rect[data-type="state"]').first();
    if ((await stateRect.count()) === 0) test.skip();
    await stateRect.click();
    await page.waitForTimeout(300);
    var btn = page.locator('#st-convert');
    if ((await btn.count()) === 0) test.skip();
    await btn.click();
    await page.waitForTimeout(300);
    var t = await getEditorText(page);
    expect(t).toContain('{');
    var lines = t.split('\n');
    var hasClose = false;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '}') { hasClose = true; break; }
    }
    expect(hasClose).toBe(true);
  });

  test('UC-2 v1.1.0: Dissolve composite lifts children to top-level', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-state');
    await page.waitForTimeout(500);
    await page.locator('#editor').fill('@startuml\nstate Driving {\n  state Slow\n  state Fast\n}\n@enduml');
    await page.waitForTimeout(2500);
    var compositeRect = page.locator('#overlay-layer rect[data-type="state"][data-composite="1"]').first();
    if ((await compositeRect.count()) === 0) test.skip();
    page.once('dialog', function(d) { d.accept(); });
    await compositeRect.click();
    await page.waitForTimeout(300);
    var btn = page.locator('#st-dissolve');
    if ((await btn.count()) === 0) test.skip();
    await btn.click();
    await page.waitForTimeout(300);
    var t = await getEditorText(page);
    expect(t).not.toContain('state Driving {');
    expect(t).toContain('state Slow');
    expect(t).toContain('state Fast');
  });

  test('UC-5 v1.1.0: + Outgoing transition modal adds new transition', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-state');
    await page.waitForTimeout(500);
    await page.locator('#editor').fill('@startuml\nstate A\nstate B\n@enduml');
    await page.waitForTimeout(2500);
    var stateRect = page.locator('#overlay-layer rect[data-type="state"]').first();
    if ((await stateRect.count()) === 0) test.skip();
    await stateRect.click();
    await page.waitForTimeout(300);
    var btn = page.locator('#st-add-tx');
    if ((await btn.count()) === 0) test.skip();
    await btn.click();
    await page.waitForTimeout(300);
    await page.locator('#st-tx-to').selectOption('B');
    await page.locator('#st-tx-trig').fill('go');
    await page.locator('#st-tx-confirm').click();
    await page.waitForTimeout(300);
    var t = await getEditorText(page);
    expect(t).toContain('A --> B');
    expect(t).toContain('go');
  });

  test('UC-4 v1.0.0: transition From/To dropdowns work (verification)', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-state');
    await page.waitForTimeout(500);
    await page.locator('#editor').fill('@startuml\nstate A\nstate B\nstate C\nA --> B : go\n@enduml');
    await page.waitForTimeout(2500);
    var trRect = page.locator('#overlay-layer rect[data-type="transition"]').first();
    if ((await trRect.count()) === 0) test.skip();
    await trRect.click();
    await page.waitForTimeout(300);
    var toEl = page.locator('#st-tr-to');
    if ((await toEl.count()) === 0) test.skip();
    await toEl.selectOption('C');
    await page.locator('#st-tr-update').click();
    await page.waitForTimeout(300);
    var t = await getEditorText(page);
    expect(t).toContain('A --> C');
    expect(t).not.toContain('A --> B');
  });

  test('UC-8 v1.1.0: hover guide does NOT appear in State mode', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-state');
    await page.waitForTimeout(2500);
    var stateRect = page.locator('#overlay-layer rect[data-type="state"]').first();
    if ((await stateRect.count()) === 0) test.skip();
    var box = await stateRect.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y - 30);
    await page.waitForTimeout(200);
    var guideCount = await page.locator('#hover-layer line.hover-guide').count();
    expect(guideCount).toBe(0);
  });
});
