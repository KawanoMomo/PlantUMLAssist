// @ts-check
// BLK-builder-20260907-1405-1: design 1a の設定「自動保存」タブ —
// 保存間隔のセグメント / 起動時の復元カード / 保存先カード。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

async function openSettings(page) {
  await gotoApp(page);
  await page.waitForSelector('#preview-svg', { timeout: 5000 });
  await page.locator('#rail-config').click();
  await expect(page.locator('#cfg-modal')).toBeVisible();
  // 自動保存タブは既定で開くが、前回のタブが残っていることがあるので明示する
  const tab = page.locator('#cfg-tab-autosave');
  if (await tab.count()) await tab.click();
  await expect(page.locator('#cfg-pane-autosave')).toBeVisible();
}

test.describe('設定「自動保存」タブ (design 1a)', () => {
  test('保存間隔が 500ms / 1s / 2s / 5s の 4 チップになっている', async ({ page }) => {
    await openSettings(page);
    const segs = page.locator('#cfg-debounce .cfg-seg');
    await expect(segs).toHaveCount(4);
    await expect(segs).toHaveText(['500ms', '1s', '2s', '5s']);
    // 1 つだけが選択状態
    await expect(page.locator('#cfg-debounce .cfg-seg.active')).toHaveCount(1);
  });

  test('チップを押すと選択が移り、保存すると次に開いたときも残る', async ({ page }) => {
    await openSettings(page);
    await page.locator('#cfg-debounce .cfg-seg[data-debounce="5000"]').click();
    await expect(page.locator('#cfg-debounce .cfg-seg[data-debounce="5000"]')).toHaveClass(/active/);
    await expect(page.locator('#cfg-debounce .cfg-seg.active')).toHaveCount(1);
    await page.locator('#cfg-ok').click();
    await expect(page.locator('#cfg-modal')).toBeHidden();

    await page.locator('#rail-config').click();
    await expect(page.locator('#cfg-debounce .cfg-seg[data-debounce="5000"]')).toHaveClass(/active/);
  });

  test('起動時の復元が 3 枚のカードで、推奨バッジと説明文が出る', async ({ page }) => {
    await openSettings(page);
    const cards = page.locator('#cfg-restore-cards .cfg-mode-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText('確認してから復元');
    await expect(cards.nth(0)).toContainText('推奨');
    await expect(cards.nth(0)).toContainText('前回の DSL があればダイアログで尋ねます。');
    await expect(cards.nth(1)).toContainText('確認なしで自動復元');
    await expect(cards.nth(2)).toContainText('復元しない（常にテンプレート）');
  });

  test('保存先が 2 枚のカードで、ファイルを選ぶとディレクトリ欄が出る', async ({ page }) => {
    await openSettings(page);
    const cards = page.locator('#cfg-backend-cards .cfg-mode-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText('ブラウザ内・高速');
    await expect(cards.nth(1)).toContainText('ディスク永続・git 管理可');

    await expect(page.locator('#cfg-file-dir-row')).toBeHidden();
    await page.locator('#cfg-backend-cards input[value="file"]').check();
    await expect(page.locator('#cfg-file-dir-row')).toBeVisible();
    await page.locator('#cfg-backend-cards input[value="localStorage"]').check();
    await expect(page.locator('#cfg-file-dir-row')).toBeHidden();
  });

  test('復元カードで選んだ値が保存され、開き直しても選択が残る', async ({ page }) => {
    await openSettings(page);
    await page.locator('#cfg-restore-cards input[value="none"]').check();
    await page.locator('#cfg-ok').click();
    await expect(page.locator('#cfg-modal')).toBeHidden();

    await page.locator('#rail-config').click();
    await expect(page.locator('#cfg-restore-cards input[value="none"]')).toBeChecked();
    // 元に戻して後続のテストに影響を残さない
    await page.locator('#cfg-restore-cards input[value="confirm"]').check();
    await page.locator('#cfg-ok').click();
  });
});
