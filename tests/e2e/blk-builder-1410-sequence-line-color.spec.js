// @ts-check
// BLK-builder-20260907-1410-3 / design 5d 網羅表「Sequence のその他パレット: 線色」。
// メッセージの右ペインに他図種と同じ 6 色の見本を出し、矢印の形を保ったまま
// 色だけを差し替える。末尾追加でも色を先に決められる。
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

async function selectMessageLine(page, line) {
  await clickOverlayByLine(page, line);
  await page.waitForTimeout(400);
}

test.describe('BLK-builder-1410 Sequence の線色 (design 5d)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('メッセージを選ぶと 6 色の見本が出る', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DSL);
    await selectMessageLine(page, 4);

    await expect(page.locator('#seq-edit-color-default')).toBeVisible();
    for (const c of ['red', 'orange', 'green', 'blue', 'violet']) {
      await expect(page.locator('#seq-edit-color-' + c)).toBeVisible();
    }
    // 色なしの行では「既定」が選ばれている。
    await expect(page.locator('#seq-edit-color-default')).toHaveAttribute('aria-pressed', 'true');
  });

  test('色を押すと矢印の形を保ったまま DSL に色が入る', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DSL);
    await selectMessageLine(page, 5);

    await page.locator('#seq-edit-color-blue').click();
    await page.waitForTimeout(500);
    expect(await getEditorText(page)).toContain('System -[#blue]-> User : Response');
  });

  test('選び直した色は見本にも戻ってくる / 既定で外れる', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DSL);
    await selectMessageLine(page, 4);

    await page.locator('#seq-edit-color-red').click();
    await page.waitForTimeout(500);
    expect(await getEditorText(page)).toContain('User -[#red]> System : Request');

    // 押した色は再描画後の見本にも選択済みとして戻ってくる。
    await expect(page.locator('#seq-edit-color-red')).toHaveAttribute('aria-pressed', 'true');

    await page.locator('#seq-edit-color-default').click();
    await page.waitForTimeout(500);
    expect(await getEditorText(page)).toContain('User -> System : Request');
  });

  test('末尾追加でも色を選んでから足せる', async ({ page }) => {
    await gotoApp(page);
    await typeDsl(page, DSL);
    await page.waitForTimeout(300);

    await page.locator('#seq-tail-kind').selectOption('message');
    await page.waitForTimeout(300);
    await page.locator('#seq-tail-from').selectOption('User');
    await page.locator('#seq-tail-to').selectOption('System');
    await page.locator('#seq-tail-color-green').click();
    await page.locator('#seq-tail-add').click();
    await page.waitForTimeout(500);

    expect(await getEditorText(page)).toContain('User -[#green]> System');
  });
});
