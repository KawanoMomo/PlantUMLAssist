// @ts-check
// BLK-builder-20260907-1755-2: design 1a/4b/4c — キャンバス下端の状態表示を
// 「パース OK」と図種ごとの数え方にする。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const ACT = [
  '@startuml',
  'title Sample Activity',
  'start',
  ':入力を受け取る;',
  'if (有効?) then (yes)',
  '  :保存する;',
  'else (no)',
  '  :エラーを返す;',
  'endif',
  'stop',
  '@enduml',
].join('\n');

const ST = [
  '@startuml',
  'title Sample State',
  '[*] --> Idle',
  'Idle --> Running : start',
  'Running --> Idle : stop',
  'Running --> [*] : done',
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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
});

test('読めた図では下端が「パース OK」になる', async ({ page }) => {
  await gotoApp(page);
  await expect(page.locator('#status-parse')).toHaveText('パース OK');
});

test('アクティビティ図の下端は「3 actions · 1 branch」(0 のままにしない)', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await typeDsl(page, ACT);
  await expect(page.locator('#status-info')).toHaveText('3 actions · 1 branch');
});

test('状態遷移図の下端は「2 states · 4 transitions」', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await typeDsl(page, ST);
  await expect(page.locator('#status-info')).toHaveText('2 states · 4 transitions');
});

test('下端の数は構造タブの一行と食い違わない', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await typeDsl(page, ACT);
  await page.locator('#btn-editor-tab-outline').click();
  await page.waitForTimeout(500);
  const outline = (await page.locator('#outline-summary').textContent()) || '';
  const status = (await page.locator('#status-info').textContent()) || '';
  expect(outline).toContain(status.trim());
});
