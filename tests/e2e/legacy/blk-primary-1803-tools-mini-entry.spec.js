// @ts-check
// BLK-primary-20260908-1803: 畳んだ機能の入口が Ctrl+K のコマンド名しか無い状態を作らない。
// 「📦 引き継ぎ」のような、自分だけでなく新人も使う機能まで Ctrl+K の検索語を知らないと
// 辿り着けなかった。静かなタブ列でも右端の「ツール ▾」の札を 1 クリックすれば一覧が開く。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

// アプリの既定 (畳む + 静か) をそのまま見る。
async function openDefault(page) {
  await gotoApp(page, { foldedTools: true });
}

// BLK-builder-20260924-1416-3 (design 7a / 9a / 10a): 札の文字は「ツール ▾」、件数は title。
test('既定のタブ列に「ツール ▾」の札が出る (展開用の ツール ▾ は出ない)', async ({ page }) => {
  await openDefault(page);
  await expect(page.locator('#btn-tab-tools')).toBeHidden();
  const mini = page.locator('#btn-tab-tools-mini');
  await expect(mini).toBeVisible();
  await expect(mini).toHaveText('ツール ▾');
  // 件数は畳んでいるボタンの数。0 のままではない。
  const title = (await mini.getAttribute('title')) || '';
  const m = /畳んでいるツール (\d+) 件/.exec(title);
  expect(m).not.toBeNull();
  // 整理 (1828-prune・TICKET-owner-20261115-2140-prune で「探す」を外した) で道具が減った。
  // 件数は 0 でなく、ツール ▾ の項目以上を数える (図をつくる は TICKET-owner-20261116-0321-prune で外した)。
  // 一括適用 は TICKET-owner-20261122-1023-prune で外した (行を書き換える・一括置換・この図の履歴 の 3 件)。
  expect(Number(m && m[1])).toBeGreaterThanOrEqual(3);
});

test('札を 1 クリックで畳んだ一覧が開く', async ({ page }) => {
  await openDefault(page);
  await page.locator('#btn-tab-tools-mini').click();
  await expect(page.locator('#tool-menu')).toBeVisible();
  // TICKET-roadmap-20261115-2114-2: 分類の列は無く、残った道具だけの 1 段の一覧。
  await expect(page.locator('#tool-menu .tool-menu-cat')).toHaveCount(0);
  await expect(page.locator('#tool-menu .tool-menu-list .tool-menu-item[data-target="btn-tab-lines"]')).toBeVisible();
});

test('もう一度押せば閉じ、Esc でも閉じる', async ({ page }) => {
  await openDefault(page);
  const mini = page.locator('#btn-tab-tools-mini');
  await mini.click();
  await expect(page.locator('#tool-menu')).toBeVisible();
  await expect(mini).toHaveAttribute('aria-expanded', 'true');
  await mini.click();
  await expect(page.locator('#tool-menu')).toBeHidden();
  await expect(mini).toHaveAttribute('aria-expanded', 'false');
  await mini.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#tool-menu')).toBeHidden();
});

// BLK-builder-20260924-1815-3: 切り替えはパネルから外した (既定の人には出さない)。
// 以前に選んだ人の設定 (localStorage) で「ツール ▾」を出している間も、入口は 1 つだけ。
test('「ツール ▾」を出す設定の人には札は出ない (入口は 1 つだけ)', async ({ page }) => {
  await openDefault(page);
  await page.evaluate(() => localStorage.setItem('plantuml-tools-quiet', '0'));
  await page.reload();
  await page.waitForSelector('#preview-svg');
  await expect(page.locator('#btn-tab-tools')).toBeVisible();
  await expect(page.locator('#btn-tab-tools-mini')).toBeHidden();
  // 畳みを解いて機能ボタンを並べている人にも、札は出ない。
  await page.evaluate(() => localStorage.setItem('plantuml-tools-folded', '0'));
  await page.reload();
  await page.waitForSelector('#preview-svg');
  // タブ列に戻るのは畳んでいた道具 (引き継ぎ・納品は TICKET-owner-20261115-1828-prune で外した)。
  await expect(page.locator('#btn-tab-lines')).toBeVisible();
  await expect(page.locator('#btn-tab-tools-mini')).toBeHidden();
});
