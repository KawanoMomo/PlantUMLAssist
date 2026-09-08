// @ts-check
// BLK-builder-20260907-1324-3 (design 4b「Activity — 途中に挿入」):
// フローの隙間をクリックすると小さなメニューが開き、そこに置けるものだけが並ぶ。
// 今までは Action のフォームが直接開き、if を入れるには種類セレクトを開き直していた。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

const SAMPLE = [
  '@startuml',
  'title Sample Activity',
  'start',
  ':入力を受け取る;',
  'if (有効?) then (yes)',
  ':保存する;',
  'else (no)',
  ':エラーを返す;',
  'endif',
  'stop',
  '@enduml',
].join('\n');

async function openActivity(page, dsl) {
  await gotoApp(page);
  await page.evaluate(() => {
    const sel = /** @type {HTMLSelectElement} */ (document.getElementById('diagram-type'));
    sel.value = 'plantuml-activity';
    sel.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(500);
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, dsl);
  await page.waitForTimeout(1200);
}

// 図のいちばん下 (stop の少し上) の隙間をクリックする。
async function clickGap(page) {
  await page.evaluate(() => {
    const overlay = document.getElementById('overlay-layer');
    const container = document.getElementById('preview-container');
    const r = overlay.getBoundingClientRect();
    const cx = r.left + 12;              // 図形の外れ (左端) を狙う
    const cy = r.top + r.height / 2;
    container.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: cx, clientY: cy }));
  });
  await page.waitForTimeout(400);
}

test.describe('BLK-builder-1324 Activity の挿入メニュー', () => {
  test.beforeEach(async ({ page }) => {
    await openActivity(page, SAMPLE);
  });

  test('隙間クリックで「＋ ここに挿入」メニューが開き、置ける 6 種が並ぶ', async ({ page }) => {
    await clickGap(page);
    await expect(page.locator('#act-modal')).toBeVisible();
    for (const kind of ['action', 'if', 'while', 'fork', 'note', 'swimlane']) {
      await expect(page.locator('#act-pick-' + kind)).toBeVisible();
    }
    // 挿入先が本文つきで示される
    const target = await page.locator('#act-pick-target').textContent();
    expect(target).toMatch(/\d+ 行目/);
  });

  test('その他を開くと repeat / break / detach / kill が出て、戻れる', async ({ page }) => {
    await clickGap(page);
    await page.locator('#act-pick-other').click();
    for (const kind of ['repeat', 'break', 'detach', 'kill']) {
      await expect(page.locator('#act-pick-' + kind)).toBeVisible();
    }
    await page.locator('#act-pick-back').click();
    await expect(page.locator('#act-pick-action')).toBeVisible();
  });

  test('if を選ぶと種類 if のフォームが開き、if / else / endif が対で入る', async ({ page }) => {
    const before = await getEditorText(page);
    await clickGap(page);
    await page.locator('#act-pick-if').click();
    await expect(page.locator('#act-mod-kind')).toHaveValue('if');
    await page.locator('#act-mod-cond').fill('再送する?');
    await page.locator('#act-mod-confirm').click();
    await page.waitForTimeout(800);
    const after = await getEditorText(page);
    expect(after).not.toBe(before);
    expect(after).toContain('再送する?');
    expect(after.split('\n').filter((l) => l.trim() === 'endif').length).toBe(2);
  });

  test('入力の要らない detach はメニューから 1 クリックで入る', async ({ page }) => {
    await clickGap(page);
    await page.locator('#act-pick-other').click();
    await page.locator('#act-pick-detach').click();
    await page.waitForTimeout(800);
    await expect(page.locator('#act-modal')).toBeHidden();
    const after = await getEditorText(page);
    expect(after).toMatch(/^\s*detach\s*$/m);
  });

  test('キャンセルすると DSL は変わらない', async ({ page }) => {
    const before = await getEditorText(page);
    await clickGap(page);
    await page.locator('#act-pick-cancel').click();
    await expect(page.locator('#act-modal')).toBeHidden();
    expect(await getEditorText(page)).toBe(before);
  });
});
