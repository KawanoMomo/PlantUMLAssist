// @ts-check
// userissue v1.2.6: activation を 1 行ずつ選択して削除できるようにする。
// PlantUML SVG では activation バーに class が付かず overlay click できないため、
// lifeline panel 内に行ごとリスト + 個別 ✕ 削除を追加した。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');
const path = require('path');

async function setEditor(page, text) {
  await page.evaluate((t) => {
    var ed = document.getElementById('editor');
    ed.value = t;
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await page.waitForTimeout(800);
}

const FIXTURE = [
  '@startuml',
  'title Activation Test',
  'actor User',
  'participant System',
  '',
  'User -> System : First',
  'activate System',          // L7 — first activate
  'System --> User : Resp1',
  'deactivate System',        // L9 — first deactivate
  'User -> System : Second',
  'activate System',          // L11 — second activate
  'System --> User : Resp2',
  'deactivate System',        // L13 — second deactivate
  '@enduml',
].join('\n');

test.describe('per-activation delete (userissue v1.2.6)', () => {
  test('lifeline panel lists each activation row with individual ✕', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    await setEditor(page, FIXTURE);
    await page.evaluate(() => {
      var r = document.querySelector('#overlay-layer rect[data-type="lifeline"][data-id="System"]');
      r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    // 4 individual delete buttons should be present (2 activate + 2 deactivate)
    const oneButtons = page.locator('.seq-lifeline-delete-one');
    await expect(oneButtons).toHaveCount(4);
    // The list should show line numbers L7, L9, L11, L13
    const panelText = await page.locator('#props-content').innerText();
    expect(panelText).toContain('L7');
    expect(panelText).toContain('L9');
    expect(panelText).toContain('L11');
    expect(panelText).toContain('L13');
  });

  test('clicking ✕ on one row deletes only that line', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    await setEditor(page, FIXTURE);
    await page.evaluate(() => {
      var r = document.querySelector('#overlay-layer rect[data-type="lifeline"][data-id="System"]');
      r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    // Click ✕ on the FIRST activate (L7)
    await page.locator('.seq-lifeline-delete-one[data-line="7"]').click();
    await page.waitForTimeout(500);
    var t = await getEditorText(page);
    var lines = t.split('\n');
    var activateCount = lines.filter(l => /^\s*activate\s+System/.test(l)).length;
    var deactivateCount = lines.filter(l => /^\s*deactivate\s+System/.test(l)).length;
    // Removed exactly the first activate; the rest is intact
    expect(activateCount).toBe(1);
    expect(deactivateCount).toBe(2);
    // Messages still all present
    expect(t).toContain('User -> System : First');
    expect(t).toContain('User -> System : Second');
    expect(t).toContain('System --> User : Resp1');
    expect(t).toContain('System --> User : Resp2');
    expect(t).toContain('actor User');
    expect(t).toContain('participant System');
  });

  test('全削除 button still wipes all activations for the participant', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    await setEditor(page, FIXTURE);
    await page.evaluate(() => {
      var r = document.querySelector('#overlay-layer rect[data-type="lifeline"][data-id="System"]');
      r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    await page.locator('#seq-lifeline-delete-acts').click();
    await page.waitForTimeout(500);
    var t = await getEditorText(page);
    expect(t).not.toContain('activate System');
    expect(t).not.toContain('deactivate System');
  });

  test('VISUAL: per-row delete UI screenshots', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    await setEditor(page, FIXTURE);
    await page.evaluate(() => {
      var r = document.querySelector('#overlay-layer rect[data-type="lifeline"][data-id="System"]');
      r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(__dirname, '../../.investigation/activation-list-01-panel.png'),
      fullPage: true,
    });
    // Delete just the SECOND activate (L11 → SVG should still show 1st bar)
    await page.locator('.seq-lifeline-delete-one[data-line="11"]').click();
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(__dirname, '../../.investigation/activation-list-02-after-one-delete.png'),
      fullPage: true,
    });
  });
});
