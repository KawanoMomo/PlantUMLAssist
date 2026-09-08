// @ts-check
// BLK-primary-20260908-0823-wish レビュー結果 — 会議で出た「この行は OK」「ここは直して」を
// 変更サマリボードの差分行に付けて残し、次にその図を開いた人に帯で出す。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const BEFORE = ['@startuml', 'class Adc_Driver {', '  Adc_Init()', '}', '@enduml'].join('\n');
const AFTER = ['@startuml', 'class Adc_Driver {', '  Adc_Init()', '  Adc_Ack()', '}', '@enduml'].join('\n');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(600);
}

// Adc_Driver を 1 枚開き、変更前を基準にしてから Adc_Ack() を足す。
async function openChangedDiagram(page) {
  await gotoApp(page);
  await page.evaluate(() => {
    var ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), 'Adc_Driver');
  });
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(400);
  await setDsl(page, BEFORE);
  await page.evaluate(() => window.MA.saveDiff.markAll(window.MA.workspace.list()));
  await setDsl(page, AFTER);
}

// 追加された Adc_Ack() の行 (印を付ける対象)。
function addedRow(page) {
  return page.locator('#cb-body table.cb-diff tr.cb-add').first();
}

test.describe('BLK-primary-0823-wish 差分行のレビュー結果', () => {
  // 最初の 1 回だけ空にする。reload しても印が残ることを見るテストがあるので、
  // 読み込みのたびに消すと確かめたいものが消える (sessionStorage は reload で残る)。
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        if (!window.sessionStorage.getItem('e2e-cleared')) {
          window.localStorage.clear();
          window.sessionStorage.setItem('e2e-cleared', '1');
        }
      } catch (e) {}
    });
  });

  test('差分行に「済」「要修正」が並び、押すと印が残る', async ({ page }) => {
    await openChangedDiagram(page);
    await page.locator('#btn-tab-board').click();
    await expect(page.locator('#cb-modal')).toBeVisible();

    const row = addedRow(page);
    await expect(row.locator('td.cb-verdict button')).toHaveCount(2);
    await row.locator('td.cb-verdict button[data-verdict="要修正"]').click();

    await expect(addedRow(page)).toHaveAttribute('data-verdict', '要修正');
    await expect(addedRow(page).locator('button[data-verdict="要修正"]'))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#cb-summary')).toContainText('要修正 1 件');
  });

  test('同じ印をもう一度押すと外れる', async ({ page }) => {
    await openChangedDiagram(page);
    await page.locator('#btn-tab-board').click();
    await addedRow(page).locator('button[data-verdict="済"]').click();
    await expect(addedRow(page)).toHaveAttribute('data-verdict', '済');
    await addedRow(page).locator('button[data-verdict="済"]').click();
    await expect(addedRow(page)).not.toHaveAttribute('data-verdict', '済');
  });

  test('要修正の印は次にこの図を開いた人に帯で出る', async ({ page }) => {
    await openChangedDiagram(page);
    await page.locator('#btn-tab-board').click();
    await addedRow(page).locator('button[data-verdict="要修正"]').click();
    await page.locator('#cb-close').click();

    await page.reload();
    await page.waitForSelector('#preview-svg');
    await expect(page.locator('#hn-banner')).toBeVisible();
    await expect(page.locator('#hn-banner-text')).toContainText('要修正 1 件');
  });

  test('印は基準を取り直しても消えない (差分が 0 枚になっても残る)', async ({ page }) => {
    await openChangedDiagram(page);
    await page.locator('#btn-tab-board').click();
    await addedRow(page).locator('button[data-verdict="要修正"]').click();
    await page.locator('#cb-close').click();

    await page.evaluate(() => window.MA.saveDiff.markAll(window.MA.workspace.list()));
    await page.locator('#btn-tab-board').click();
    await expect(page.locator('#cb-body .cb-empty')).toBeVisible();
    await expect(page.locator('#cb-summary')).toContainText('要修正 1 件');
  });

  test('済だけなら帯は出ない (もう見る必要が無い)', async ({ page }) => {
    await openChangedDiagram(page);
    await page.locator('#btn-tab-board').click();
    await addedRow(page).locator('button[data-verdict="済"]').click();
    await page.locator('#cb-close').click();

    await page.reload();
    await page.waitForSelector('#preview-svg');
    await expect(page.locator('#hn-banner')).toBeHidden();
  });
});
