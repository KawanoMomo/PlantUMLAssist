// @ts-check
// BLK-primary-20260908-0823-design (design 7a): ツールを 1 か所に畳む。
// primary は「レビュー会議で見せる ▤ 変更サマリ」と「納品する 📂 一覧 → SVG」の間で
// 目的の違うボタンをタブ列から目で探していた。分類だけを開いて選べることを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp, pickTool } = require('../helpers');

test.beforeEach(async ({ page }) => {
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

// TICKET-owner-20261123-0222-prune: タブ列に道具のボタンを並べる切り替え (畳む / タブ列から畳む /
// ツール ▾ を右端へ戻す) を外し、道具の入口は右端の「ツール ▾」1 つにした。以前に切り替えた人
// (localStorage に plantuml-tools-folded=0 / plantuml-tools-quiet=0 が残る人) も既定と同じタブ列で開く。
for (const [label, stored] of [['既定の画面', null], ['以前に畳まない を選んだ人の画面', { 'plantuml-tools-folded': '0', 'plantuml-tools-quiet': '0' }]]) {
  test('タブ列は 図のタブ・＋・ツール ▾ だけで、ツール ▾ の一覧に切り替えの行は無い — ' + label, async ({ page }, testInfo) => {
    if (stored) {
      await page.addInitScript((kv) => {
        try { Object.keys(kv).forEach((k) => window.localStorage.setItem(k, kv[k])); } catch (e) {}
      }, stored);
      await page.reload();
      await page.waitForSelector('html[data-app-ready="1"]', { state: 'attached' });
    }
    // タブ列に見えているボタンは 図のタブ・＋・ツール ▾ の 3 種だけ
    const kinds = await page.evaluate(() => {
      const bar = document.getElementById('tab-bar');
      const out = [];
      bar.querySelectorAll(':scope > *').forEach((el) => {
        if (!el.offsetParent || el.getBoundingClientRect().width === 0) return;
        if (el.classList.contains('tab')) out.push('tab');
        else out.push(el.id || el.className);
      });
      return out;
    });
    expect(kinds.filter((k) => k !== 'tab')).toEqual(['btn-tab-new', 'btn-tab-tools']);
    expect(kinds.filter((k) => k === 'tab').length).toBeGreaterThan(0);
    await expect(page.locator('#tab-bar button', { hasText: 'ツール ▾' })).toHaveCount(1);
    await expect(page.locator('#tab-bar button', { hasText: /一括置換|行編集|変遷/ })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(stored ? 'tab-bar-stored.png' : 'tab-bar-default.png') });

    // ツール ▾ の一覧は 2 行だけで、下端の切り替えの行は無い
    await page.locator('#btn-tab-tools').click();
    const menu = page.locator('#tool-menu');
    await expect(menu.locator('.tool-menu-list .tool-menu-item .tool-menu-label')).toHaveText([
      '行を書き換える', '部品名を一括置換する',
    ]);
    await expect(menu.locator('.tool-menu-item', { hasText: /畳む|右端へ戻す|タブ列に/ })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(stored ? 'tool-menu-stored.png' : 'tool-menu-default.png') });

    // 各行・Ctrl+H・Ctrl+K「この図の履歴を見る」が今と同じ窓を開く
    await pickTool(page, 'tool-lines');
    await expect(page.locator('#lines-panel')).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await page.locator('#btn-tab-tools').click();
    await pickTool(page, 'tool-rename');
    await expect(page.locator('#rename-panel')).toHaveClass(/open/);
    await page.locator('#btn-rename-cancel').click();
    await expect(page.locator('#rename-panel')).not.toHaveClass(/open/);
    await page.locator('#editor').click();
    await page.keyboard.press('Control+h');
    await expect(page.locator('#rename-panel')).toHaveClass(/open/);
    await page.locator('#btn-rename-cancel').click();
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('この図の履歴を見る');
    await page.keyboard.press('Enter');
    await expect(page.locator('#vt-modal')).toBeVisible();
  });
}

// BLK-builder-20260908-0858-2: パネル類 (外側 click で閉じる作りのもの) をメニューから開くと、
// 選んだ click がそのまま document へ上がって開いた直後に閉じていた。
// (この図の指摘 は 1840-prune、レビューの分類 (基準の図との指摘・前回保存からの差分) は
// TICKET-owner-20261115-2141-prune で外したので、同じ作りの「行を書き換える」で見る)
test('メニューから「行を書き換える」を開くと、パネルが開いたまま残る', async ({ page }) => {
  await page.locator('#btn-tab-tools').click();
  await pickTool(page, 'tool-lines');
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
  await expect(hits.first()).toHaveAttribute('data-target', 'tool-rename');
  await filter.fill('行を書き換える');
  await expect(page.locator('.tool-menu-hits [data-target="tool-lines"]')).toBeVisible();

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
  await expect(page.locator('.tool-menu-item[data-target="tool-lines"]'))
    .toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('Enter');
  await expect(page.locator('#lines-panel')).toHaveClass(/open/);

  // Esc で閉じる
  await page.keyboard.press('Escape');
  await expect(page.locator('#tool-menu')).toBeHidden();
});
