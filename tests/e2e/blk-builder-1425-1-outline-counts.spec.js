// @ts-check
// BLK-builder-20260907-1425-1: design 4a/4b/4c — 構造タブ下部の一行は図種ごとに
// 数える対象の名前が変わる (classes / actions·branch / states·transitions)。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(300);
}

async function useType(page, type) {
  await page.locator('#diagram-type').selectOption(type);
  await page.waitForTimeout(500);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { window.localStorage.clear(); } catch (e) {}
  });
});

test('クラス図は classes · relations で数える', async ({ page }) => {
  await gotoApp(page);
  await useType(page, 'plantuml-class');
  await typeDsl(page, [
    '@startuml', 'title Sample Class',
    'abstract class Shape', 'class Circle', 'interface Drawable',
    'Shape <|-- Circle', 'Circle ..> Drawable', '@enduml',
  ].join('\n'));
  await page.locator('#btn-editor-tab-outline').click();
  await expect(page.locator('#outline-summary')).toHaveText('パース OK · 3 classes · 2 relations');
});

test('アクティビティ図は actions · branch で数え、:処理; は action と出る', async ({ page }) => {
  await gotoApp(page);
  await useType(page, 'plantuml-activity');
  await typeDsl(page, [
    '@startuml', 'title Sample Activity', 'start', ':入力を受け取る;',
    'if (有効?) then (yes)', ':保存する;', 'else (no)', ':エラーを返す;', 'endif',
    'stop', '@enduml',
  ].join('\n'));
  await page.locator('#btn-editor-tab-outline').click();
  await expect(page.locator('#outline-summary')).toHaveText('パース OK · 3 actions · 1 branch');
  // 種別バッジもアクティビティ図の語になる (以前は state と出ていた)
  await expect(page.locator('#outline-list .outline-row[data-outline-kind="action"]')).toHaveCount(3);
  await expect(page.locator('#outline-list .outline-row[data-outline-kind="state"]')).toHaveCount(0);
});

test('状態遷移図は states · transitions で数え、宣言が無くても遷移の端から状態を数える', async ({ page }) => {
  await gotoApp(page);
  await useType(page, 'plantuml-state');
  await typeDsl(page, [
    '@startuml', 'title Sample State',
    '[*] --> Idle', 'Idle --> Running : start', 'Running --> Idle : stop', 'Running --> [*] : done',
    '@enduml',
  ].join('\n'));
  await page.locator('#btn-editor-tab-outline').click();
  await expect(page.locator('#outline-summary')).toHaveText('パース OK · 2 states · 4 transitions');
});

test('シーケンス図は従来どおり elements · relations のまま', async ({ page }) => {
  await gotoApp(page);
  await useType(page, 'plantuml-sequence');
  await typeDsl(page, [
    '@startuml', 'title Sample Sequence', 'actor User', 'participant System', 'database DB',
    'User -> System : Request', 'System -> DB : Query', '@enduml',
  ].join('\n'));
  await page.locator('#btn-editor-tab-outline').click();
  await expect(page.locator('#outline-summary')).toHaveText('パース OK · 3 elements · 2 relations');
});

test('図種を切り替えると数え方の語も切り替わる', async ({ page }) => {
  await gotoApp(page);
  await useType(page, 'plantuml-class');
  await typeDsl(page, ['@startuml', 'class A', 'class B', 'A <|-- B', '@enduml'].join('\n'));
  await page.locator('#btn-editor-tab-outline').click();
  await expect(page.locator('#outline-summary')).toContainText('classes');

  await useType(page, 'plantuml-state');
  await typeDsl(page, ['@startuml', '[*] --> Idle', 'Idle --> Busy : go', '@enduml'].join('\n'));
  await expect(page.locator('#outline-summary')).toContainText('transitions');
  await expect(page.locator('#outline-summary')).not.toContainText('classes');
});
