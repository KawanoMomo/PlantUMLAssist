// @ts-check
// BLK-builder-20260907-0823-1: design 1a の右ペイン。
// From ⇄ To は 1 クリック、よく使う矢印は分節ボタンで 1 クリック。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText, clickOverlayByLine } = require('./helpers');

const DSL = [
  '@startuml',
  'actor User',
  'participant System',
  'User -> System : Request',
  'System --> User : Response',
  '@enduml',
].join('\n');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(700);
}

// メッセージを選ぶ。SVG 上の overlay を押す (実機と同じ経路)。
async function selectMessageLine(page, line) {
  await clickOverlayByLine(page, line);
  await page.waitForTimeout(400);
}

test.describe('BLK-builder-0823 From ⇄ To と矢印の分節ボタン', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('メッセージを選ぶと ⇄ と分節ボタンが右ペインに出る', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DSL);
    await selectMessageLine(page, 4);
    await expect(page.locator('#seq-edit-swap')).toBeVisible();
    await expect(page.locator('#seq-edit-arrow-seg .prop-seg')).toHaveCount(4);
    // 今の矢印 (->) の分節だけが押された状態
    await expect(page.locator('#seq-edit-arrow-seg .prop-seg.active')).toHaveCount(1);
    await expect(page.locator('#seq-edit-arrow-seg .prop-seg.active')).toHaveAttribute('data-value', '->');
  });

  test('⇄ の 1 クリックで From と To が入れ替わる', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DSL);
    await selectMessageLine(page, 4);
    await page.locator('#seq-edit-swap').click();
    await page.waitForTimeout(500);
    const t = await getEditorText(page);
    expect(t.split('\n')[3]).toBe('System -> User : Request');
    // 他の行は変わらない
    expect(t.split('\n')[4]).toBe('System --> User : Response');
  });

  test('分節ボタンの 1 クリックで矢印が変わる (プルダウンを開かない)', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DSL);
    await selectMessageLine(page, 4);
    await page.locator('#seq-edit-arrow-seg .prop-seg[data-value="-\\>x"]').click();
    await page.waitForTimeout(500);
    expect((await getEditorText(page)).split('\n')[3]).toBe('User ->x System : Request');
  });

  test('入替と矢印変更は Ctrl+Z で戻せる', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DSL);
    await selectMessageLine(page, 4);
    await page.locator('#seq-edit-swap').click();
    await page.waitForTimeout(400);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    expect((await getEditorText(page)).split('\n')[3]).toBe('User -> System : Request');
  });

  test('10 種すべては「Arrow (その他)」のプルダウンに残っている', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DSL);
    await selectMessageLine(page, 4);
    const opts = await page.locator('#seq-edit-arrow option').allTextContents();
    expect(opts.length).toBeGreaterThan(9);
    await page.locator('#seq-edit-arrow').selectOption('<->');
    await page.waitForTimeout(500);
    expect((await getEditorText(page)).split('\n')[3]).toBe('User <-> System : Request');
  });

  test('向き替えの手数: 選択 → ⇄ の 1 クリックで済む', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DSL);
    let clicks = 0;
    page.on('request', () => {});
    await selectMessageLine(page, 4);
    await page.locator('#seq-edit-swap').click();
    clicks += 1;
    await page.waitForTimeout(400);
    expect(clicks).toBe(1);
    expect((await getEditorText(page)).split('\n')[3]).toBe('System -> User : Request');
  });
});
