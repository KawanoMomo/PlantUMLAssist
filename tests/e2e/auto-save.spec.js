// @ts-check
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

async function clearAutoSave(page) {
  await page.evaluate(() => {
    Object.keys(localStorage).forEach(function(k) {
      if (k.indexOf('plantuml-autosave-') === 0 || k === 'plantuml-diagram-type') localStorage.removeItem(k);
    });
  });
}

test.describe('Auto-save (v1.2.0)', () => {
  test('UC-as-1: edit → reload → confirm OK → DSL restored (cross-type round-trip)', async ({ page }) => {
    await gotoApp(page);
    await clearAutoSave(page);
    await page.reload();
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    // Switch to state mode (so we prove the cross-type round-trip)
    await page.locator('#diagram-type').selectOption('plantuml-state');
    await page.waitForTimeout(500);
    // Edit DSL
    await page.locator('#editor').fill('@startuml\nstate Marker_AAA\n@enduml');
    await page.waitForTimeout(1500);
    // Reload — confirm dialog appears in state mode (the persisted type
    // selection survives the reload).
    page.once('dialog', async (d) => { await d.accept(); });
    await page.reload();
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    // Page must boot in state mode + restore the state DSL
    var t = await getEditorText(page);
    expect(t).toContain('state Marker_AAA');
    var activeType = await page.locator('#diagram-type').inputValue();
    expect(activeType).toBe('plantuml-state');
  });

  test('UC-as-2: per-type isolation across diagram switches', async ({ page }) => {
    await gotoApp(page);
    await clearAutoSave(page);
    await page.reload();
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    // Edit state
    await page.locator('#diagram-type').selectOption('plantuml-state');
    await page.waitForTimeout(500);
    await page.locator('#editor').fill('@startuml\nstate STATE_MARKER\n@enduml');
    await page.waitForTimeout(1500);
    // Switch to class — should NOT show state DSL
    await page.locator('#diagram-type').selectOption('plantuml-class');
    await page.waitForTimeout(500);
    var classText = await getEditorText(page);
    expect(classText).not.toContain('STATE_MARKER');
    await page.locator('#editor').fill('@startuml\nclass CLASS_MARKER\n@enduml');
    await page.waitForTimeout(1500);
    // Switch back to state — state's edited DSL must come back
    await page.locator('#diagram-type').selectOption('plantuml-state');
    await page.waitForTimeout(500);
    var stateText = await getEditorText(page);
    expect(stateText).toContain('STATE_MARKER');
    expect(stateText).not.toContain('CLASS_MARKER');
  });

  test('UC-as-3: settings modal → restoreMode=none → reload does not restore', async ({ page }) => {
    await gotoApp(page);
    await clearAutoSave(page);
    await page.reload();
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    // Set restore mode to "none"
    await page.locator('#btn-config').click();
    await page.locator('#cfg-modal input[name="cfg-restore-mode"][value="none"]').check();
    await page.locator('#cfg-ok').click();
    // Edit
    await page.locator('#editor').fill('@startuml\nactor SHOULD_NOT_RESTORE\n@enduml');
    await page.waitForTimeout(1500);
    // Reload — expect NO confirm dialog and template to load
    var dialogShown = false;
    page.on('dialog', async (d) => { dialogShown = true; await d.dismiss(); });
    await page.reload();
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    expect(dialogShown).toBe(false);
    var t = await getEditorText(page);
    expect(t).not.toContain('SHOULD_NOT_RESTORE');
  });

  test('UC-as-4: clear-all wipes saved DSL', async ({ page }) => {
    await gotoApp(page);
    await clearAutoSave(page);
    await page.reload();
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await page.locator('#editor').fill('@startuml\nactor MARKER_X\n@enduml');
    await page.waitForTimeout(1500);
    // Settings → clear all
    await page.locator('#btn-config').click();
    page.once('dialog', async (d) => { await d.accept(); });
    await page.locator('#cfg-clear-all').click();
    await page.locator('#cfg-ok').click();
    // Verify localStorage cleared (dsl-* keys gone)
    var hasDsl = await page.evaluate(() => {
      return Object.keys(localStorage).some(function(k) { return k.indexOf('plantuml-autosave-dsl-') === 0; });
    });
    expect(hasDsl).toBe(false);
  });

  test('UC-as-5: status bar 💾 indicator updates after edit', async ({ page }) => {
    await gotoApp(page);
    await clearAutoSave(page);
    await page.reload();
    await page.waitForSelector('#preview-svg', { timeout: 5000 });
    await page.locator('#editor').fill('@startuml\nactor IND\n@enduml');
    await page.waitForTimeout(1500);
    var ind = await page.locator('#status-autosave').textContent();
    expect(ind || '').toContain('💾');
  });
});
