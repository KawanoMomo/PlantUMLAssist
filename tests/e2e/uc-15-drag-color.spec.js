const { test, expect } = require('@playwright/test');
const { gotoApp, loadFixture, getEditorText, clickOverlayByLine } = require('./helpers');

test.describe('UC-15: drag reorder + color', () => {
  test('color palette swatch applies #HEX to participant', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);

    await clickOverlayByLine(page, 3);  // participant System (L3 in sequence-basic.puml)
    await page.waitForTimeout(400);

    await page.locator('.seq-color-swatch[data-color="#FFAAAA"]').click();
    await page.waitForTimeout(500);

    var t = await getEditorText(page);
    expect(t).toContain('participant System #FFAAAA');
  });

  test('moveParticipant (direct API call) reorders DSL', async ({ page }) => {
    await gotoApp(page);
    await loadFixture(page, 'sequence-basic.puml');
    await page.waitForTimeout(1500);

    var result = await page.evaluate(() => {
      var seq = window.MA.modules.plantumlSequence;
      var ed = document.getElementById('editor');
      var newText = seq.moveParticipant(ed.value, 'DB', 0);
      ed.value = newText;
      ed.dispatchEvent(new Event('input'));
      return newText;
    });
    await page.waitForTimeout(500);

    var lines = result.split('\n');
    var dbIdx = lines.findIndex(function(l) { return l.indexOf('DB') >= 0 && (l.indexOf('database') === 0 || l.indexOf('participant') === 0 || l.indexOf('actor') === 0); });
    var sysIdx = lines.findIndex(function(l) { return l.indexOf('participant System') === 0; });
    expect(dbIdx).toBeGreaterThanOrEqual(0);
    expect(sysIdx).toBeGreaterThanOrEqual(0);
    expect(dbIdx).toBeLessThan(sysIdx);
  });
});
