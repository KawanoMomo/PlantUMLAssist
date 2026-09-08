// @ts-check
// BLK-builder-20260907-0803-3: design/「PlantUMLAssist - リデザイン案」1a の
// エディタペイン「DSL / 構造 (Outline)」タブ。図に何が宣言され関係が何本あるかを
// DSL 全文を読まずに掴み、行へ 1 クリックで飛べることを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const SEQ = [
  '@startuml',
  'title Sample Sequence',
  'actor User',
  'participant System',
  'database DB',
  'User -> System : Request',
  'System -> DB : Query',
  'DB --> System : Result',
  'System --> User : Response',
  '@enduml',
].join('\n');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(300);
}

async function openOutline(page) {
  await page.locator('#btn-editor-tab-outline').click();
  await expect(page.locator('#outline-pane')).toHaveClass(/open/);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { window.localStorage.clear(); } catch (e) {}
  });
});

test('DSL タブと構造タブを切り替えられる', async ({ page }) => {
  await gotoApp(page);
  // 既定は DSL タブ。エディタが見えていて構造ペインは閉じている。
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('#outline-pane')).not.toHaveClass(/open/);
  await expect(page.locator('#btn-editor-tab-dsl')).toHaveClass(/active/);

  await openOutline(page);
  await expect(page.locator('#editor')).not.toBeVisible();
  await expect(page.locator('#btn-editor-tab-outline')).toHaveClass(/active/);

  await page.locator('#btn-editor-tab-dsl').click();
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('#outline-pane')).not.toHaveClass(/open/);
});

test('構造タブが要素と関係を一覧し、パース状況を数で出す', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, SEQ);
  await openOutline(page);

  await expect(page.locator('#outline-summary'))
    .toHaveText('パース OK · 3 elements · 4 relations');

  const rows = page.locator('#outline-list .outline-row');
  // title 1 + 宣言 3 + 関係 4
  await expect(rows).toHaveCount(8);
  await expect(rows.nth(1)).toContainText('User');
  await expect(page.locator('#outline-list .outline-row[data-outline-kind="relation"]'))
    .toHaveCount(4);
});

test('構造の行をクリックすると DSL タブへ戻ってその行が選択される', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, SEQ);
  await openOutline(page);

  // 3 本目の関係 (DB --> System : Result) は DSL の 8 行目 (index 7)
  await page.locator('#outline-list .outline-row[data-outline-line="7"]').click();

  await expect(page.locator('#editor')).toBeVisible();
  const picked = await page.evaluate(() => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    return ed.value.substring(ed.selectionStart, ed.selectionEnd);
  });
  expect(picked).toBe('DB --> System : Result');
});

test('絞り込みで目的の要素だけに減る', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, SEQ);
  await openOutline(page);

  await page.locator('#outline-filter').fill('query');
  await expect(page.locator('#outline-list .outline-row')).toHaveCount(1);
  await expect(page.locator('#outline-list .outline-row')).toContainText('Query');

  await page.locator('#outline-filter').fill('存在しない名前');
  await expect(page.locator('#outline-list .outline-empty')).toBeVisible();

  await page.locator('#outline-filter').fill('');
  await expect(page.locator('#outline-list .outline-row')).toHaveCount(8);
});

test('閉じ忘れたブロックはパース NG として構造タブに出る', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, [
    '@startuml',
    'A -> B : ping',
    'alt ok',
    '  B --> A : pong',
    '@enduml',
  ].join('\n'));
  await openOutline(page);

  await expect(page.locator('#outline-summary')).toContainText('パース NG');
  await expect(page.locator('#outline-summary')).toHaveClass(/ng/);
});

test('構造タブを開いたまま DSL を変えると一覧が追随する', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, SEQ);
  await openOutline(page);
  await expect(page.locator('#outline-summary')).toContainText('4 relations');

  await typeDsl(page, SEQ.replace('@enduml', 'User -> DB : Direct\n@enduml'));
  await expect(page.locator('#outline-summary')).toContainText('5 relations');
});
