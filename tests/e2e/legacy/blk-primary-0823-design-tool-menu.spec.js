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
await expect(menu.locator('.tool-menu-cat .tool-cat-name')).toHaveText([
    '図をつくる', '書き換える', '探す', '確かめる', 'レビュー', '渡す',
  ]);
  await expect(menu.locator('.tool-menu-note')).toHaveText('Ctrl+K でも引けます');
  await expect(page.locator('#btn-tab-tools')).toHaveAttribute('aria-expanded', 'true');
});

test('「レビュー」の分類から変更サマリを開ける', async ({ page }) => {
  await page.locator('#btn-tab-tools').click();
  // design 9b: 分類を選ぶと右列がその分類に切り替わる。
  await page.locator('.tool-menu-cat[data-group="review"]').click();
  const group = page.locator('.tool-menu-group[data-group="review"]');
  await expect(group).toBeVisible();
  // 件数は tool-menu.js の分類を正本にする (項目が増えるたびに数字を書き換えない)。
  const want = await page.evaluate(() => window.MA.toolMenu.panelGroups()
    .filter((g) => g.key === 'review')[0].items.length);
  await expect(group.locator('.tool-menu-item')).toHaveCount(want);
  await group.locator('[data-target="btn-tab-board"]').click();

  // メニューは選んだ時点で閉じ、元のボタンと同じパネルが開く
  await expect(page.locator('#tool-menu')).toBeHidden();
  await expect(page.locator('#cb-modal')).toBeVisible();
});

// BLK-owner-20260918-0329-prune: 「渡す」(zip にして渡す) の入口は Export ▾ に集めた。
// BLK-human-20260923-1601 (design 9b): 左列の地図としては 6 分類目に「渡す」が並ぶが、
// 押した先は Export ▾ と同じ 1 つの経路で、Export ▾ からも 3 つとも引ける。
test('「渡す」は Export ▾ にまとまり、ツールメニューからも同じ経路で開く', async ({ page }) => {
  await page.locator('#btn-tab-tools').click();
  await page.locator('.tool-menu-cat[data-group="give"]').click();
  await expect(page.locator('.tool-menu-group[data-group="give"]')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.locator('#btn-export').click();
  await expect(page.locator('#export-menu')).toBeVisible();
  for (const id of ['#exp-docset', '#exp-delivery', '#exp-handoff']) {
    await expect(page.locator(id)).toBeVisible();
  }
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
  await expect(page.locator('#btn-tab-board')).toBeVisible();

  await page.locator('#btn-tab-tools').click();
  await page.locator('#tool-menu-fold').click();

  // 畳んだ後もツール・＋・一覧はタブ列に残る
  await expect(page.locator('#btn-tab-board')).toBeHidden();
  await expect(page.locator('#btn-tab-handoff')).toBeHidden();
  await expect(page.locator('#btn-tab-new')).toBeVisible();
  await expect(page.locator('#btn-tab-folder')).toBeVisible();
  await expect(page.locator('#btn-tab-tools')).toBeVisible();

  // 畳んでもメニュー経由では引ける
  await page.locator('#btn-tab-tools').click();
  await pickTool(page, 'btn-tab-board');
  await expect(page.locator('#cb-modal')).toBeVisible();

  // 再読み込みしても畳んだ状態を憶えている
  await page.reload();
  await page.waitForSelector('#preview-svg');
  await expect(page.locator('#btn-tab-board')).toBeHidden();

  // 戻せる
  await page.locator('#btn-tab-tools').click();
  await page.locator('#tool-menu-fold').click();
  await expect(page.locator('#btn-tab-board')).toBeVisible();
});

// BLK-builder-20260908-0858-2: パネル類 (外側 click で閉じる作りのもの) をメニューから開くと、
// 選んだ click がそのまま document へ上がって開いた直後に閉じていた。
test('メニューから「この図の指摘」を開くと、パネルが開いたまま残る', async ({ page }) => {
  await page.locator('#btn-tab-tools').click();
  await pickTool(page, 'btn-tab-pins');
  await expect(page.locator('#pin-panel')).toHaveClass(/open/);
});

// BLK-human-20260923-1601 (design 9b): 左 6 分類・右小見出しの 2 段パネル。
// 縦 1 列に 40 件近く並んでいたときは「確かめる」「レビュー」が画面の下にはみ出していた。
test('分類はホバーで切り替わり、どの分類もパネル内をスクロールさせない', async ({ page }) => {
  await page.locator('#btn-tab-tools').click();
  const menu = page.locator('#tool-menu');
  await expect(menu).toBeVisible();

  // 開いた時点では 1 つ目の分類だけが右列に出ている
  await expect(page.locator('.tool-menu-group[data-group="make"]')).toBeVisible();
  await expect(page.locator('.tool-menu-group[data-group="review"]')).toBeHidden();

  // ホバーで右列が切り替わる
  await page.locator('.tool-menu-cat[data-group="review"]').hover();
  await expect(page.locator('.tool-menu-group[data-group="review"]')).toBeVisible();
  await expect(page.locator('.tool-menu-group[data-group="make"]')).toBeHidden();

  // 小見出しで区切って出る
  await expect(page.locator('.tool-menu-group[data-group="review"] .tool-menu-sub'))
    .toHaveText(['見比べる', '指摘', '変更の履歴']);

  // パネルの中は溢れない (1 画面に収まる)
  for (const key of ['make', 'edit', 'find', 'check', 'review', 'give']) {
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

  // 「渡す」の項目も「レビュー」の項目も、分類を開かずに候補へ出る
  await filter.fill('zip');
  const hits = page.locator('.tool-menu-hits .tool-menu-item');
  await expect(hits).toHaveCount(2);
  await filter.fill('サマリ');
  await expect(page.locator('.tool-menu-hits [data-target="btn-tab-board"]')).toBeVisible();

  // Enter でそのまま開く
  await page.keyboard.press('Enter');
  await expect(page.locator('#tool-menu')).toBeHidden();
  await expect(page.locator('#cb-modal')).toBeVisible();
});

test('←→ で分類、↑↓ で項目を選び、Enter で開く', async ({ page }) => {
  await page.locator('#btn-tab-tools').click();
  // 図をつくる → 書き換える → 探す → 確かめる → レビュー
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight');
  await expect(page.locator('.tool-menu-cat[data-group="review"]'))
    .toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.tool-menu-group[data-group="review"]')).toBeVisible();

  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.tool-menu-item[data-target="btn-tab-compare"]'))
    .toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.tool-menu-item[data-target="btn-tab-board"]'))
    .toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('Enter');
  await expect(page.locator('#cb-modal')).toBeVisible();

  // Esc で閉じる
  await page.keyboard.press('Escape');
  await expect(page.locator('#tool-menu')).toBeHidden();
});
