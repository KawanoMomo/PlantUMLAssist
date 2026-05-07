// @ts-check
// userissue v1.2.3: lifeline 選択は actor head と分離。 lifeline 選択 →
// 「✕ activation を全削除」で対象 participant の activate/deactivate 行のみ
// 一括削除し、 participant 宣言・メッセージ・他 participant の activation は
// 残ること。
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
  'title Lifeline Test',
  'actor User',
  'participant System',
  'database DB',
  '',
  'User -> System : Request',
  'activate System',
  'System -> DB : Query',
  'activate DB',
  'DB --> System : Result',
  'deactivate DB',
  'System --> User : Response',
  'deactivate System',
  '@enduml',
].join('\n');

test.describe('lifeline select-and-delete (userissue v1.2.3)', () => {
  test('lifeline rect uses data-type="lifeline" not "participant"', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    await setEditor(page, FIXTURE);
    var counts = await page.evaluate(() => {
      var ll = document.querySelectorAll('#overlay-layer rect[data-type="lifeline"]').length;
      var pp = document.querySelectorAll('#overlay-layer rect[data-type="participant"]').length;
      return { lifeline: ll, participant: pp };
    });
    // 3 participants → 3 lifeline rects + 6 participant rects (head + tail per id)
    expect(counts.lifeline).toBe(3);
    expect(counts.participant).toBe(6);
  });

  test('clicking lifeline shows lifeline panel (not actor edit form)', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    await setEditor(page, FIXTURE);
    await page.evaluate(() => {
      var r = document.querySelector('#overlay-layer rect[data-type="lifeline"][data-id="System"]');
      r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    var panel = await page.locator('#props-content').innerText();
    expect(panel).toContain('ライフライン');
    expect(panel).toContain('activation を全削除');
    // Should NOT show the actor-edit fields
    expect(panel).not.toContain('Alias 変更時');
  });

  test('lifeline ✕ button removes only activations for that id', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    await setEditor(page, FIXTURE);
    await page.evaluate(() => {
      var r = document.querySelector('#overlay-layer rect[data-type="lifeline"][data-id="System"]');
      r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    await page.locator('#seq-lifeline-delete-acts').click();
    await page.waitForTimeout(800);
    var t = await getEditorText(page);
    // System's activations gone
    expect(t).not.toContain('activate System');
    expect(t).not.toContain('deactivate System');
    // DB's activations preserved
    expect(t).toContain('activate DB');
    expect(t).toContain('deactivate DB');
    // Participant declarations preserved
    expect(t).toContain('actor User');
    expect(t).toContain('participant System');
    expect(t).toContain('database DB');
    // Messages preserved
    expect(t).toContain('User -> System : Request');
    expect(t).toContain('System -> DB : Query');
  });

  test('clicking actor head shows participant edit form (not lifeline panel)', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    await setEditor(page, FIXTURE);
    await page.evaluate(() => {
      // Click the head rect (smallest height — head, not lifeline)
      var rects = document.querySelectorAll('#overlay-layer rect[data-type="participant"][data-id="User"]');
      var smallest = Array.from(rects).sort((a, b) => parseFloat(a.getAttribute('height')) - parseFloat(b.getAttribute('height')))[0];
      smallest.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    var panel = await page.locator('#props-content').innerText();
    expect(panel).toContain('Alias');  // participant edit form has Alias field
    expect(panel).not.toContain('activation を全削除');
  });

  test('VISUAL: lifeline → activation delete screenshots', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await gotoApp(page);
    await setEditor(page, FIXTURE);
    await page.screenshot({
      path: path.join(__dirname, '../../.investigation/lifeline-v2-01-fixture.png'),
      fullPage: true,
    });
    await page.evaluate(() => {
      var r = document.querySelector('#overlay-layer rect[data-type="lifeline"][data-id="System"]');
      r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(__dirname, '../../.investigation/lifeline-v2-02-selected.png'),
      fullPage: true,
    });
    await page.locator('#seq-lifeline-delete-acts').click();
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(__dirname, '../../.investigation/lifeline-v2-03-after-delete.png'),
      fullPage: true,
    });
  });
});
