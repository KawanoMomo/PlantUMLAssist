// @ts-check
// FEAT-115 (HFR-061): elseif の condition と label を 1 枚のフォームで入力する。
// 本 spec は FEAT-115 spec が「E2E (実機) で判定を要する」とした 2 件のみを担う
// ([AC-1] 1 枚のフォーム / [AC-6] Ctrl+Z 1 回)。他の AC は単体層 (jsdom) で判定する。
// AC タグは本ファイル内で重複させない / 状態変化は操作前の値との差をアサートする (LOOP-437)。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');
const FIXTURE = ['@startuml', 'start', ':A;', 'if (cond1?) then (yes)', '  :X;',
  'else (no)', '  :Y;', 'endif', 'stop', '@enduml'].join('\n');

// if ノードの overlay (data-type="decision") をクリックして右パネルを開く。
async function selectIfNode(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await page.waitForTimeout(500);
  await page.locator('#editor').fill(FIXTURE);
  await page.locator('#editor').dispatchEvent('input');
  await page.waitForTimeout(2500);
  const rect = page.locator('#overlay-layer rect[data-type="decision"]').first();
  await expect(rect).toHaveCount(1);
  await rect.click();
  await page.waitForTimeout(400);
  await expect(page.locator('#ac-add-elseif')).toHaveCount(1);
}

// フォームを開き cond / lbl を入れて確定する。
async function addElseifViaForm(page, cond, lbl) {
  await page.locator('#ac-add-elseif').click();
  await page.waitForTimeout(300);
  await page.locator('#act-ei-cond').fill(cond);
  await page.locator('#act-ei-lbl').fill(lbl);
  await page.locator('#act-ei-confirm').click();
  await page.waitForTimeout(400);
}

test.describe('FEAT-115: elseif 追加を 1 枚のフォームにまとめる', () => {
  test('[AC-1] 「+ elseif 追加」1 クリックで 1 枚のフォームが開き condition と label を同時に入力できる', async ({ page }) => {
    await selectIfNode(page);
    const before = await getEditorText(page);
    await page.locator('#ac-add-elseif').click();
    await page.waitForTimeout(300);
    // 1 枚のフォームに 2 つの入力欄が同時に存在する = prompt() 2 回ではない
    await expect(page.locator('#act-modal')).toHaveCSS('display', 'flex');
    await expect(page.locator('#act-ei-cond')).toHaveCount(1);
    await expect(page.locator('#act-ei-lbl')).toHaveCount(1);
    await page.locator('#act-ei-cond').fill('cond2?');
    await page.locator('#act-ei-lbl').fill('maybe');
    await page.locator('#act-ei-confirm').click();
    await page.waitForTimeout(400);
    const after = await getEditorText(page);
    expect(after).not.toBe(before);
    expect(after).toContain('elseif (cond2?) then (maybe)');
    expect(before).not.toContain('cond2?');
  });
  test('[AC-6] Ctrl+Z 1 回で elseif 追加前の DSL に戻る', async ({ page }) => {
    await selectIfNode(page);
    const before = await getEditorText(page);
    await addElseifViaForm(page, 'cond3?', 'perhaps');
    const added = await getEditorText(page);
    expect(added).not.toBe(before);
    await page.locator('#editor').click();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    const undone = await getEditorText(page);
    expect(undone).not.toBe(added);
    expect(undone).toBe(before);
  });
});
