// @ts-check
// TICKET-owner-20261122-0840-1: 上部バーの Import ▾ をマウスで開くと Esc で閉じなかった
//   (Esc を受けるのがメニューの中の keydown だけで、マウスで開いた直後の手は #btn-import にある)。
// 期待 (principles.md「窓とメニューはどれも Esc で閉じる」「同じ操作は同じ語・同じ場所」):
//   (1) 実マウスで Import ▾ を押す → Esc 1 回で #import-menu が閉じ、手は #btn-import に戻る
//   (2) キーで開いた (Enter) ときも同じ
//   (3) Export ▾ とツール ▾ も実マウスで開いて Esc 1 回で閉じる
//   どの手順でも本文は変わらず、図は描けたまま
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

const DSL = ['@startuml', 'participant Sensor', 'participant Driver',
  'Sensor -> Driver : irq', '@enduml'].join('\n');

async function mouseClick(page, selector) {
  const el = page.locator(selector);
  await expect(el).toBeVisible();
  const box = await el.boundingBox();
  if (!box) throw new Error('not found: ' + selector);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test('owner 0840 Import ▾ はマウスで開いても Esc 1 回で閉じ、手は Import ▾ に戻る。Export ▾・ツール ▾ も Esc で閉じる', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  await H.bootWith(page, DSL);
  await H.waitDrawn(page, ['irq']);
  const before = await H.getEditorText(page);
  const importMenu = page.locator('#import-menu');
  const activeId = () => page.evaluate(() => document.activeElement && document.activeElement.id);

  // (1) 実マウスで Import ▾ → Esc。
  await mouseClick(page, '#btn-import');
  await expect(importMenu).toHaveClass(/\bopen\b/);
  await expect(page.locator('#btn-import')).toHaveAttribute('aria-expanded', 'true');
  await page.screenshot({ path: testInfo.outputPath('import-open.png') });
  await page.keyboard.press('Escape');
  await expect(importMenu).not.toHaveClass(/\bopen\b/);
  await expect(importMenu).toBeHidden();
  await expect(page.locator('#btn-import')).toHaveAttribute('aria-expanded', 'false');
  expect(await activeId()).toBe('btn-import');

  // (2) キーで開いても同じ (手は Import ▾ のボタンにある)。
  await page.keyboard.press('Enter');
  await expect(importMenu).toHaveClass(/\bopen\b/);
  await page.keyboard.press('Escape');
  await expect(importMenu).toBeHidden();
  expect(await activeId()).toBe('btn-import');

  // (3) Export ▾ も実マウスで開いて Esc 1 回で閉じる。
  const exportMenu = page.locator('#export-menu');
  await mouseClick(page, '#btn-export');
  await expect(exportMenu).toHaveClass(/\bopen\b/);
  await page.keyboard.press('Escape');
  await expect(exportMenu).not.toHaveClass(/\bopen\b/);
  await expect(importMenu).toBeHidden();

  // ツール ▾ (畳み方で出る方のボタン) も実マウスで開いて Esc 1 回で閉じる。
  const toolBtn = (await page.locator('#btn-tab-tools').isVisible()) ? '#btn-tab-tools' : '#btn-tab-tools-mini';
  await mouseClick(page, toolBtn);
  const toolMenu = page.locator('#tool-menu');
  await expect(toolMenu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toolMenu).toBeHidden();

  // どれも本文は変えず、図は描けたまま。
  expect(await H.getEditorText(page)).toBe(before);
  await H.expectRendered(page);
  expect(errors, errors.join('\n')).toEqual([]);
});
