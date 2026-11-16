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

test('ツールボタンで分類のメニューが開き、Ctrl+K の注記が出る', async ({ page }) => {
  await expect(page.locator('#tool-menu')).toBeHidden();
  await page.locator('#btn-tab-tools').click();

  const menu = page.locator('#tool-menu');
  await expect(menu).toBeVisible();
  // 「渡す」(引き継ぎ・納品) は TICKET-owner-20261115-1828-prune で外した。
  await expect(menu.locator('.tool-menu-cat .tool-cat-name')).toHaveText([
    // 確かめる は 1841-prune、探す は TICKET-owner-20261115-2140-prune、レビュー は 2141-prune で外した
    '書き換える',
  ]);
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

// BLK-human-20260923-1601 (design 9b): 左 6 分類・右小見出しの 2 段パネル。
// 縦 1 列に 40 件近く並んでいたときは「確かめる」「レビュー」が画面の下にはみ出していた。
test('分類はホバーで切り替わり、どの分類もパネル内をスクロールさせない', async ({ page }) => {
  await page.locator('#btn-tab-tools').click();
  const menu = page.locator('#tool-menu');
  await expect(menu).toBeVisible();

  // 開いた時点で 1 つ目の分類 (今は 書き換える 1 つ) が右列に出ている。
  // 「図をつくる」の分類は TICKET-owner-20261116-0321-prune で外した。
  await expect(page.locator('.tool-menu-group[data-group="edit"]')).toBeVisible();
  await expect(page.locator('.tool-menu-group[data-group="make"]')).toHaveCount(0);
  await page.locator('.tool-menu-cat[data-group="edit"]').hover();
  await expect(page.locator('.tool-menu-group[data-group="edit"]')).toBeVisible();

  // 小見出しで区切って出る (BLK-owner-20260924-1836-prune: 「見比べる」の「他の保存フォルダを覗く」は
  // FILES「読むだけ」の右クリックへ移し、パネル下端の案内 1 行に落とした)
  await expect(page.locator('.tool-menu-group[data-group="edit"] .tool-menu-sub'))
    .toHaveText(['まとめて直す']);
  await expect(page.locator('#tool-menu-files-note')).toContainText('FILES の読むだけ');

  // パネルの中は溢れない (1 画面に収まる)
  // 「探す」は TICKET-owner-20261115-2140-prune で外した
  await expect(page.locator('.tool-menu-cat[data-group="find"]')).toHaveCount(0);
  for (const key of ['edit']) {
    await page.locator('.tool-menu-cat[data-group="' + key + '"]').hover();
    const over = await menu.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(over).toBeLessThanOrEqual(1);
  }
});

test('絞り込み欄は全分類を横断し、キーボードだけで実行できる', async ({ page }) => {
  await page.locator('#btn-tab-tools').click();
  const filter = page.locator('#tool-menu-filter');
  await expect(filter).toBeFocused();
  await expect(page.locator('.tool-menu-note')).toHaveText('Ctrl+K でも引けます');

  // 「書き換える」の項目は、分類を開かずに候補へ出る (「一括」で当たるのは 一括置換・一括適用 の 2 行)。
  // 「図をつくる」の分類は TICKET-owner-20261116-0321-prune で外した。
  await filter.fill('一括');
  const hits = page.locator('.tool-menu-hits .tool-menu-item');
  await expect(hits).toHaveCount(2);
  await filter.fill('行を書き換える');
  await expect(page.locator('.tool-menu-hits [data-target="btn-tab-lines"]')).toBeVisible();

  // Enter でそのまま開く
  await page.keyboard.press('Enter');
  await expect(page.locator('#tool-menu')).toBeHidden();
  await expect(page.locator('#lines-panel')).toHaveClass(/open/);
});

test('←→ で分類、↑↓ で項目を選び、Enter で開く', async ({ page }) => {
  await page.locator('#btn-tab-tools').click();
  // 図をつくる → 書き換える (確かめる は 1841-prune、探す は 2140-prune、レビュー は 2141-prune で外した)
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.tool-menu-cat[data-group="edit"]'))
    .toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.tool-menu-group[data-group="edit"]')).toBeVisible();

  // 書き換えるの先頭の項目は 行を書き換える
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.tool-menu-item[data-target="btn-tab-lines"]'))
    .toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('Enter');
  await expect(page.locator('#lines-panel')).toHaveClass(/open/);

  // Esc で閉じる
  await page.keyboard.press('Escape');
  await expect(page.locator('#tool-menu')).toBeHidden();
});
