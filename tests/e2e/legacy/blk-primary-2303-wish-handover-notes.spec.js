// @ts-check
// BLK-primary-20260907-2303-wish 申し送りビュー — ボード側の見え方。
// 帯・永続・削除は blk-primary-2303-wish-handover.spec.js が見る。ここは
// 「引き継ぐ側がボードを開いたときに、何件あるか・ボードに並ばなかった図の分も
// 読めるか」だけを見る (差分が 0 枚になっても申し送りが本体として残るため)。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const BEFORE = ['@startuml', 'class Adc_Driver {', '  Adc_Init()', '}', '@enduml'].join('\n');
const AFTER = ['@startuml', 'class Adc_Driver {', '  Adc_Init()', '  Adc_Ack()', '}', '@enduml'].join('\n');
const WHY = 'adc_state の Done→Configured に対応するメソッドが無かった';

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

async function writeNote(page) {
  await page.locator('#btn-tab-board').click();
  await expect(page.locator('#cb-modal')).toBeVisible();
  const input = page.locator('.cb-note-row[data-doc-name="Adc_Driver"] input.cb-note');
  await input.fill(WHY);
  await input.dispatchEvent('change');
}

test.describe('BLK-primary-2303-wish 申し送りビュー (ボードの見え方)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('書いた申し送りは「保存済み」になり、見出しに件数が出る', async ({ page }) => {
    await openChangedDiagram(page);
    await writeNote(page);
    await expect(page.locator('.cb-note-row[data-doc-name="Adc_Driver"] .cb-note-state'))
      .toHaveText('保存済み');
    await expect(page.locator('#cb-summary')).toContainText('申し送り 1 件');
  });

  test('差分が 0 枚になっても、ボードに並ばない図の申し送りとして読める', async ({ page }) => {
    await openChangedDiagram(page);
    await writeNote(page);
    await page.locator('#cb-close').click();

    // 「今の内容を基準にする」相当。ここでボードの差分は 0 枚になる。
    await page.evaluate(() => window.MA.saveDiff.markAll(window.MA.workspace.list()));
    await page.locator('#btn-tab-board').click();
    await expect(page.locator('#cb-body .cb-empty')).toBeVisible();
    const rest = page.locator('.cb-notes-only .cb-note-row[data-doc-name="Adc_Driver"]');
    await expect(rest).toHaveCount(1);
    await expect(rest.locator('input.cb-note')).toHaveValue(WHY);
  });
});
