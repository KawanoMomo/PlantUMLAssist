// @ts-check
// BLK-junior-20260908-1103-wish: 対応表の橙の行に「＋この図にも足す」を添える。
// 見つけた要素を一括入力欄に打ち直さず、押すだけで自分の図に入ること。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText, saveDirFor } = require('./helpers');

// 先輩の図。Configured と Idle --> Configured が自分の図に無い。
const SENIOR = [
  '@startuml',
  '[*] --> Idle',
  'state Idle',
  'state Ready',
  'state Configured',
  'Idle --> Ready : init',
  'Idle --> Configured : configure',
  '@enduml',
].join('\n');

// 自分の図。名前の付け方が違う (Ready ではなく Ready_State)。
const MINE = [
  '@startuml',
  '[*] --> Idle',
  'state Idle',
  'state Ready_State',
  'Idle --> Ready_State : init',
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

async function openMap(page, mine) {
  await gotoApp(page);
  await typeDsl(page, SENIOR);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(600);
  await typeDsl(page, mine == null ? MINE : mine);
  await page.locator('#btn-tab-compare').click();
  await expect(page.locator('#compare-pane')).toBeVisible();
  await page.locator('#btn-map-run').click();
  await expect(page.locator('#map-list')).toBeVisible();
}

// hasText の文字列一致は大小を無視するので、状態 Configured と遷移 configure を
// 取り違えないように種別で絞る。
function refOnlyRow(page, type, text) {
  return page.locator('.map-row[data-map-match="ref-only"][data-map-type="' + type + '"]',
    { hasText: text }).first();
}

// 自動保存の書き込み先をこの spec 専用にする。既定のまま走ると成果物リポジトリ直下の
// autosave/ に図が残り、あとで走る spec がそれを 1 枚多い図として復元してしまう。
const DIR = saveDirFor(__filename);

test.beforeEach(async ({ page }) => {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
});

test('橙の行にだけ「＋この図にも足す」が付く', async ({ page }) => {
  await openMap(page);
  await expect(page.locator('.map-row[data-map-match="ref-only"] .map-take')).toHaveCount(2);
  // 対応が付いた行は自分の図に既にあるので、足すボタンを持たない。
  await expect(page.locator('.map-row[data-map-match="partial"] .map-take')).toHaveCount(0);
  await expect(page.locator('.map-row[data-map-match="exact"] .map-take')).toHaveCount(0);
});

test('橙の状態は 1 回押すだけで自分の図に入る', async ({ page }) => {
  await openMap(page);
  await refOnlyRow(page, 'state', 'Configured').locator('.map-take').click();
  await page.waitForTimeout(600);

  const dsl = await getEditorText(page);
  expect(dsl).toContain('state Configured');
  expect(dsl.indexOf('state Configured')).toBeLessThan(dsl.indexOf('@enduml'));
  // 足したぶん橙が減り、対応表は押した直後に作り直されている。
  await expect(page.locator('.map-row[data-map-match="ref-only"][data-map-type="state"]')).toHaveCount(0);
});

test('端点の対応が付いた遷移は聞き返さずに足せる', async ({ page }) => {
  await openMap(page);
  // 先に状態を足すと、遷移の端点は両方とも自分の状態に対応が付く。
  await refOnlyRow(page, 'state', 'Configured').locator('.map-take').click();
  await page.waitForTimeout(600);
  await refOnlyRow(page, 'transition', 'configure').locator('.map-take').click();
  await page.waitForTimeout(600);

  await expect(page.locator('#map-confirm')).toHaveCount(0);
  expect(await getEditorText(page)).toContain('Idle --> Configured : configure');
  await expect(page.locator('#map-summary')).toContainText('片方だけ 0 件');
});

test('端点の対応が付かない遷移は、どの状態にするかだけ聞く', async ({ page }) => {
  await openMap(page);
  // 状態を足す前に遷移を押すと、行き先 Configured が自分の図に無い。
  await refOnlyRow(page, 'transition', 'configure').locator('.map-take').click();
  await expect(page.locator('#map-confirm')).toBeVisible();
  await expect(page.locator('#map-confirm-lead')).toContainText('Configured');
  // 聞かれるのは対応の付かない行き先だけ。出どころ Idle は聞かれない。
  await expect(page.locator('#map-confirm-to')).toBeVisible();
  await expect(page.locator('#map-confirm-from')).toHaveCount(0);
});

test('聞き返しで自分の状態を選ぶと、その状態への遷移になる', async ({ page }) => {
  await openMap(page);
  await refOnlyRow(page, 'transition', 'configure').locator('.map-take').click();
  await page.locator('#map-confirm-to').selectOption('Ready_State');
  await page.locator('#btn-map-confirm-ok').click();
  await page.waitForTimeout(600);

  const dsl = await getEditorText(page);
  expect(dsl).toContain('Idle --> Ready_State : configure');
  expect(dsl).not.toContain('state Configured');
  await expect(page.locator('#map-confirm')).toHaveCount(0);
});

test('聞き返しで「新しく作る」を選ぶと、状態と遷移の両方が入る', async ({ page }) => {
  await openMap(page);
  await refOnlyRow(page, 'transition', 'configure').locator('.map-take').click();
  await page.locator('#btn-map-confirm-ok').click();
  await page.waitForTimeout(600);

  const dsl = await getEditorText(page);
  expect(dsl).toContain('state Configured');
  expect(dsl).toContain('Idle --> Configured : configure');
});

test('「やめる」を押せば図は変わらない', async ({ page }) => {
  await openMap(page);
  const before = await getEditorText(page);
  await refOnlyRow(page, 'transition', 'configure').locator('.map-take').click();
  await page.locator('#btn-map-confirm-cancel').click();
  await expect(page.locator('#map-confirm')).toHaveCount(0);
  expect(await getEditorText(page)).toBe(before);
});
