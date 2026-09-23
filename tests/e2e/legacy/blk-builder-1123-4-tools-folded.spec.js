// @ts-check
// BLK-builder-20260908-1123-4 (design 7a/7b): 何も設定していない人が開いたとき、
// タブ列は図のタブと ＋ / 一覧 だけで、横スクロールが要らないこと。
// 件数 (差分・指摘・指摘箱) は下端の状態表示に出ていること。
// BLK-primary-20260908-0923-design (7b) で「ツール ▾」も既定では置かなくなったので、
// 既定を見る test はメニューを Ctrl+K から開く。
const { test, expect } = require('@playwright/test');
const { gotoApp, pickTool } = require('../helpers');

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

test('畳んでも件数は下端の状態表示に出ている', async ({ page }) => {
  await gotoApp(page, { foldedTools: true });
  await expect(page.locator('#status-diff')).toBeVisible();
  await expect(page.locator('#status-pins')).toBeVisible();
  await expect(page.locator('#status-inbox')).toBeVisible();
});

test('畳んだ状態でもツールから機能を開ける', async ({ page }) => {
  await gotoApp(page, { foldedTools: true });
  await openToolMenu(page);
  await pickTool(page, 'btn-tab-compare');
  await expect(page.locator('#compare-pane')).toBeVisible();
});

test('「タブ列に戻す」を選べば機能ボタンが並び、次に開いても残る', async ({ page }) => {
  await gotoApp(page, { foldedTools: true });
  await openToolMenu(page);
  await page.locator('#tool-menu-fold').click();
  await expect(page.locator('#btn-tab-compare')).toBeVisible();

  await page.reload();
  await page.waitForSelector('#preview-svg');
  await expect(page.locator('#tab-bar')).not.toHaveClass(/tools-folded/);
  await expect(page.locator('#btn-tab-compare')).toBeVisible();
});

test('戻したあとにもう一度畳める', async ({ page }) => {
  await gotoApp(page);   // helper の既定 (畳まない) で開く
  await expect(page.locator('#btn-tab-compare')).toBeVisible();
  await page.locator('#btn-tab-tools').click();
  await page.locator('#tool-menu-fold').click();
  await expect(page.locator('#tab-bar')).toHaveClass(/tools-folded/);
  await expect(page.locator('#btn-tab-compare')).toBeHidden();
});
