// @ts-check
const fs = require('fs');
const path = require('path');

async function gotoApp(page) {
  await page.goto('/');
  await page.waitForSelector('#preview-svg', { timeout: 5000 });
  // Prefer online render so overlays build even without Java installed.
  // Tests that don't need overlay (UC-1) are unaffected.
  await page.evaluate(() => {
    var sel = document.getElementById('render-mode');
    if (sel && sel.value !== 'online') {
      sel.value = 'online';
      sel.dispatchEvent(new Event('change'));
    }
  });
  await page.waitForTimeout(500);
}

async function loadFixture(page, fixtureName) {
  var dsl = fs.readFileSync(path.join(__dirname, '../fixtures/dsl/', fixtureName), 'utf8');
  await page.evaluate((text) => {
    var ed = document.getElementById('editor');
    ed.value = text;
    ed.dispatchEvent(new Event('input'));
  }, dsl);
  await page.waitForTimeout(500);
}

async function getEditorText(page) {
  return page.locator('#editor').inputValue();
}

async function getEditorLine(page, lineNum) {
  var t = await getEditorText(page);
  return t.split('\n')[lineNum - 1];
}

async function clickOverlayByLine(page, line) {
  await page.locator('#overlay-layer rect[data-line="' + line + '"]').first().click();
}

module.exports = { gotoApp, loadFixture, getEditorText, getEditorLine, clickOverlayByLine };
