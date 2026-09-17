// @ts-check
// BLK-primary-20260908-1803: 畳んだ機能の入口が Ctrl+K のコマンド名しか無い状態を作らない。
// 「📦 引き継ぎ」のような、自分だけでなく新人も使う機能まで Ctrl+K の検索語を知らないと
// 辿り着けなかった。静かなタブ列でも「他 N 件」の札を 1 クリックすれば一覧が開く。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

// アプリの既定 (畳む + 静か) をそのまま見る。
async function openDefault(page) {
  await gotoApp(page, { foldedTools: true });
}

test('既定のタブ列に「他 N 件」の札が出る (ツール ▾ は出ない)', async ({ page }) => {
  await openDefault(page);
  await expect(page.locator('#btn-tab-tools')).toBeHidden();
  const mini = page.locator('#btn-tab-tools-mini');
  await expect(mini).toBeVisible();
  // 件数は畳んでいるボタンの数。0 のままではない。
  const label = (await mini.textContent()) || '';
  const m = /他 (\d+) 件/.exec(label);
  expect(m).not.toBeNull();
  expect(Number(m && m[1])).toBeGreaterThan(20);
});

test('札を 1 クリックで畳んだ一覧が開き、そこから引き継ぎを開ける', async ({ page }) => {
  await openDefault(page);
  await page.locator('#btn-tab-tools-mini').click();
  await expect(page.locator('#tool-menu')).toBeVisible();
  await expect(page.locator('#tool-menu .tool-menu-title')).toHaveText([
    '図をつくる', '書き換える', '探す・見比べる', '確かめる', 'レビュー',
  ]);
  // BLK-owner-20260918-0329-prune: 「引き継ぎ zip」の入口は Export ▾ の「渡す」へ移した。
  // コマンド名を知らなくても目で見つかることは変わらない。
  await page.keyboard.press('Escape');
  await page.locator('#btn-export').click();
  const item = page.locator('#exp-handoff');
  await expect(item).toBeVisible();
  await expect(item).toHaveText(/引き継ぎ/);
  await item.click();
  // 引き継ぎは押すとまず「対象確認」を出し、書き出しはそこから始まる。
  await expect(page.locator('#et-modal')).toBeVisible();
  const dl = page.waitForEvent('download', { timeout: 60000 });
  await page.locator('#et-build').click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/^handoff-\d{8}-\d{4}\.zip$/);
});

// 起票者の手順 (「📦 引き継ぎ」に辿り着く) をクリックとキー入力で実測する。
// 以前は Ctrl+K を開いて「引き継ぎ」と打つしかなく、コマンド名を知らないと 0 回では届かない。
test('引き継ぎに辿り着く手数を実測する (クリック 10 以下 / キー入力 50 以下)', async ({ page }) => {
  await openDefault(page);
  let clicks = 0;
  let keys = 0;
  const click = async (sel) => { clicks += 1; await page.locator(sel).click(); };

  await click('#btn-export');
  await expect(page.locator('#export-menu')).toBeVisible();
  await click('#exp-handoff');
  await expect(page.locator('#et-modal')).toBeVisible();
  const dl = page.waitForEvent('download', { timeout: 60000 });
  await click('#et-build');
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/^handoff-\d{8}-\d{4}\.zip$/);

  expect(clicks).toBeLessThanOrEqual(10);
  expect(keys).toBeLessThanOrEqual(50);
  console.log('BLK-primary-20260908-1803: クリック ' + clicks + ' / キー入力 ' + keys);
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

test('「ツール ▾」を出す選択をすると札は引っ込む (入口は 1 つだけ)', async ({ page }) => {
  await openDefault(page);
  await page.locator('#btn-tab-tools-mini').click();
  await page.locator('#tool-menu-quiet').click();
  await expect(page.locator('#btn-tab-tools')).toBeVisible();
  await expect(page.locator('#btn-tab-tools-mini')).toBeHidden();
  // 畳みを解いて機能ボタンを並べても、札は出ない。
  await page.locator('#btn-tab-tools').click();
  await page.locator('#tool-menu-fold').click();
  // BLK-owner-20260918-0329-prune: 引き継ぎはタブ列に戻らない (入口は Export ▾)。
  // タブ列に戻るのは畳んでいた他の道具。
  await expect(page.locator('#btn-tab-board')).toBeVisible();
  await expect(page.locator('#btn-tab-handoff')).toBeHidden();
  await expect(page.locator('#btn-tab-tools-mini')).toBeHidden();
});
