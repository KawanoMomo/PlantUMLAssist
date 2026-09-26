// @ts-check
// BLK-junior-20260908-0823-wish: 先輩の状態遷移図と自分の図の対応表。
// 名前も抽象度もばらばらな 2 枚を「読み比べて推測する」のをやめ、
// 片方にしか無い状態・遷移をハイライトから 1 つ選べるようにする。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

// 先輩 (primary) の図。Disabled と、そこへの遷移が 1 本多い。
const SENIOR = [
  '@startuml',
  '[*] --> Idle',
  'state Idle',
  'state Ready',
  'state Running',
  'state Disabled',
  'Idle --> Ready : init',
  'Ready --> Running : start',
  'Running --> Idle : stop',
  'Idle --> Disabled : disable',
  '@enduml',
].join('\n');

// 自分 (junior) の図。同じ骨格だが状態名の付け方が違う。
const MINE = [
  '@startuml',
  '[*] --> Idle',
  'state Idle',
  'state Ready_State',
  'state Running_State',
  'Idle --> Ready_State : init',
  'Ready_State --> Running_State : start',
  'Running_State --> Idle : stop',
  '@enduml',
].join('\n');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(1500);
}

// 先輩の図のタブ + 自分の図のタブ、の 2 枚を用意して参照ペインを開く。
async function openCompare(page, mine) {
  await gotoApp(page);
  await typeDsl(page, SENIOR);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(600);
  await typeDsl(page, mine == null ? MINE : mine);
  await page.locator('#btn-tab-compare').click();
  await expect(page.locator('#compare-pane')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
});

test('「対応表」で状態と遷移の対応が並ぶ', async ({ page }) => {
  await openCompare(page);
  await expect(page.locator('#map-list')).toBeHidden();

  await page.locator('#btn-map-run').click();
  await expect(page.locator('#map-list')).toBeVisible();
  await expect(page.locator('#map-list .map-head').first()).toContainText('状態');
  await expect(page.locator('#map-list .map-head').nth(1)).toContainText('遷移');
  await expect(page.locator('.map-row').first()).toBeVisible();
});

test('名前が違っても同じ状態には対応が付く', async ({ page }) => {
  await openCompare(page);
  await page.locator('#btn-map-run').click();

  // Ready と Ready_State は名前が違うが、語を共有するので結ばれる
  const ready = page.locator('.map-row[data-map-type="state"]', { hasText: 'Ready_State' }).first();
  await expect(ready).toContainText('Ready');
  await expect(ready).toHaveAttribute('data-map-match', 'partial');
});

test('先輩だけにある状態と遷移がハイライトされる', async ({ page }) => {
  await openCompare(page);
  await page.locator('#btn-map-run').click();

  const only = page.locator('.map-row[data-map-match="ref-only"]');
  await expect(only).toHaveCount(2);           // 状態 Disabled と、そこへの遷移
  await expect(only.first()).toContainText('Disabled');
  await expect(page.locator('#map-summary')).toContainText('参照図だけ 2');
  await expect(page.locator('#map-summary')).toHaveClass(/dirty/);
});

test('対応が付いた行を押すと自分の図のその行へ飛ぶ', async ({ page }) => {
  await openCompare(page);
  await page.locator('#btn-map-run').click();

  const row = page.locator('.map-row[data-map-type="state"][data-map-line]', { hasText: 'Ready_State' }).first();
  await row.click();
  await page.waitForTimeout(300);

  const sel = await page.evaluate(() => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    return ed.value.slice(ed.selectionStart, ed.selectionEnd);
  });
  expect(sel).toContain('Ready_State');
  expect(await getEditorText(page)).toContain('Running_State');
});

test('先輩だけの行は飛び先を持たない (参照図は読むだけ)', async ({ page }) => {
  await openCompare(page);
  await page.locator('#btn-map-run').click();
  const only = page.locator('.map-row[data-map-match="ref-only"]').first();
  await expect(only).not.toHaveAttribute('data-map-line', /.*/);
});

test('差が無ければ「片方だけ 0 件」と言い切る', async ({ page }) => {
  await openCompare(page, SENIOR);
  await page.locator('#btn-map-run').click();
  await expect(page.locator('#map-summary')).toContainText('片方だけ 0 件');
  await expect(page.locator('#map-summary')).toHaveClass(/clean/);
  await expect(page.locator('.map-row[data-map-match="ref-only"]')).toHaveCount(0);
});

test('抽象度が違いすぎる図では、対応が取れないことを先に言う', async ({ page }) => {
  const COARSE = [
    '@startuml',
    'state 動作中',
    'state 停止中',
    '動作中 --> 停止中 : 停止',
    '@enduml',
  ].join('\n');
  await gotoApp(page);
  await typeDsl(page, COARSE);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(600);
  await typeDsl(page, [
    '@startuml',
    'state Init', 'state Configuring', 'state Running', 'state Stopping',
    'Init --> Configuring : begin',
    '@enduml',
  ].join('\n'));
  await page.locator('#btn-tab-compare').click();
  await page.locator('#btn-map-run').click();

  await expect(page.locator('#map-warn')).toBeVisible();
  await expect(page.locator('#map-warn')).toContainText('抽象度が違う');
});

test('参照図を切り替えると前の対応表は消える', async ({ page }) => {
  await openCompare(page);
  await page.locator('#btn-map-run').click();
  await expect(page.locator('#map-list')).toBeVisible();

  // 3 枚目を足して参照を切り替える
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(600);
  await typeDsl(page, MINE);
  await page.locator('#compare-select').selectOption({ index: 1 });
  await page.waitForTimeout(400);
  await expect(page.locator('#map-list')).toBeHidden();
  await expect(page.locator('#map-summary')).toHaveText('');
});

test('参照ペインを開き直しても対応表のボタンは出ている', async ({ page }) => {
  await openCompare(page);
  await page.locator('#btn-compare-close').click();
  await expect(page.locator('#compare-pane')).toBeHidden();
  await page.locator('#btn-tab-compare').click();
  await expect(page.locator('#btn-map-run')).toBeVisible();
});
