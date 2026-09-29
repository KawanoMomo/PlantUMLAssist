// @ts-check
// BLK-builder-20260908-1123-4 (design 7a/7b): 何も設定していない人が開いたとき、
// タブ列は図のタブと ＋ / 一覧 だけで、横スクロールが要らないこと。
// 件数 (差分・指摘・指摘箱) は下端の状態表示に出ていること。
// BLK-primary-20260908-0923-design (7b) で「ツール ▾」も既定では置かなくなったので、
// 既定を見る test はメニューを Ctrl+K から開く。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

// 既定 (7b) のタブ列にはツールの入口が無いので、Ctrl+K でメニューを開く。
async function openToolMenu(page) {
  await page.keyboard.press('Control+k');
  await expect(page.locator('#cp-input')).toBeVisible();
  await page.locator('#cp-input').fill('ツールを分類から選ぶ');
  await page.keyboard.press('Enter');
  await expect(page.locator('#tool-menu')).toBeVisible();
}

// localStorage は test ごとに新しい context で空から始まるので、ここでは消さない。
// 消す初期化スクリプトを入れると reload のたびに走り、「選択が残る」を見られなくなる。

test('既定ではタブ列に機能ボタンが出ない', async ({ page }) => {
  await gotoApp(page, { foldedTools: true });
  await expect(page.locator('#tab-bar')).toHaveClass(/tools-folded/);
  await expect(page.locator('#btn-tab-compare')).toBeHidden();
  await expect(page.locator('#btn-tab-board')).toBeHidden();
  await expect(page.locator('#btn-tab-handoff')).toBeHidden();
  // 図の出し入れだけが残る (7b: ツール ▾ も置かない)。
  await expect(page.locator('#btn-tab-new')).toBeVisible();
  await expect(page.locator('#btn-tab-folder')).toBeVisible();
  await expect(page.locator('#btn-tab-tools')).toBeHidden();
});

test('既定のタブ列は横スクロールしない', async ({ page }) => {
  await gotoApp(page, { foldedTools: true });
  const over = await page.evaluate(() => {
    const bar = document.getElementById('tab-bar');
    return bar.scrollWidth - bar.clientWidth;
  });
  expect(over).toBeLessThanOrEqual(1);
});

// BLK-builder-20260924-1815-3 (design 9b / 9a): 既定のパネルには「タブ列に戻す」を出さない
// (押すと 9a が外した絵文字の機能ボタンがタブ列に戻っていた)。畳みを解くのは以前に選んだ人の設定だけ。
test('既定のツールのパネルに「タブ列に戻す」は出ない', async ({ page }) => {
  await gotoApp(page, { foldedTools: true });
  await openToolMenu(page);
  await expect(page.locator('#tool-menu-fold')).toHaveCount(0);
  await expect(page.locator('#tool-menu')).not.toContainText('タブ列に戻す');
});

