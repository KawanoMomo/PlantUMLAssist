// @ts-check
// BLK-primary-20260908-1103-wish 要修正のみ表示 — 変更サマリボードは済/要修正の印付き行が
// 全部並ぶだけで、引き継ぎで新人に渡す「今すぐ手を付ける行」を選り分けられない。
// [要修正のみ] で印の付いた行だけに絞れるようにする。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const BEFORE = ['@startuml', 'class Adc_Driver {', '  Adc_Init()', '}', '@enduml'].join('\n');
const AFTER = ['@startuml', 'class Adc_Driver {', '  Adc_Init()', '  Adc_Ack()', '  Adc_Stop()', '}', '@enduml'].join('\n');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(600);
}

async function openBoardWithTwoAddedRows(page) {
  await gotoApp(page);
  await page.evaluate(() => {
    try { window.localStorage.clear(); } catch (e) {}
    var ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), 'Adc_Driver');
  });
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(400);
  await setDsl(page, BEFORE);
  await page.evaluate(() => window.MA.saveDiff.markAll(window.MA.workspace.list()));
  await setDsl(page, AFTER);
  await page.locator('#btn-tab-board').click();
  await expect(page.locator('#cb-modal')).toBeVisible();
}

test.describe('BLK-primary-1103-wish 要修正のみに絞る', () => {
  test('[要修正のみ] は印の付いた行だけを残す', async ({ page }) => {
    await openBoardWithTwoAddedRows(page);
    const rows = page.locator('#cb-body table.cb-diff tr.cb-add');
    await expect(rows).toHaveCount(2);

    // 1 行目を「要修正」、2 行目を「済」にする
    await rows.nth(0).locator('td.cb-verdict button[data-verdict="要修正"]').click();
    await page.locator('#cb-body table.cb-diff tr.cb-add').nth(1)
      .locator('td.cb-verdict button[data-verdict="済"]').click();

    await page.locator('#cb-fixonly').check();
    const left = page.locator('#cb-body table.cb-diff tr.cb-add');
    await expect(left).toHaveCount(1);
    await expect(left.first()).toContainText('Adc_Ack()');
    await expect(page.locator('#cb-body')).not.toContainText('Adc_Stop()');
  });

  test('絞り込み中は残った行数と枚数が見出しに出る', async ({ page }) => {
    await openBoardWithTwoAddedRows(page);
    const rows = page.locator('#cb-body table.cb-diff tr.cb-add');
    await rows.nth(0).locator('td.cb-verdict button[data-verdict="要修正"]').click();

    await page.locator('#cb-fixonly').check();
    await expect(page.locator('#cb-filter-state')).toHaveText('要修正のみ 1 行 / 1 枚');
    await expect(page.locator('#cb-body .cb-count').first()).toHaveText('要修正 1 行');
  });

  test('印が 1 つも無ければ、その旨と印の付け方が出る', async ({ page }) => {
    await openBoardWithTwoAddedRows(page);
    await page.locator('#cb-fixonly').check();
    await expect(page.locator('#cb-body .cb-empty')).toContainText('要修正の印が付いた行はありません');
    await expect(page.locator('#cb-body table.cb-diff')).toHaveCount(0);
  });

  test('絞り込みを外すと元の全行に戻る (印は消えない)', async ({ page }) => {
    await openBoardWithTwoAddedRows(page);
    await page.locator('#cb-body table.cb-diff tr.cb-add').nth(0)
      .locator('td.cb-verdict button[data-verdict="要修正"]').click();

    await page.locator('#cb-fixonly').check();
    await expect(page.locator('#cb-body table.cb-diff tr.cb-add')).toHaveCount(1);

    await page.locator('#cb-fixonly').uncheck();
    await expect(page.locator('#cb-body table.cb-diff tr.cb-add')).toHaveCount(2);
    await expect(page.locator('#cb-filter-state')).toHaveText('');
    await expect(page.locator('#cb-body table.cb-diff tr.cb-add').nth(0)
      .locator('button[data-verdict="要修正"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('絞り込んだままでも印を外せ、外した行はその場で消える', async ({ page }) => {
    await openBoardWithTwoAddedRows(page);
    await page.locator('#cb-body table.cb-diff tr.cb-add').nth(0)
      .locator('td.cb-verdict button[data-verdict="要修正"]').click();
    await page.locator('#cb-fixonly').check();
    await expect(page.locator('#cb-body table.cb-diff tr.cb-add')).toHaveCount(1);

    await page.locator('#cb-body table.cb-diff tr.cb-add').first()
      .locator('button[data-verdict="要修正"]').click();
    await expect(page.locator('#cb-body .cb-empty')).toContainText('要修正の印が付いた行はありません');
  });
});
