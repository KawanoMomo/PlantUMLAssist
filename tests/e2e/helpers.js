// @ts-check
const fs = require('fs');
const path = require('path');

async function gotoApp(page) {
  await page.goto('/');
  // BLK-builder-20260908-0744-2-red: no hard-coded cap here. 5s was shorter than
  // the time a page load can legitimately take while other workers are rendering,
  // so the app opening a little late failed the test before it had begun.
  // The suite-wide `timeout` in playwright.config.js is the budget that matters.
  await page.waitForSelector('#preview-svg');
  // local (Java) で描画する。online は DSL を plantuml.com へ送るため使わない。
  await page.evaluate(() => {
    var sel = document.getElementById('render-mode');
    if (sel && sel.value !== 'local') {
      sel.value = 'local';
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


// design 2b: Title は無選択ペインではなく「図の設定」タブが持つ。
// 図のタイトルを入れて、Properties タブに戻る。
async function setDiagramTitle(page, title) {
  await page.locator('#props-tab-settings').click();
  await page.locator('#ds-title').fill(title);
  await page.locator('#ds-title').dispatchEvent('change');
  await page.waitForTimeout(500);
  await page.locator('#props-tab-props').click();
  await page.waitForTimeout(200);
}

module.exports = { gotoApp, loadFixture, getEditorText, getEditorLine, clickOverlayByLine, setDiagramTitle };
