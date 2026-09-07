// @ts-check
// BLK-builder-20260907-1746-2: design 4b — 選択中アクションの右ペインの「↑ ↓」で
// 同じ親の中の前後の兄弟と入れ替える。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const ACT = [
  '@startuml',
  'title Sample Activity',
  'start',
  ':入力を受け取る;',
  'if (有効?) then (yes)',
  '  :保存する;',
  '  :通知する;',
  'else (no)',
  '  :エラーを返す;',
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

// 該当の文言のアクションを選ぶ (SVG の当たり判定に依存しない)。
async function selectAction(page, text) {
  await page.evaluate((t) => {
    const parsed = window.MA.modules.plantumlActivity.parse(
      /** @type {HTMLTextAreaElement} */ (document.getElementById('editor')).value);
    let hit = null;
    const walk = (nodes) => {
      if (!nodes) return;
      nodes.forEach((n) => {
        if (n.kind === 'action' && (n.text || '').indexOf(t) >= 0) hit = n;
        if (n.branches) n.branches.forEach((b) => walk(b.body));
        if (n.body) walk(n.body);
      });
    };
    walk(parsed.nodes);
    window.MA.selection.setSelected([{ type: 'action', id: hit.id, line: hit.line }]);
  }, text);
  await page.waitForTimeout(400);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
});

test('アクションを選ぶと右ペインに「並び替え / Reorder」の ↑ ↓ が出る', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await typeDsl(page, ACT);
  await selectAction(page, '保存する');
  await expect(page.locator('#props-content')).toContainText('並び替え');
  await expect(page.locator('#ac-move-up')).toBeVisible();
  await expect(page.locator('#ac-move-down')).toBeVisible();
});

test('↓ を押すと if の yes 側の中で次のアクションと入れ替わる', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await typeDsl(page, ACT);
  await selectAction(page, '保存する');
  await page.locator('#ac-move-down').click();
  await page.waitForTimeout(600);
  const lines = (await getEditorText(page)).split('\n');
  expect(lines[5].trim()).toBe(':通知する;');
  expect(lines[6].trim()).toBe(':保存する;');
  expect(lines[7]).toBe('else (no)');
});

test('入れ替えた後も同じアクションを選んだままで、↑ で元に戻せる', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await typeDsl(page, ACT);
  await selectAction(page, '保存する');
  await page.locator('#ac-move-down').click();
  await page.waitForTimeout(600);
  await expect(page.locator('#ac-action-text')).toHaveValue('保存する');
  await page.locator('#ac-move-up').click();
  await page.waitForTimeout(600);
  expect(await getEditorText(page)).toBe(ACT);
});

test('親の境界では押せない (else 側の 1 件は ↑ ↓ とも disabled)', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await typeDsl(page, ACT);
  await selectAction(page, 'エラーを返す');
  await expect(page.locator('#ac-move-up')).toBeDisabled();
  await expect(page.locator('#ac-move-down')).toBeDisabled();
});
