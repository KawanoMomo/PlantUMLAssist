// @ts-check
// BLK-primary-20260908-0823-design (design 7a): ツールを 1 か所に畳む。
// primary は「レビュー会議で見せる ▤ 変更サマリ」と「納品する 📂 一覧 → SVG」の間で
// 目的の違うボタンをタブ列から目で探していた。分類だけを開いて選べることを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp, pickTool } = require('../helpers');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      // reload をまたぐテストがあるので、初回ロードのときだけ掃除する
      if (!window.sessionStorage.getItem('__tool_menu_spec_init')) {
        window.sessionStorage.setItem('__tool_menu_spec_init', '1');
        window.localStorage.removeItem('plantuml-tools-folded');
      }
    } catch (e) {}
  });
  await gotoApp(page);
});

// TICKET-roadmap-20261115-2114-2 (整理表 #4): 分類の中身が外れて残りは 3 行になったので、
// 左の分類の列を外し、残った道具だけの 1 段の一覧にした。
test('ツールボタンで 1 段の一覧のメニューが開き、Ctrl+K の注記が出る', async ({ page }) => {
  await expect(page.locator('#tool-menu')).toBeHidden();
  await page.locator('#btn-tab-tools').click();

  const menu = page.locator('#tool-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.tool-menu-cat')).toHaveCount(0);
  await expect(menu.locator('.tool-menu-list .tool-menu-item .tool-menu-label')).toHaveText([
    '行を書き換える', '部品名を一括置換する',
  ]);
  // 「複数クラスに一括適用する」は TICKET-owner-20261122-1023-prune で外した。
  await expect(page.locator('#btn-tab-apply')).toHaveCount(0);
  await expect(menu.locator('.tool-menu-note')).toHaveText('Ctrl+K でも引けます');
  await expect(page.locator('#btn-tab-tools')).toHaveAttribute('aria-expanded', 'true');
});

test('Esc とメニュー外のクリックで閉じる', async ({ page }) => {
  await page.locator('#btn-tab-tools').click();
  await expect(page.locator('#tool-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#tool-menu')).toBeHidden();

  await page.locator('#btn-tab-tools').click();
  await expect(page.locator('#tool-menu')).toBeVisible();
  await page.locator('#status-parse').click();
  await expect(page.locator('#tool-menu')).toBeHidden();
});

test('タブ列から畳むと機能ボタンが消え、次に開いても畳んだままになる', async ({ page }) => {
  await expect(page.locator('#btn-tab-lines')).toBeVisible();

  await page.locator('#btn-tab-tools').click();
  await page.locator('#tool-menu-fold').click();

  // 畳んだ後は既定 (＋ と右端のツール ▾) に戻る (BLK-builder-20260924-1815-3)
  await expect(page.locator('#btn-tab-lines')).toBeHidden();
  await expect(page.locator('#btn-tab-rename')).toBeHidden();
  await expect(page.locator('#btn-tab-new')).toBeVisible();
  await expect(page.locator('#btn-tab-tools-mini')).toBeVisible();

  // 畳んでもメニュー経由では引ける
  await page.locator('#btn-tab-tools-mini').click();
  await pickTool(page, 'btn-tab-lines');
  await expect(page.locator('#lines-panel')).toHaveClass(/open/);

  // 再読み込みしても畳んだ状態を憶えている
  await page.reload();
  await page.waitForSelector('#preview-svg');
  await expect(page.locator('#btn-tab-lines')).toBeHidden();

  // 既定に戻ったので、パネルに切り替えの行は出ない (design 9b)
  await page.locator('#btn-tab-tools-mini').click();
  await expect(page.locator('#tool-menu-fold')).toHaveCount(0);
});

// BLK-builder-20260908-0858-2: パネル類 (外側 click で閉じる作りのもの) をメニューから開くと、
// 選んだ click がそのまま document へ上がって開いた直後に閉じていた。
// (この図の指摘 は 1840-prune、レビューの分類 (基準の図との指摘・前回保存からの差分) は
// TICKET-owner-20261115-2141-prune で外したので、同じ作りの「行を書き換える」で見る)
test('メニューから「行を書き換える」を開くと、パネルが開いたまま残る', async ({ page }) => {
  await page.locator('#btn-tab-tools').click();
  await pickTool(page, 'btn-tab-lines');
  await expect(page.locator('#lines-panel')).toHaveClass(/open/);
});

// BLK-human-20260923-1601 (design 9b): パネル内をスクロールさせない。
test('一覧は小見出しで区切って出て、パネル内をスクロールさせない', async ({ page }) => {
  await page.locator('#btn-tab-tools').click();
  const menu = page.locator('#tool-menu');
  await expect(menu).toBeVisible();

  // 小見出しで区切って出る (BLK-owner-20260924-1836-prune: 「見比べる」の「他の保存フォルダを覗く」は
  // FILES「読むだけ」の右クリックへ移し、パネル下端の案内 1 行に落とした)
  await expect(page.locator('#tool-menu .tool-menu-list .tool-menu-sub')).toHaveText(['まとめて直す']);
  await expect(page.locator('#tool-menu-files-note')).toContainText('FILES の読むだけ');

  // パネルの中は溢れない (1 画面に収まる)
  const over = await menu.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(over).toBeLessThanOrEqual(1);
});

test('絞り込み欄は一覧の全項目から当て、キーボードだけで実行できる', async ({ page }) => {
  await page.locator('#btn-tab-tools').click();
  const filter = page.locator('#tool-menu-filter');
  await expect(filter).toBeFocused();
  await expect(page.locator('.tool-menu-note')).toHaveText('Ctrl+K でも引けます');

  // 「書き換える」の項目は、分類を開かずに候補へ出る (「一括」で当たるのは 一括置換 の 1 行。
  // 一括適用 は TICKET-owner-20261122-1023-prune で外した)。
  // 「図をつくる」の分類は TICKET-owner-20261116-0321-prune で外した。
  await filter.fill('一括');
  const hits = page.locator('.tool-menu-hits .tool-menu-item');
  await expect(hits).toHaveCount(1);
  await expect(hits.first()).toHaveAttribute('data-target', 'btn-tab-rename');
  await filter.fill('行を書き換える');
  await expect(page.locator('.tool-menu-hits [data-target="btn-tab-lines"]')).toBeVisible();

  // Enter でそのまま開く
  await page.keyboard.press('Enter');
  await expect(page.locator('#tool-menu')).toBeHidden();
  await expect(page.locator('#lines-panel')).toHaveClass(/open/);
});

// TICKET-owner-20261122-1023-prune: 外した「複数クラスに一括適用する」は Ctrl+K でも出ない。
test('Ctrl+K で「一括適用」と打っても行が出ない', async ({ page }) => {
  await page.locator('#editor').click();
  await page.keyboard.press('Control+k');
  await expect(page.locator('#cp-input')).toBeVisible();
  await page.locator('#cp-input').fill('一括適用');
  await page.waitForTimeout(200);
  const rows = await page.locator('.cp-item').allTextContents();
  for (const r of rows) expect(r).not.toContain('一括適用');
  await page.locator('#cp-input').fill('一括置換');
  await expect(page.locator('.cp-item').filter({ hasText: '一括置換' }).first()).toBeVisible();
});

test('↑↓ で項目を選び、Enter で開く', async ({ page }) => {
  await page.locator('#btn-tab-tools').click();
  await expect(page.locator('#tool-menu .tool-menu-list')).toBeVisible();

  // 一覧の先頭の項目は 行を書き換える
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.tool-menu-item[data-target="btn-tab-lines"]'))
    .toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('Enter');
  await expect(page.locator('#lines-panel')).toHaveClass(/open/);

  // Esc で閉じる
  await page.keyboard.press('Escape');
  await expect(page.locator('#tool-menu')).toBeHidden();
});
