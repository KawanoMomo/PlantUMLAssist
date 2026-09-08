// @ts-check
// design 3a「UseCase — 2 つ選択して関係を追加」。Shift+クリックで 2 つ選ぶと
// 右パネルが「関係を追加 / Add relation」に切り替わり、UML 名称を主・意味の説明を
// 副として並べ、矢印の見本と「追加される行」を見せる。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

async function selectTwo(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-usecase');
  await page.waitForTimeout(2500);
  const actorRect = page.locator('#overlay-layer rect[data-type="actor"]').first();
  const ucRect = page.locator('#overlay-layer rect[data-type="usecase"]').first();
  if ((await actorRect.count()) === 0 || (await ucRect.count()) === 0) return null;
  await actorRect.click();
  await ucRect.click({ modifiers: ['Shift'] });
  await page.waitForTimeout(400);
  return { actorRect, ucRect };
}

test.describe('BLK-builder-20260907-1003-1 — 関係を追加 (design 3a)', () => {
  test('2 つ選ぶと「関係を追加 / Add relation」に切り替わる', async ({ page }) => {
    const r = await selectTwo(page);
    if (!r) test.skip();
    await expect(page.locator('#props-content')).toContainText('関係を追加 / Add relation');
    await expect(page.locator('#uc-conn-from')).toBeVisible();
    await expect(page.locator('#uc-conn-to')).toBeVisible();
    await expect(page.locator('#uc-conn-create')).toHaveText('関係を追加');
    await expect(page.locator('#uc-conn-clear')).toHaveText('選択解除');
  });

  test('関係の種類は UML 名称を主・意味の説明を副にして 4 種並ぶ', async ({ page }) => {
    const r = await selectTwo(page);
    if (!r) test.skip();
    const opts = page.locator('#uc-conn-kinds label.rel-opt');
    await expect(opts).toHaveCount(4);
    await expect(opts.nth(0)).toContainText('関連 / association');
    await expect(opts.nth(0)).toContainText('アクターがユースケースを利用する');
    await expect(opts.nth(1)).toContainText('包含 / include');
    await expect(opts.nth(1)).toContainText('実行時に必ず呼び出される');
    await expect(opts.nth(2)).toContainText('拡張 / extend');
    await expect(opts.nth(3)).toContainText('汎化 / generalization');
    // 矢印の見本が各行に添えられている
    await expect(page.locator('#uc-conn-kinds .rel-opt-sample')).toHaveCount(4);
  });

  test('「追加される行」が出て、種類とラベルを変えると即座に追随する', async ({ page }) => {
    const r = await selectTwo(page);
    if (!r) test.skip();
    const preview = page.locator('#uc-conn-preview');
    const first = (await preview.textContent()) || '';
    expect(first).toContain('-->');

    await page.locator('#uc-conn-label').fill('起動する');
    await page.waitForTimeout(150);
    await expect(preview).toContainText('起動する');

    await page.locator('#uc-conn-kind-include').check();
    await page.waitForTimeout(150);
    await expect(preview).toContainText('..>');
    await expect(preview).toContainText('<<include>>');
  });

  test('⇄ で From と To が入れ替わり、追加される行も向きが変わる', async ({ page }) => {
    const r = await selectTwo(page);
    if (!r) test.skip();
    const fromBefore = await page.locator('#uc-conn-from').textContent();
    const toBefore = await page.locator('#uc-conn-to').textContent();
    const previewBefore = await page.locator('#uc-conn-preview').textContent();

    await page.locator('#uc-conn-swap').click();
    await page.waitForTimeout(150);

    expect(await page.locator('#uc-conn-from').textContent()).toBe(toBefore);
    expect(await page.locator('#uc-conn-to').textContent()).toBe(fromBefore);
    expect(await page.locator('#uc-conn-preview').textContent()).not.toBe(previewBefore);
  });

  test('「関係を追加」で、見せていた行がそのまま DSL に入る', async ({ page }) => {
    const r = await selectTwo(page);
    if (!r) test.skip();
    await page.locator('#uc-conn-label').fill('ログインする');
    await page.waitForTimeout(150);
    const line = ((await page.locator('#uc-conn-preview').textContent()) || '').trim();
    expect(line.length).toBeGreaterThan(0);

    await page.locator('#uc-conn-create').click();
    await page.waitForTimeout(600);

    const text = await getEditorText(page);
    expect(text).toContain(line);
    // 追加後は選択が外れ、パネルも閉じる
    const sel = await page.evaluate(() => window.MA.selection.getSelected());
    expect(sel.length).toBe(0);
  });

  test('「選択解除」で選択が外れ、DSL は変わらない', async ({ page }) => {
    const r = await selectTwo(page);
    if (!r) test.skip();
    const before = await getEditorText(page);
    await page.locator('#uc-conn-clear').click();
    await page.waitForTimeout(300);
    const sel = await page.evaluate(() => window.MA.selection.getSelected());
    expect(sel.length).toBe(0);
    expect(await getEditorText(page)).toBe(before);
  });

  test('キャンバス上に「2 つ選択中 — 関係を追加できます」が出て、解除で消える', async ({ page }) => {
    const r = await selectTwo(page);
    if (!r) test.skip();
    const notice = page.locator('#selection-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toHaveText('2 つ選択中 — 関係を追加できます');
    await page.locator('#uc-conn-clear').click();
    await page.waitForTimeout(300);
    await expect(notice).toBeHidden();
  });

  test('操作中に console error が出ない', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    const r = await selectTwo(page);
    if (!r) test.skip();
    await page.locator('#uc-conn-kind-extend').check();
    await page.locator('#uc-conn-swap').click();
    await page.locator('#uc-conn-create').click();
    await page.waitForTimeout(600);
    expect(errors.filter((e) => e.indexOf('favicon') < 0)).toHaveLength(0);
  });
});
