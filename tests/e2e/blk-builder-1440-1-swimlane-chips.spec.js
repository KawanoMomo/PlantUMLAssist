// @ts-check
// BLK-builder-20260907-1440-1: design 4b — 選択中アクションの右ペインで
// スイムレーンをチップから選び直せる。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const ACT = [
  '@startuml',
  'title Sample Activity',
  '|Client|',
  'start',
  ':入力を受け取る;',
  '|Server|',
  ':保存する;',
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
    const n = parsed.nodes.filter((x) => x.kind === 'action' && (x.text || '').indexOf(t) >= 0)[0];
    window.MA.selection.setSelected([{ type: 'action', id: n.id, line: n.line }]);
  }, text);
  await page.waitForTimeout(400);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
});

test('アクションを選ぶと「スイムレーン / Swimlane」のチップが出て、今の所属が押されている', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await typeDsl(page, ACT);
  await selectAction(page, '入力を受け取る');

  await expect(page.locator('#ac-swimlane')).toContainText('スイムレーン / Swimlane');
  const chips = page.locator('#ac-swimlane .ac-swim-chip');
  await expect(chips).toHaveText(['（なし）', 'Client', 'Server']);
  await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
  // レーンに居るので「（なし）」は押せない
  await expect(chips.nth(0)).toBeDisabled();
});

test('別のレーンのチップを押すと、そのアクションだけが移る', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await typeDsl(page, ACT);
  await selectAction(page, '入力を受け取る');
  await page.locator('#ac-swimlane .ac-swim-chip[data-lane="Server"]').click();
  await page.waitForTimeout(600);

  const dsl = await getEditorText(page);
  const lines = dsl.split('\n');
  // 対象のアクションの直前が |Server| になっている
  expect(lines[lines.findIndex((l) => l.indexOf('入力を受け取る') >= 0) - 1].trim()).toBe('|Server|');
  // start は Client のまま (動かしていない行の所属は変わらない)
  expect(await page.evaluate((d) => window.MA.swimlaneMove.laneAt(d, d.split('\n').indexOf('start') + 1), dsl))
    .toBe('Client');
});

test('掛け直しても印が積み上がらない', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await typeDsl(page, ACT);
  for (const lane of ['Server', 'Client', 'Server']) {
    await selectAction(page, '入力を受け取る');
    await page.locator(`#ac-swimlane .ac-swim-chip[data-lane="${lane}"]`).click();
    await page.waitForTimeout(500);
  }
  const dsl = await getEditorText(page);
  const markers = dsl.split('\n').filter((l) => /^\s*\|[^|]+\|\s*$/.test(l));
  expect(markers.length).toBeLessThanOrEqual(3);
});

test('レーンの無い図では「（なし）」が押された状態で、レーンのチップは出ない', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await typeDsl(page, ['@startuml', 'start', ':入力を受け取る;', 'stop', '@enduml'].join('\n'));
  await selectAction(page, '入力を受け取る');

  const chips = page.locator('#ac-swimlane .ac-swim-chip');
  await expect(chips).toHaveCount(1);
  await expect(chips.nth(0)).toHaveText('（なし）');
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true');
});
