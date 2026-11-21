// @ts-check
// BLK-primary-20260908-0923-design (design 7b): タブ列は図だけにして Ctrl+K に寄せる。
// 7a はタブ列の 25 個を「ツール ▾」1 個に畳んだが、7b はその 1 個も置かない。
// タブ列は図のタブと ＋ / 一覧 だけ、件数は下端の状態表示、機能の入口は Ctrl+K。
const { test, expect } = require('@playwright/test');
const { gotoApp, pickTool } = require('../helpers');

// 既定を見るので helper の互換設定 (畳まない) は使わない。
async function open7b(page) {
  await gotoApp(page, { foldedTools: true });
}

async function openToolMenu(page) {
  await page.keyboard.press('Control+k');
  await expect(page.locator('#cp-input')).toBeVisible();
  await page.locator('#cp-input').fill('ツールの一覧を開く');
  await page.keyboard.press('Enter');
  await expect(page.locator('#tool-menu')).toBeVisible();
}

test('既定のタブ列にはボタンが 1 つも無い (図のタブと ＋ / 一覧 だけ)', async ({ page }) => {
  await open7b(page);
  await expect(page.locator('#btn-tab-new')).toBeVisible();
  await expect(page.locator('#btn-tab-folder')).toBeVisible();
  await expect(page.locator('#btn-tab-tools')).toBeHidden();
  // 25 個の機能ボタンはどれも出ない。
  for (const id of ['btn-tab-rename', 'btn-tab-apply', 'btn-tab-lines', 'btn-tab-diff']) {
    await expect(page.locator('#' + id), id).toBeHidden();
  }
});

// 整合・イベント整合の札 (図をまたぐ監査) は TICKET-owner-20261115-1841-prune、
// ± 差分の札は TICKET-owner-20261115-2141-prune で外した。
test('下端に件数の札 (± 差分・整合・イベント整合) は無い', async ({ page }) => {
  await open7b(page);
  await expect(page.locator('#status-diff')).toHaveCount(0);
  await expect(page.locator('#status-consistency, #status-eventsync')).toHaveCount(0);
});

test('機能は Ctrl+K から引ける (ツールの一覧も Ctrl+K から開く)', async ({ page }) => {
  await open7b(page);
  await openToolMenu(page);
  // TICKET-roadmap-20261115-2114-2: 分類の列は無く、残った道具だけの 1 段の一覧。
  await expect(page.locator('#tool-menu .tool-menu-cat')).toHaveCount(0);
  await expect(page.locator('#tool-menu .tool-menu-list .tool-menu-item')).toHaveCount(3);
  await pickTool(page, 'btn-tab-lines');
  await expect(page.locator('#lines-panel')).toHaveClass(/open/);
});

// BLK-builder-20260924-1815-3 (design 9b / 9a): 既定のパネルに「ツール ▾ をタブ列に出す」は出さない
// (押すと右端のツール ▾ が ＋ の隣へ動くだけだった)。以前に選んだ人には右端へ戻す 1 行だけが出る。
test('以前に「ツール ▾ をタブ列に出す」を選んだ人は、パネルの 1 行で右端の入口に戻せる', async ({ page }) => {
  await open7b(page);
  await openToolMenu(page);
  await expect(page.locator('#tool-menu-quiet')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.evaluate(() => localStorage.setItem('plantuml-tools-quiet', '0'));
  await page.reload();
  await page.waitForSelector('#preview-svg');
  await expect(page.locator('#btn-tab-tools')).toBeVisible();
  await expect(page.locator('#btn-tab-lines')).toBeHidden();

  await page.locator('#btn-tab-tools').click();
  await expect(page.locator('#tool-menu-quiet')).toHaveText('ツール ▾ を右端へ戻す');
  await page.locator('#tool-menu-quiet').click();
  await expect(page.locator('#btn-tab-tools')).toBeHidden();
  await expect(page.locator('#btn-tab-tools-mini')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('plantuml-tools-quiet'))).toBe('1');
});

test('既定のタブ列は横スクロールしない', async ({ page }) => {
  await open7b(page);
  const over = await page.evaluate(() => {
    const bar = document.getElementById('tab-bar');
    return bar.scrollWidth - bar.clientWidth;
  });
  expect(over).toBeLessThanOrEqual(1);
});
