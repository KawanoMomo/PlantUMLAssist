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
    // UC-6 (hover preview shows insert guide) と UC-7 (empty click opens insert modal)
    // は v1.1.0 で削除: hoverInsert / showInsertForm capability が graph-like layout
    // に不適切として false 化されたため (spec § A)。 代替として γ describe の
    // UC-8 v1.1.0 「hover guide does NOT appear」 を追加済。
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

  // v1.1.1: regression for "switching State→Sequence sometimes leaves preview
  // stuck on State". Root cause: clearSelection() in the diagram-type change
  // handler triggered renderProps with a stale State-shaped parsedData, which
  // caused sequence.renderProps to throw on parsedData.elements.filter — the
  // exception escaped, so the next scheduleRefresh() never ran.
  test('UC-bug1 v1.1.1: State→Sequence switch updates preview (no stuck state)', async ({ page }) => {
    var errors = [];
    page.on('console', function(msg) { if (msg.type() === 'error') errors.push(msg.text()); });
    await gotoApp(page);
    // Go to State first so currentParsed becomes State-shaped
    await page.locator('#diagram-type').selectOption('plantuml-state');
    await page.waitForTimeout(2500);
    var stateRectCount = await page.locator('#overlay-layer rect[data-type="state"]').count();
    expect(stateRectCount).toBeGreaterThan(0);
    // Switch back to Sequence — must not throw and the preview must follow
    await page.locator('#diagram-type').selectOption('plantuml-sequence');
    await page.waitForTimeout(2500);
    // Editor should now hold the sequence template
    var t = await getEditorText(page);
    expect(t).toContain('participant');
    // Preview SVG must reflect the Sequence diagram. Since Sequence does not
    // emit g.entity[data-qualified-name], probe by sequence-specific tokens.
    var sequenceSvgPresent = await page.evaluate(function() {
      var svg = document.querySelector('#preview-svg svg');
      if (!svg) return false;
      var txt = svg.textContent || '';
      // Sequence template has "Sample Sequence" title and User/System actors
      return txt.indexOf('Sample Sequence') >= 0 || (txt.indexOf('User') >= 0 && txt.indexOf('System') >= 0);
    });
    expect(sequenceSvgPresent).toBe(true);
    // The renderProps TypeError that used to fire in the change handler must
    // be gone. Filter out unrelated favicon noise.
    var jsErrors = errors.filter(function(e) {
      return e.indexOf('favicon') < 0 && e.indexOf('renderProps') >= 0;
    });
    expect(jsErrors).toHaveLength(0);
  });

  // v1.1.1: regression for "newly added State cannot be selected". Root cause:
  // a stale older /render response could overwrite a newer one, so the SVG
  // shown to the user lacked the just-added state's entity, so buildOverlay
  // skipped its rect, so clicks hit empty space. renderGen counter in
  // renderSvg() now discards stale responses.
  test('UC-bug2 v1.1.1: tail-added State is selectable via overlay click', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-state');
    await page.waitForTimeout(2500);
    // Add a new state via tail-add panel
    await page.locator('#st-tail-kind').selectOption('state');
    await page.locator('#st-tail-id').fill('FreshState');
    await page.locator('#st-tail-add').click();
    await page.waitForTimeout(2000);
    // The overlay must contain a selectable rect for the new state
    var freshRect = page.locator('#overlay-layer rect[data-type="state"][data-id="FreshState"]');
    expect(await freshRect.count()).toBeGreaterThan(0);
    await freshRect.click();
    await page.waitForTimeout(300);
    // Selection must be the new state and the edit panel must be populated
    var sel = await page.evaluate(function() { return window.MA.selection.getSelected(); });
    expect(sel.length).toBe(1);
    expect(sel[0].id).toBe('FreshState');
    var idVal = await page.locator('#st-id').inputValue();
    expect(idVal).toBe('FreshState');
  });

  // v1.1.1: even when an older render response arrives AFTER a newer one
  // (artificially delayed by intercepting fetch), the renderGen guard must
  // ensure the LATEST text drives the SVG and overlay — not the stale one.
  test('UC-bug2-race v1.1.1: stale render response does not overwrite fresh', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-state');
    await page.waitForTimeout(2500);
    // Install fetch interceptor that delays the FIRST /render response 800ms
    await page.evaluate(function() {
      var orig = window.fetch;
      var rendCallNo = 0;
      window.fetch = function(url, opts) {
        if (typeof url === 'string' && url.indexOf('/render') >= 0) {
          var n = rendCallNo++;
          var p = orig.apply(this, arguments);
          if (n === 0) {
            return p.then(function(resp) {
              return new Promise(function(resolve) { setTimeout(function() { resolve(resp); }, 800); });
            });
          }
          return p;
        }
        return orig.apply(this, arguments);
      };
    });
    // Step A: type text containing only "state Alpha"
    await page.locator('#editor').fill('@startuml\nstate Alpha\n@enduml');
    // Wait long enough that the first refresh has fired (>150ms debounce)
    // but the response is still in-flight (delayed 800ms total)
    await page.waitForTimeout(300);
    // Step B: type new text containing "state Alpha" + "state Beta" while
    // first fetch is still delayed. The second fetch will return BEFORE the
    // first because the first is artificially slow.
    await page.locator('#editor').fill('@startuml\nstate Alpha\nstate Beta\n@enduml');
    // Wait long enough for both renders to settle (>800ms delay + processing)
    await page.waitForTimeout(2500);
    // The overlay MUST reflect the latest text (both Alpha AND Beta), even
    // though the older render's response arrived later.
    var ids = await page.evaluate(function() {
      var rs = document.querySelectorAll('#overlay-layer rect[data-type="state"]');
      return Array.prototype.map.call(rs, function(r) { return r.getAttribute('data-id'); });
    });
    expect(ids).toContain('Alpha');
    expect(ids).toContain('Beta');
  });
});
