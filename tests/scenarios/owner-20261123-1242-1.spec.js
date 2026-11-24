// @ts-check
// TICKET-owner-20261123-1242-1: 「この図の履歴」の窓を開く入口 (FILES のファイルの右クリック・Ctrl+K) の語を「この図の履歴を表示」に揃え、
// Ctrl+K は右クリックの語で引ける。Ctrl+K の「行を書き換える」の行の右端に前の名前「行編集」を出さない。
// 期待:
//   (1) 既定の画面・実マウスで、右クリックの行と Ctrl+K の行の文字がどちらも「この図の履歴を表示」で、同じ窓 (#vt-modal) を開く
//   (2) Ctrl+K に「履歴を表示」を打つと出る履歴の行は 1 行で先頭。前の語「この図の履歴を見る」でも先頭
//   (3) Ctrl+K「行を書き換える」の行の右端は空 (「行編集」と打てばその行が先頭に出る)
//   (4) 開いて閉じただけでは保存先の図は 1 バイトも変わらない
const { test, expect } = require('@playwright/test');
const S = require('../e2e/scenarios/_scenario');

const WORD = 'この図の履歴を表示';
const DIR = S.dirFor(__filename);
const DSL = ['@startuml', 'participant Gpio_Driver', 'Gpio_Driver -> Hal : Gpio_Init()', '@enduml'].join('\n');

async function mouseClick(page, locator, button) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, button ? { button } : undefined);
}

async function palette(page, q) {
  await page.keyboard.press('Control+k');
  await expect(page.locator('#cp-input')).toBeVisible();
  await page.keyboard.type(q);
}

test('owner 1242-1 この図の履歴の入口は右クリックと Ctrl+K で同じ語、Ctrl+K の行を書き換えるに前の名前が並ばない', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'gpio_seq', DSL);
  await S.reopenApp(page);
  const before = await S.readDoc(page, DIR, 'gpio_seq');
  const row = page.locator('#files-parts .files-part-file[data-file-name="gpio_seq"]').first();
  await expect(row).toBeVisible({ timeout: 10000 });
  await mouseClick(page, row);   // 図を開く (Ctrl+K の履歴は今のタブの図)
  await expect(page.locator('#editor')).toHaveValue(/Gpio_Init/, { timeout: 10000 });

  async function expectTheWindow(entryText) {
    expect(entryText.trim()).toBe(WORD);
    await expect(page.locator('#vt-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#vt-modal')).toBeHidden();
  }

  // FILES のファイルの右クリック
  await mouseClick(page, row, 'right');
  const ctxItem = page.locator('#files-ctx-menu [data-action="history"]');
  const ctxText = await ctxItem.innerText();
  await mouseClick(page, ctxItem);
  await expectTheWindow(ctxText);

  // Ctrl+K: 右クリックの語の一部「履歴を表示」で、履歴の行は 1 行で先頭。題は同じ語。
  await palette(page, '履歴を表示');
  const items = page.locator('#cp-list .cp-item');
  await expect(page.locator('#cp-list .cp-item[data-cp-id$=":tab-versions"]')).toHaveCount(1);
  await expect(items.first().locator('.cp-title')).toHaveText(WORD);
  await page.screenshot({ path: testInfo.outputPath('palette.png') });
  const cpText = await items.first().locator('.cp-title').innerText();
  await page.keyboard.press('Enter');
  await expectTheWindow(cpText);

  // 前の語でも先頭
  await palette(page, 'この図の履歴を見る');
  await expect(items.first().locator('.cp-title')).toHaveText(WORD);
  await page.keyboard.press('Escape');
  await expect(page.locator('#cp-input')).toBeHidden();

  // 行を書き換える: 右端に前の名前は出ない。「行編集」と打てばその行が先頭。
  await palette(page, '行を書き換える');
  const lines = page.locator('#cp-list .cp-item[data-cp-id$=":tab-lines"]');
  await expect(lines).toHaveCount(1);
  await expect(lines.locator('.cp-title')).toHaveText('行を書き換える');
  await expect(lines).not.toContainText('行編集');
  await page.screenshot({ path: testInfo.outputPath('palette-lines.png') });
  await page.keyboard.press('Escape');
  await palette(page, '行編集');
  await expect(items.first()).toHaveAttribute('data-cp-id', /:tab-lines$/);
  await page.keyboard.press('Escape');

  expect(await S.readDoc(page, DIR, 'gpio_seq')).toBe(before);
  expect(errors, errors.join('\n')).toEqual([]);
});
