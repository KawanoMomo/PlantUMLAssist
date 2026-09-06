// @ts-check
// BLK-junior-20260906-2343(追記): CanDrv 中心の CAN ユースケース図(アクター 2・ユースケース 4・
// 関連 6)を新規作成する。1 件ずつの「末尾に追加」だと 36 手を超え、DSL 直書きに逃げていた。
// 種類=一括 のテキスト欄で、入力 1 回 + クリック 1 回で 12 件入ることを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const CAN_BULK = [
  'actor AppDev',
  'actor Tester',
  'CanInit',
  'CanSend',
  'CanRecv',
  'CanDiag',
  'AppDev --> CanInit',
  'AppDev --> CanSend',
  'AppDev --> CanRecv',
  'Tester --> CanDiag',
  'CanSend ..> CanInit',
  'CanDiag ..> CanRecv : extend',
].join('\n');

async function newUsecase(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-usecase');
  await page.waitForTimeout(500);
  await expect(page.locator('#uc-tail-kind')).toBeVisible();
  await page.locator('#uc-tail-kind').selectOption('bulk');
  await expect(page.locator('#uc-tail-bulk')).toBeVisible();
}

test.describe('BLK-junior-2343 ユースケース図の一括末尾追加', () => {
  test('2 アクター + 4 ユースケース + 6 関連が 1 回の確定でまとめて入る', async ({ page }) => {
    await newUsecase(page);
    await page.locator('#uc-tail-bulk').fill(CAN_BULK);
    await page.locator('#uc-tail-add').click();
    await expect.poll(async () => await getEditorText(page)).toContain('actor AppDev');
    const out = await getEditorText(page);
    for (const line of [
      'actor Tester',
      'usecase CanInit',
      'usecase CanSend',
      'usecase CanRecv',
      'usecase CanDiag',
      'AppDev --> CanInit',
      'Tester --> CanDiag',
      'CanSend ..> CanInit : <<include>>',
      'CanDiag ..> CanRecv : <<extend>>',
    ]) {
      expect(out).toContain(line);
    }
  });

  test('確定 1 回は history 1 件なので Ctrl+Z 1 手で全部戻る', async ({ page }) => {
    await newUsecase(page);
    const before = await getEditorText(page);
    await page.locator('#uc-tail-bulk').fill(CAN_BULK);
    await page.locator('#uc-tail-add').click();
    await expect.poll(async () => await getEditorText(page)).toContain('usecase CanDiag');
    await page.locator('#editor').press('Control+z');
    await expect.poll(async () => await getEditorText(page)).toBe(before);
  });
});
