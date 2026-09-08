// @ts-check
// BLK-builder-20260907-1243-1 / design 4a
// 「その他（constructor / static / abstract / ジェネリクス / 内部クラス）… ▾」
// 細かい指定は畳み、開いたときだけ constructor / ジェネリクス / 内部クラスを出す。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

const CLS = [
  '@startuml',
  'class Circle {',
  '  - radius : double',
  '}',
  '@enduml',
].join('\n');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(2500);
}

async function selectClass(page, id) {
  await page.evaluate((cid) => {
    const parsed = window.MA.modules.plantumlClass.parse(
      /** @type {HTMLTextAreaElement} */ (document.getElementById('editor')).value);
    const el = parsed.elements.filter((e) => e.id === cid)[0];
    window.MA.selection.setSelected([{ type: el.kind, id: el.id, line: el.line }]);
  }, id);
  await page.waitForTimeout(300);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
});

test('「その他」は畳まれていて、開くと constructor / ジェネリクス / 内部クラスが出る', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, CLS);
  await selectClass(page, 'Circle');

  const more = page.locator('#cl-more');
  await expect(more).toBeVisible();
  await expect(more).toContainText('その他（constructor / static / abstract / ジェネリクス / 内部クラス）');
  // 既定は閉じている (ジェネリクスを持たないクラス)
  expect(await more.evaluate((el) => /** @type {HTMLDetailsElement} */ (el).open)).toBe(false);
  // 畳まれている間は中の入口が見えない
  await expect(page.locator('#cl-ctor-go')).toBeHidden();

  await page.locator('#cl-more-summary').click();
  await expect(page.locator('#cl-ctor-go')).toBeVisible();
  await expect(page.locator('#cl-edit-generics')).toBeVisible();
  await expect(page.locator('#cl-nested-go')).toBeVisible();
});

test('constructor を追加するとクラス名と同じ名前の行が DSL に入る', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, CLS);
  await selectClass(page, 'Circle');

  await page.locator('#cl-more-summary').click();
  await page.locator('#cl-ctor-params').fill('r : double');
  await page.locator('#cl-ctor-go').click();
  await page.waitForTimeout(1500);

  expect(await getEditorText(page)).toContain('+ Circle(r : double)');
});

test('内部クラスを追加すると宣言と +-- の入れ子関連が入る', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, CLS);
  await selectClass(page, 'Circle');

  await page.locator('#cl-more-summary').click();
  await page.locator('#cl-nested-name').fill('Builder');
  await page.locator('#cl-nested-go').click();
  await page.waitForTimeout(1500);

  const dsl = await getEditorText(page);
  expect(dsl).toContain('class Builder {');
  expect(dsl).toContain('Circle +-- Builder');
});

test('ジェネリクスを持つクラスでは「その他」が開いた状態で出る', async ({ page }) => {
  await gotoApp(page);
  await typeDsl(page, '@startuml\nclass Box<T> {\n}\n@enduml');
  await selectClass(page, 'Box');

  const more = page.locator('#cl-more');
  expect(await more.evaluate((el) => /** @type {HTMLDetailsElement} */ (el).open)).toBe(true);
  await expect(page.locator('#cl-edit-generics')).toHaveValue('T');
});
