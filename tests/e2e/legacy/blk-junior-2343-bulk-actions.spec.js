// @ts-check
// BLK-junior-20260906-2343: CAN ドライバ初期化のアクティビティ図(アクション 4 つ)を
// 新規作成する。1 アクションずつの「末尾に追加」だと 4 アクションで 12 手を超え、
// DSL 直書きに逃げていた。一括追加ボタンで、入力 1 回 + クリック 1 回で 4 つ入ることを確認する。
// BLK-owner-20260925-0341-prune: 一括の欄は他の図種と同じ種別チップ「まとめて」の中 (#ac-tail-bulk / + まとめて追加)。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

const CAN_ACTIONS = [
  'クロック設定',
  'ピン設定',
  'ボーレート設定',
  '割り込み許可',
].join('\n');

async function newActivity(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await page.waitForTimeout(500);
  await expect(page.locator('#ac-tail-text')).toBeVisible();
}

async function openBulk(page) {
  await page.locator('#ac-tail-kind-chip-bulk').click();
  await expect(page.locator('#ac-tail-bulk')).toBeVisible();
}

async function addBulk(page, text) {
  await openBulk(page);
  await page.locator('#ac-tail-bulk').fill(text);
  await page.locator('#ac-tail-add').click();
}

test.describe('BLK-junior-2343 アクションの一括末尾追加', () => {
  test('4 アクションが 1 回の確定でまとめて入る', async ({ page }) => {
    await newActivity(page);
    await addBulk(page, CAN_ACTIONS);
    await expect
      .poll(async () => await getEditorText(page))
      .toContain(':クロック設定;\n:ピン設定;\n:ボーレート設定;\n:割り込み許可;');
  });

  test('一括の欄は種別チップ「まとめて」1 押しで出て、アクションの欄には一括のボタンが並ばない', async ({ page }) => {
    await newActivity(page);
    await expect(page.locator('#ac-tail-kind')).toHaveValue('action');
    await expect(page.locator('#ac-tail-add-lines')).toHaveCount(0);
    await expect(page.locator('#ac-tail-reuse')).toHaveCount(0);
    await openBulk(page);
    await expect(page.locator('#ac-tail-reuse')).toBeVisible();
    await expect(page.locator('#ac-tail-add')).toHaveText('+ まとめて追加');
  });

  test('空行は無視される', async ({ page }) => {
    await newActivity(page);
    await addBulk(page, 'A\n\n\nB\n');
    await expect.poll(async () => await getEditorText(page)).toContain(':A;\n:B;');
    var t = await getEditorText(page);
    expect(t).not.toContain(':;\n:;');
  });

  test('1 行だけなら単発追加と同じ結果になる', async ({ page }) => {
    await newActivity(page);
    await addBulk(page, '単発');
    await expect.poll(async () => await getEditorText(page)).toContain(':単発;');
  });

  test('undo で一括追加した 4 行がまとめて消える', async ({ page }) => {
    await newActivity(page);
    const before = await getEditorText(page);
    await addBulk(page, CAN_ACTIONS);
    await expect.poll(async () => await getEditorText(page)).toContain(':割り込み許可;');
    await page.locator('#editor').press('Control+z');
    await expect.poll(async () => await getEditorText(page)).toBe(before);
  });

  test('一括追加した行は既存アクションの後ろに積まれる', async ({ page }) => {
    await newActivity(page);
    await page.locator('#ac-tail-text').fill('先頭');
    await page.locator('#ac-tail-add').click();
    await expect.poll(async () => await getEditorText(page)).toContain(':先頭;');
    await addBulk(page, '次\nその次');
    await expect.poll(async () => await getEditorText(page)).toContain(':先頭;\n:次;\n:その次;');
  });
});
