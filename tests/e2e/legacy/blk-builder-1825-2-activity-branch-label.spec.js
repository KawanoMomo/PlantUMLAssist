// @ts-check
// BLK-builder-20260907-1825-2 / design 5d Activity「その他パレット」の分岐ラベル。
// then / elseif / else のラベルを prompt ではなく右ペインのフォームで直せる。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

const ACT = [
  '@startuml',
  'title Sample Activity',
  'start',
  'if (認証成功?) then (yes)',
  '  :続行;',
  'elseif (再試行可?) then (maybe)',
  '  :再試行;',
  'else (no)',
  '  :中断;',
  'endif',
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

// if を選ぶ (SVG の当たり判定に依存しない)。
async function selectIf(page) {
  await page.evaluate(() => {
    const parsed = window.MA.modules.plantumlActivity.parse(
      /** @type {HTMLTextAreaElement} */ (document.getElementById('editor')).value);
    const n = parsed.nodes.filter((x) => x.kind === 'if')[0];
    window.MA.selection.setSelected([{ type: 'decision', id: n.id, line: n.line }]);
  });
  await page.waitForTimeout(300);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
});

test('分岐ラベルが右ペインの入力欄に出る (prompt を開かない)', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await typeDsl(page, ACT);
  await selectIf(page);

  await expect(page.locator('#ac-if-cond')).toHaveValue('認証成功?');
  await expect(page.locator('#ac-branch-lbl-0')).toHaveValue('yes');
  await expect(page.locator('#ac-branch-lbl-1')).toHaveValue('maybe');
  await expect(page.locator('#ac-branch-cond-1')).toHaveValue('再試行可?');
  await expect(page.locator('#ac-branch-lbl-2')).toHaveValue('no');
  // prompt を開く旧ボタンは無い
  await expect(page.locator('#ac-branch-edit-0')).toHaveCount(0);
});

test('条件と 3 つのラベルを 1 回の「更新」で書き戻せる', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await typeDsl(page, ACT);
  await selectIf(page);

  await page.locator('#ac-if-cond').fill('認証OK?');
  await page.locator('#ac-branch-lbl-0').fill('通過');
  await page.locator('#ac-branch-cond-1').fill('残り回数あり?');
  await page.locator('#ac-branch-lbl-1').fill('再試行');
  await page.locator('#ac-branch-lbl-2').fill('それ以外');
  await page.locator('#ac-ctrl-update').click();
  await page.waitForTimeout(1500);

  const text = await getEditorText(page);
  expect(text).toContain('if (認証OK?) then (通過)');
  expect(text).toContain('elseif (残り回数あり?) then (再試行)');
  expect(text).toContain('else (それ以外)');
});
