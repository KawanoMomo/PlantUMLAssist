// @ts-check
// BLK-junior-20260908-0923-wish: 対応表の不一致行を先輩・reviewer に預ける。
// junior は名前も抽象度も違う 2 枚を突き合わせても「先輩が後から足した 1 要素」を
// 自分では選べず、そこで手詰まりになっていた。不一致行から質問 1 件を出して
// 答えを待たずに次へ進めること、二重に聞かないことを見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText, saveDirFor } = require('./helpers');

// 先輩 (primary) の図。Disabled と、そこへの遷移が自分の図に無い。
const SENIOR = [
  '@startuml',
  '[*] --> Idle',
  'state Idle',
  'state Ready',
  'state Disabled',
  'Idle --> Ready : init',
  'Idle --> Disabled : disable',
  '@enduml',
].join('\n');

// 自分 (junior) の図。AnomalyCheck は自分にしか無い。
const MINE = [
  '@startuml',
  '[*] --> Idle',
  'state Idle',
  'state Ready',
  'state AnomalyCheck',
  'Idle --> Ready : init',
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

async function openMap(page) {
  await gotoApp(page);
  await typeDsl(page, SENIOR);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(600);
  await typeDsl(page, MINE);
  await page.locator('#btn-tab-compare').click();
  await expect(page.locator('#compare-pane')).toBeVisible();
  await page.locator('#btn-map-run').click();
  await expect(page.locator('#map-list')).toBeVisible();
}

function row(page, match, type, text) {
  return page.locator('.map-row[data-map-match="' + match + '"][data-map-type="' + type + '"]',
    { hasText: text }).first();
}

const DIR = saveDirFor(__filename);

test.beforeEach(async ({ page }) => {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('pua.pin-inbox.me', 'junior');
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
});

test('不一致の行にだけ「先輩に聞く」が付く', async ({ page }) => {
  await openMap(page);
  // 参照図だけ・自分だけ・部分一致のどれにも付く。
  await expect(row(page, 'ref-only', 'state', 'Disabled').locator('.map-ask')).toHaveCount(1);
  await expect(row(page, 'mine-only', 'state', 'AnomalyCheck').locator('.map-ask')).toHaveCount(1);
  // 対応が付いた行は聞くことが無い。
  await expect(page.locator('.map-row[data-map-match="exact"] .map-ask')).toHaveCount(0);
});

test('1 回押すと質問が図に残り、答えを待たずに次へ進める', async ({ page }) => {
  await openMap(page);
  const before = await getEditorText(page);
  await row(page, 'ref-only', 'state', 'Disabled').locator('.map-ask').click();
  await page.waitForTimeout(600);

  const dsl = await getEditorText(page);
  expect(dsl).toContain("' @pin");
  expect(dsl).toContain('[?→ primary, reviewer]');
  expect(dsl).toContain('Disabled');
  expect(dsl).toContain('どちらが後から足したか分かりません');
  // 図そのものは変わらない (質問はコメント行)。
  expect(dsl.split('\n').filter((l) => l.trim().indexOf("' @pin") !== 0).join('\n')).toBe(before);
  // 聞いた件数が対応表の見出しに出る。
  await expect(page.locator('#map-asked')).toContainText('先輩に預けた質問 1 件 (未回答 1)');
});

test('聞いた行は「聞き済み」になり、二重に聞けない', async ({ page }) => {
  await openMap(page);
  const ask = row(page, 'ref-only', 'state', 'Disabled').locator('.map-ask');
  await ask.click();
  await page.waitForTimeout(600);
  const again = row(page, 'ref-only', 'state', 'Disabled').locator('.map-ask');
  await expect(again).toHaveText('✔ 聞き済み');
  await expect(again).toBeDisabled();
});

test('別の行は別の質問として預けられる', async ({ page }) => {
  await openMap(page);
  await row(page, 'ref-only', 'state', 'Disabled').locator('.map-ask').click();
  await page.waitForTimeout(600);
  await row(page, 'mine-only', 'state', 'AnomalyCheck').locator('.map-ask').click();
  await page.waitForTimeout(600);
  await expect(page.locator('#map-asked')).toContainText('先輩に預けた質問 2 件');
});

test('預けた質問は 📌 指摘の一覧に並ぶ', async ({ page }) => {
  await openMap(page);
  await row(page, 'ref-only', 'state', 'Disabled').locator('.map-ask').click();
  await page.waitForTimeout(600);
  await page.locator('#btn-tab-pins').click();
  await expect(page.locator('#pin-panel')).toHaveClass(/open/);
  await expect(page.locator('#pin-panel')).toContainText('[?→ primary, reviewer]');
});

test('「聞く」と「足す」は別のボタンで、聞いても図に要素は入らない', async ({ page }) => {
  await openMap(page);
  const target = row(page, 'ref-only', 'state', 'Disabled');
  await expect(target.locator('.map-take')).toHaveCount(1);
  await target.locator('.map-ask').click();
  await page.waitForTimeout(600);
  const dsl = await getEditorText(page);
  expect(dsl).not.toContain('\nstate Disabled');
});
