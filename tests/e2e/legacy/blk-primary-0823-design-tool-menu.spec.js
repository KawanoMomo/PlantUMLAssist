// @ts-check
// BLK-primary-20260908-0823-design (design 7a): ツールを 1 か所に畳む。
// primary は「レビュー会議で見せる ▤ 変更サマリ」と「納品する 📂 一覧 → SVG」の間で
// 目的の違うボタンをタブ列から目で探していた。分類だけを開いて選べることを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

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
  await expect(menu.locator('.tool-menu-title')).toHaveText([
    '図をつくる', '書き換える', '探す', '確かめる', 'レビュー',
  ]);
  await expect(menu.locator('.tool-menu-note')).toHaveText('Ctrl+K でも同じ操作が引ける');
  await expect(page.locator('#btn-tab-tools')).toHaveAttribute('aria-expanded', 'true');
});

test('「レビュー」の分類から変更サマリを開ける', async ({ page }) => {
  await page.locator('#btn-tab-tools').click();
  const group = page.locator('.tool-menu-group[data-group="review"]');
  // 件数は tool-menu.js の分類を正本にする (項目が増えるたびに数字を書き換えない)。
  const want = await page.evaluate(() => window.MA.toolMenu.groups()
    .filter((g) => g.key === 'review')[0].items.length);
  await expect(group.locator('.tool-menu-item')).toHaveCount(want);
  await group.locator('[data-target="btn-tab-board"]').click();

  // メニューは選んだ時点で閉じ、元のボタンと同じパネルが開く
  await expect(page.locator('#tool-menu')).toBeHidden();
  await expect(page.locator('#cb-modal')).toBeVisible();
});

// BLK-owner-20260918-0329-prune: 「渡す」(zip にして渡す) の入口は Export ▾ に集めた。
// ツールメニューにはもう出さず、Export ▾ の「渡す」から 3 つとも引ける。
test('「渡す」は Export ▾ にまとまり、ツールメニューには出ない', async ({ page }) => {
  await page.locator('#btn-tab-tools').click();
  await expect(page.locator('.tool-menu-group[data-group="give"]')).toHaveCount(0);
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
  await page.locator('[data-target="btn-tab-board"]').click();
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
  await page.locator('[data-target="btn-tab-pins"]').click();
  await expect(page.locator('#pin-panel')).toHaveClass(/open/);
});
