// @ts-check
// BLK-builder-20260907-1737-2 / design 4c「State — 遷移を選択」の
// 「この遷移にノートを添える」。遷移だけ `note on link` を DSL に手で書くしかなかった。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

const SRC = [
  '@startuml',
  'state Idle',
  'state Running',
  '[*] --> Idle',
  'Idle --> Running : start',
  'Running --> Idle : stop',
  '@enduml',
].join('\n');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(1000);
}

// 遷移の選択は、図の矢印を正確にクリックする代わりに右ペインの「遷移を選ぶ」から。
async function selectTransition(page, line) {
  await page.evaluate((l) => {
    const p = window.MA.modules.plantumlState.parse(document.getElementById('editor').value);
    const tr = p.transitions.filter((t) => t.line === l)[0];
    window.MA.selection.setSelected([{ type: 'transition', id: tr.id, line: tr.line }]);
  }, line);
  await page.waitForTimeout(400);
}

async function openState(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(500);
  await setDsl(page, SRC);
}

test('遷移を選ぶと「この遷移にノートを添える」が出る', async ({ page }) => {
  await openState(page);
  await selectTransition(page, 5);
  await expect(page.locator('#props-pane')).toContainText('この遷移にノートを添える');
  await expect(page.locator('#st-tr-note-on')).not.toBeChecked();
  await expect(page.locator('#st-tr-note')).toBeHidden();
});

test('チェックして本文を書くと note on link が遷移行の直後に入る', async ({ page }) => {
  await openState(page);
  await selectTransition(page, 5);
  await page.locator('#st-tr-note-on').check();
  await expect(page.locator('#st-tr-note')).toBeVisible();
  await page.locator('#st-tr-note').fill('リトライ上限を超えた場合のみ');
  await page.locator('#st-tr-note').blur();
  await page.waitForTimeout(600);

  const lines = (await getEditorText(page)).split('\n');
  expect(lines[4]).toBe('Idle --> Running : start');
  expect(lines[5]).toBe('note on link');
  expect(lines[6].trim()).toBe('リトライ上限を超えた場合のみ');
  expect(lines[7]).toBe('end note');
});

test('ノートを添えた図が PlantUML で描ける (構文エラーにならない)', async ({ page }) => {
  await openState(page);
  await selectTransition(page, 5);
  await page.locator('#st-tr-note-on').check();
  await page.locator('#st-tr-note').fill('リトライ上限を超えた場合のみ');
  await page.locator('#st-tr-note').blur();
  await page.waitForTimeout(2500);
  // 図の上に描画エラーの帯が出ない
  await expect(page.locator('#preview-svg svg')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#preview-svg')).toContainText('リトライ上限を超えた場合のみ');
});

test('チェックを外すとノートだけが消え、遷移は残る', async ({ page }) => {
  await openState(page);
  await selectTransition(page, 5);
  await page.locator('#st-tr-note-on').check();
  await page.locator('#st-tr-note').fill('ほげ');
  await page.locator('#st-tr-note').blur();
  await page.waitForTimeout(600);
  expect(await getEditorText(page)).toContain('note on link');

  await selectTransition(page, 5);
  await page.locator('#st-tr-note-on').uncheck();
  await page.waitForTimeout(600);
  const t = await getEditorText(page);
  expect(t).not.toContain('note on link');
  expect(t).toContain('Idle --> Running : start');
});

test('遷移を消すと添えたノートも一緒に消える', async ({ page }) => {
  await openState(page);
  await selectTransition(page, 5);
  await page.locator('#st-tr-note-on').check();
  await page.locator('#st-tr-note').fill('ほげ');
  await page.locator('#st-tr-note').blur();
  await page.waitForTimeout(600);

  await selectTransition(page, 5);
  await page.locator('#st-tr-delete').click();
  await page.waitForTimeout(600);
  const t = await getEditorText(page);
  expect(t).not.toContain('Idle --> Running : start');
  expect(t).not.toContain('note on link');
  expect(t).not.toContain('end note');
  expect(t).toContain('Running --> Idle : stop');
});
