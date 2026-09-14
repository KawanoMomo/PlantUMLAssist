// @ts-check
// BLK-junior-20260908-1203: Relation 追加フォームで From/To のどちらが親か分からず、
// 継承を逆向きに張ってしまう。種類ごとの呼び名と「押すとこう入る」の 1 行が出て、
// 追加する前に親子を確かめられること。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

const MINE = [
  '@startuml',
  'class GpioDrv',
  'abstract class DriverBase',
  '@enduml',
].join('\n');

async function openRelationForm(page) {
  await gotoApp(page);
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, MINE);
  await page.waitForTimeout(1500);
  await page.locator('#cl-tail-kind').selectOption('relation');
  await expect(page.locator('#cl-tail-rkind')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
});

test('継承を選ぶと From/To が 親/子 と呼ばれる', async ({ page }) => {
  await openRelationForm(page);
  await expect(page.locator('#cl-tail-from-label')).toHaveText('一方 (From)');
  await page.locator('#cl-tail-rkind').selectOption('inheritance');
  await expect(page.locator('#cl-tail-from-label')).toHaveText('親 (From)');
  await expect(page.locator('#cl-tail-to-label')).toHaveText('子 (To)');
});

test('種類ごとに呼び名が変わる', async ({ page }) => {
  await openRelationForm(page);
  await page.locator('#cl-tail-rkind').selectOption('composition');
  await expect(page.locator('#cl-tail-from-label')).toHaveText('全体 (From)');
  await expect(page.locator('#cl-tail-to-label')).toHaveText('部分 (To)');
});

test('「こう入る」の 1 行が、実際に足される行と一致する', async ({ page }) => {
  await openRelationForm(page);
  await page.locator('#cl-tail-rkind').selectOption('inheritance');
  await page.locator('#cl-tail-from').selectOption('DriverBase');
  await page.locator('#cl-tail-to').selectOption('GpioDrv');
  await expect(page.locator('#cl-tail-rpreview')).toContainText('DriverBase <|-- GpioDrv');
  await expect(page.locator('#cl-tail-rpreview')).toContainText('親: DriverBase');

  await page.locator('#cl-tail-add').click();
  await page.waitForTimeout(600);
  expect(await getEditorText(page)).toContain('DriverBase <|-- GpioDrv');
});

test('逆に選んでしまっても、押す前に下書きで気づいて ⇄ 入替で直せる', async ({ page }) => {
  await openRelationForm(page);
  await page.locator('#cl-tail-rkind').selectOption('inheritance');
  // 親のつもりで子を選んでしまった状態。
  await page.locator('#cl-tail-from').selectOption('GpioDrv');
  await page.locator('#cl-tail-to').selectOption('DriverBase');
  await expect(page.locator('#cl-tail-rpreview')).toContainText('GpioDrv <|-- DriverBase');

  await page.locator('#cl-tail-rswap').click();
  await expect(page.locator('#cl-tail-rpreview')).toContainText('DriverBase <|-- GpioDrv');
  await page.locator('#cl-tail-add').click();
  await page.waitForTimeout(600);

  const dsl = await getEditorText(page);
  expect(dsl).toContain('DriverBase <|-- GpioDrv');
  expect(dsl).not.toContain('GpioDrv <|-- DriverBase');
});

test('既にある関係を選び直すときも同じ呼び名で出る', async ({ page }) => {
  await gotoApp(page);
  await page.evaluate(() => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = '@startuml\nclass GpioDrv\nabstract class DriverBase\nDriverBase <|-- GpioDrv\n@enduml';
    ed.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(1500);
  // Class 図のオーバーレイは関係の矩形を描かないので、アプリの選択 API を使う。
  await page.evaluate(() => {
    const text = document.getElementById('editor').value;
    const rel = window.MA.modules.plantumlClass.parse(text).relations[0];
    window.MA.selection.setSelected([{ type: 'relation', id: rel.id, line: rel.line }]);
  });
  await expect(page.locator('#cl-rel-from')).toBeVisible();
  await expect(page.locator('#props-content')).toContainText('親 (From)');
  await expect(page.locator('#props-content')).toContainText('子 (To)');
});
