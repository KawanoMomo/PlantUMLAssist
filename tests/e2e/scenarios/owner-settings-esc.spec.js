// @ts-check
// TICKET-owner-20261116-0621-1: ⚙ 設定の窓は Esc で「キャンセル」と同じく保存せずに閉じ、
// 手は開く前の場所 (左レールの CFG) へ戻る。窓の中を押した後も、欄に打ちかけの字があっても Esc 1 回で閉じる。
// ショートカットのキー待ち中の Esc はキー待ちの取り消しだけ (窓は閉じない)。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');
const S = require('./_scenario');

const DIR = saveDirFor(__filename);
const DSL = ['@startuml', 'title 設定の Esc', 'Alice -> Bob : hello', '@enduml'].join('\n');

async function boot(page) {
  // 保存間隔は既定の 1s。保存先は試験用のフォルダ (利用者の本物の保存先・設定に触れない)。
  await page.addInitScript((d) => {
    try {
      if (window.localStorage.getItem('pua.e2e.keep')) return;
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config', JSON.stringify({
        enabled: true, debounceMs: 1000, restoreMode: 'auto', backend: 'file', fileDir: d,
      }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page, { foldedTools: true });
}

function savedConfig(page) {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem('plantuml-autosave-config') || '{}'));
}

async function openSettings(page) {
  await page.locator('#rail-config').click();
  await expect(page.locator('#cfg-modal')).toBeVisible();
  await page.locator('#cfg-tab-autosave').click();
}

test('⚙ 設定で保存間隔を 2s に押し替えて Esc → 窓が閉じ、開き直すと 1s のまま。本文・保存先は変わらない', async ({ page }) => {
  await boot(page);
  await S.clearDir(page, DIR);
  await S.typeDslDrawn(page, DSL);
  await page.waitForTimeout(1500);   // 自動保存 (1s) を済ませてから比べる
  const textBefore = await page.locator('#editor').inputValue();
  const filesBefore = (await S.listDir(page, DIR)).sort();
  const docsBefore = {};
  for (const f of filesBefore) docsBefore[f] = await S.readDoc(page, DIR, f);
  const cfgBefore = await savedConfig(page);

  await openSettings(page);
  await expect(page.locator('#cfg-debounce .cfg-seg[data-debounce="1000"]')).toHaveClass(/active/);
  await page.locator('#cfg-debounce .cfg-seg[data-debounce="2000"]').click();
  await expect(page.locator('#cfg-debounce .cfg-seg[data-debounce="2000"]')).toHaveClass(/active/);
  await page.keyboard.press('Escape');

  await expect(page.locator('#cfg-modal')).toBeHidden();
  await expect(page.locator('#rail-config')).toBeFocused();
  expect(await savedConfig(page)).toEqual(cfgBefore);

  // 閉じた窓が本文欄のクリックを塞がない。
  await page.locator('#editor').click({ timeout: 5000 });

  await openSettings(page);
  await expect(page.locator('#cfg-debounce .cfg-seg[data-debounce="1000"]')).toHaveClass(/active/);
  await expect(page.locator('#cfg-debounce .cfg-seg[data-debounce="2000"]')).not.toHaveClass(/active/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#cfg-modal')).toBeHidden();

  expect(await page.locator('#editor').inputValue()).toBe(textBefore);
  await page.waitForTimeout(1500);
  const filesAfter = (await S.listDir(page, DIR)).sort();
  expect(filesAfter).toEqual(filesBefore);
  for (const f of filesAfter) expect(await S.readDoc(page, DIR, f)).toBe(docsBefore[f]);
});

test('⚙ 設定の保存先の欄に打ちかけの字があっても Esc 1 回で閉じ、その字は保存しない', async ({ page }) => {
  await boot(page);
  const cfgBefore = await savedConfig(page);
  await openSettings(page);
  // 「ファイルに保存」のときだけ出る保存先の欄に字を打つ。
  const dir = page.locator('#cfg-file-dir');
  await expect(dir).toBeVisible();
  await dir.click();
  await dir.press('End');
  await dir.type('/typo');
  await expect(dir).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#cfg-modal')).toBeHidden();
  expect(await savedConfig(page)).toEqual(cfgBefore);
  await openSettings(page);
  await expect(page.locator('#cfg-file-dir')).toHaveValue(cfgBefore.fileDir);
});

test('⚙ 設定のショートカットのキー待ち中の Esc はキー待ちの取り消しだけで、窓は閉じない。次の Esc で閉じる', async ({ page }) => {
  await boot(page);
  await page.locator('#rail-config').click();
  await expect(page.locator('#cfg-modal')).toBeVisible();
  await page.locator('#cfg-tab-shortcuts').click();
  await page.locator('#cfg-shortcuts-list tr[data-sc-id="palette"]').click();
  await expect(page.locator('#cfg-shortcuts-list .cfg-sc-capturing')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#cfg-shortcuts-list .cfg-sc-capturing')).toHaveCount(0);
  await expect(page.locator('#cfg-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#cfg-modal')).toBeHidden();
});
