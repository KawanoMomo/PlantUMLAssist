// @ts-check
// BLK-primary-20260908-0923-design (design 7b): タブ列は図だけにして Ctrl+K に寄せる。
// 7a はタブ列の 25 個を「ツール ▾」1 個に畳んだが、7b はその 1 個も置かない。
// タブ列は図のタブと ＋ / 一覧 だけ、件数は下端の状態表示、機能の入口は Ctrl+K。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

// 既定を見るので helper の互換設定 (畳まない) は使わない。
async function open7b(page) {
  await gotoApp(page, { foldedTools: true });
}

async function openToolMenu(page) {
  await page.keyboard.press('Control+k');
  await expect(page.locator('#cp-input')).toBeVisible();
  await page.locator('#cp-input').fill('ツールを分類から選ぶ');
  await page.keyboard.press('Enter');
  await expect(page.locator('#tool-menu')).toBeVisible();
}

test('既定のタブ列にはボタンが 1 つも無い (図のタブと ＋ / 一覧 だけ)', async ({ page }) => {
  await open7b(page);
  await expect(page.locator('#btn-tab-new')).toBeVisible();
  await expect(page.locator('#btn-tab-folder')).toBeVisible();
  await expect(page.locator('#btn-tab-tools')).toBeHidden();
  // 25 個の機能ボタンはどれも出ない。
  for (const id of ['btn-tab-rename', 'btn-tab-board', 'btn-tab-xref',
                    'btn-tab-handoff', 'btn-tab-delivery', 'btn-tab-diff']) {
    await expect(page.locator('#' + id), id).toBeHidden();
  }
});

test('件数を持つものは下端の状態表示に出て、押せばそのパネルが開く', async ({ page }) => {
  await open7b(page);
  for (const id of ['status-diff', 'status-pins', 'status-inbox',
                    'status-consistency', 'status-eventsync']) {
    await expect(page.locator('#' + id), id).toBeVisible();
  }
  await page.locator('#status-pins').click();
  await expect(page.locator('#pin-panel')).toHaveClass(/open/);
});

test('機能は Ctrl+K から引ける (ツールの分類メニューも Ctrl+K から開く)', async ({ page }) => {
  await open7b(page);
  await openToolMenu(page);
  await expect(page.locator('#tool-menu .tool-menu-title')).toHaveText([
    '図をつくる', '書き換える', '探す・見比べる', '確かめる', 'レビュー', '渡す',
  ]);
  await page.locator('.tool-menu-item[data-target="btn-tab-board"]').click();
  await expect(page.locator('#cb-modal')).toBeVisible();
});

test('「ツール ▾ をタブ列に出す」を選べば入口が戻り、次に開いても残る', async ({ page }) => {
  await open7b(page);
  await openToolMenu(page);
  await page.locator('#tool-menu-quiet').click();
  await expect(page.locator('#btn-tab-tools')).toBeVisible();
  // 機能ボタンは畳んだまま。戻したのは入口 1 個だけ。
  await expect(page.locator('#btn-tab-board')).toBeHidden();

  await page.reload();
  await page.waitForSelector('#preview-svg');
  await expect(page.locator('#btn-tab-tools')).toBeVisible();

  // もう一度静かにできる。
  await page.locator('#btn-tab-tools').click();
  await page.locator('#tool-menu-quiet').click();
  await expect(page.locator('#btn-tab-tools')).toBeHidden();
});

test('既定のタブ列は横スクロールしない', async ({ page }) => {
  await open7b(page);
  const over = await page.evaluate(() => {
    const bar = document.getElementById('tab-bar');
    return bar.scrollWidth - bar.clientWidth;
  });
  expect(over).toBeLessThanOrEqual(1);
});
