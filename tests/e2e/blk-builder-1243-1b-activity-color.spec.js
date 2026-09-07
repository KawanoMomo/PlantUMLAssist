// @ts-check
// BLK-builder-20260907-1243-1b / design 5d Activity「その他パレット」の色指定。
// 色を付けた行が図の要素として見えつづけ、右ペインの「その他（色）」で付け外しできる。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const ACT = [
  '@startuml',
  'title Sample Activity',
  'start',
  ':入力を受け取る;',
  '#LightBlue:保存する;',
  'stop',
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

// 該当行のアクションを選ぶ (SVG の当たり判定に依存しない)。
async function selectActionAtLine(page, line) {
  await page.evaluate((ln) => {
    const parsed = window.MA.modules.plantumlActivity.parse(
      /** @type {HTMLTextAreaElement} */ (document.getElementById('editor')).value);
    const n = parsed.nodes.filter((x) => x.kind === 'action' && x.line === ln)[0];
    window.MA.selection.setSelected([{ type: 'action', id: n.id, line: n.line }]);
  }, line);
  await page.waitForTimeout(300);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
});

test('色つきのアクションもアクションとして読める', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await typeDsl(page, ACT);

  const acts = await page.evaluate(() => {
    const parsed = window.MA.modules.plantumlActivity.parse(
      /** @type {HTMLTextAreaElement} */ (document.getElementById('editor')).value);
    return parsed.nodes.filter((n) => n.kind === 'action').map((n) => [n.text, n.color]);
  });
  expect(acts).toEqual([['入力を受け取る', null], ['保存する', '#LightBlue']]);
});

test('色の無いアクションでは「その他（色）」が畳まれていて、開いて色を付けられる', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await typeDsl(page, ACT);
  await selectActionAtLine(page, 4);

  const more = page.locator('#ac-action-more');
  await expect(more).toBeVisible();
  await expect(more).toContainText('その他（色）');
  expect(await more.evaluate((el) => /** @type {HTMLDetailsElement} */ (el).open)).toBe(false);

  await page.locator('#ac-action-more-summary').click();
  await page.locator('#ac-action-more button[data-value="#Pink"]').click();
  await page.waitForTimeout(1500);

  expect(await getEditorText(page)).toContain('#Pink:入力を受け取る;');
});

test('色の付いたアクションでは開いた状態で出て、「なし」で色を外せる', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await typeDsl(page, ACT);
  await selectActionAtLine(page, 5);

  const more = page.locator('#ac-action-more');
  expect(await more.evaluate((el) => /** @type {HTMLDetailsElement} */ (el).open)).toBe(true);
  await expect(more).toContainText('#LightBlue');

  await page.locator('#ac-action-more button[data-value=""]').click();
  await page.waitForTimeout(1500);

  const dsl = await getEditorText(page);
  expect(dsl).toContain(':保存する;');
  expect(dsl).not.toContain('#LightBlue');
});

test('本文を書き換えても色は残る', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await typeDsl(page, ACT);
  await selectActionAtLine(page, 5);

  await page.locator('#ac-action-text').fill('DB へ保存する');
  await page.locator('#ac-action-update').click();
  await page.waitForTimeout(1500);

  expect(await getEditorText(page)).toContain('#LightBlue:DB へ保存する;');
});
