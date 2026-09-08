// @ts-check
// BLK-junior-20260907-1703-wish: 先輩の図と自分の図が「同じ形か」を構造タブで数合わせする。
// 従来は 1 枚の内訳しか出ず、タブを開き直して指で数え直すしかなかった。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

// 先輩の図: クラス 4・関連 3
const SENIOR = [
  '@startuml',
  'class Driver_Common',
  'class GpioDrv',
  'class UartDrv',
  'class CanDrv',
  'Driver_Common <|-- GpioDrv',
  'Driver_Common <|-- UartDrv',
  'Driver_Common <|-- CanDrv',
  '@enduml',
].join('\n');

// 自分の図: 関連を 1 本書き忘れている
const MINE_SHORT = [
  '@startuml',
  'class Base',
  'class CanDrv',
  'class CanIf',
  'class CanTp',
  'Base <|-- CanDrv',
  'Base <|-- CanIf',
  '@enduml',
].join('\n');

const MINE_SAME = MINE_SHORT.replace('@enduml', 'Base <|-- CanTp\n@enduml');

const MINE_STATE = [
  '@startuml',
  'state Idle',
  'state Busy',
  'Idle --> Busy : Start',
  '@enduml',
].join('\n');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(1200);
}

// 1 枚目 = 先輩の図、2 枚目 = 自分の図
async function twoTabs(page, mine) {
  await gotoApp(page);
  await typeDsl(page, SENIOR);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(600);
  await typeDsl(page, mine);
  await page.locator('#btn-editor-tab-outline').click();
  await page.waitForTimeout(600);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
});

test('構造タブに参照図の選択と数合わせの一行が出る', async ({ page }) => {
  await twoTabs(page, MINE_SHORT);
  await expect(page.locator('#outline-cmp-select')).toBeVisible();
  // 編集中のタブ自身は候補にしない
  await expect(page.locator('#outline-cmp-select option')).toHaveCount(1);
  await expect(page.locator('#outline-cmp-result')).toContainText('relation が 1 足りません');
  await expect(page.locator('#outline-cmp-result')).toContainText('自分 2 / 参照 3');
  await expect(page.locator('#outline-cmp-result')).toHaveClass(/diff/);
});

test('数が合えば「同じ形です」と出る (先輩と同じ 4 classes · 3 relations)', async ({ page }) => {
  // 両方のタブを Class にすると、数合わせも構造タブの一行と同じ語彙 (classes) で出る
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(500);
  await typeDsl(page, SENIOR);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(600);
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(500);
  await typeDsl(page, MINE_SAME);
  await page.locator('#btn-editor-tab-outline').click();
  await page.waitForTimeout(600);
  await expect(page.locator('#outline-cmp-result')).toContainText('同じ形です (4 classes · 3 relations)');
  await expect(page.locator('#outline-cmp-result')).toHaveClass(/same/);
});

test('足りない関連を足すと、その場で「同じ形です」に変わる', async ({ page }) => {
  await twoTabs(page, MINE_SHORT);
  await expect(page.locator('#outline-cmp-result')).toContainText('足りません');
  // 構造タブを開いたまま DSL を直しても数合わせは追随する
  await typeDsl(page, MINE_SAME);
  await page.locator('#btn-editor-tab-outline').click();
  await page.waitForTimeout(500);
  await expect(page.locator('#outline-cmp-result')).toContainText('同じ形です');
});

test('図種が違う参照図とは比べずに、その理由を出す', async ({ page }) => {
  await twoTabs(page, MINE_STATE);
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(800);
  await page.locator('#btn-editor-tab-outline').click();
  await page.waitForTimeout(500);
  await expect(page.locator('#outline-cmp-result')).toContainText('図種が違うので数を比べられません');
});

test('タブが 1 枚しかなければ、開き方を案内する', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, SENIOR);
  await page.locator('#btn-editor-tab-outline').click();
  await page.waitForTimeout(500);
  await expect(page.locator('#outline-cmp-select')).toBeDisabled();
  await expect(page.locator('#outline-cmp-result')).toContainText('もう 1 枚開く');
});

test('数合わせに要る手数: 構造タブを開くクリック 1 回だけ (数え直しのキー入力 0)', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, SENIOR);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(600);
  await typeDsl(page, MINE_SHORT);

  await page.evaluate(() => {
    window.__m = { clicks: 0, keys: 0 };
    document.addEventListener('click', function() { window.__m.clicks++; }, true);
    document.addEventListener('keydown', function() { window.__m.keys++; }, true);
  });
  await page.locator('#btn-editor-tab-outline').click();
  await page.waitForTimeout(600);
  await expect(page.locator('#outline-cmp-result')).toContainText('足りません');

  const m = await page.evaluate(() => window.__m);
  console.log('BLK-junior-1703-wish 実測: クリック ' + m.clicks + ' / キー ' + m.keys);
  expect(m.clicks).toBeLessThanOrEqual(1);
  expect(m.keys).toBe(0);
});
