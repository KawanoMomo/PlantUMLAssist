// @ts-check
// BLK-builder-20260907-1720-3 (design 4c): State の「追加する位置」。
// 追加フォームが末尾固定だったので、Idle と Running の間に状態を挟むには
// DSL を手で切り貼りするしかなかった。3 択で置き場所を選べることを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

const SAMPLE = [
  '@startuml',
  '[*] --> Idle',
  'Idle --> Running : start',
  'Running --> [*] : done',
  '@enduml',
].join('\n');

const WITH_COMPOSITE = [
  '@startuml',
  'state Outer {',
  '  Inner1 --> Inner2',
  '}',
  'Outer --> Done',
  '@enduml',
].join('\n');

async function openState(page, dsl) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(600);
  await page.evaluate((text) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = text;
    ed.dispatchEvent(new Event('input'));
  }, dsl);
  await page.waitForTimeout(600);
  await expect(page.locator('#st-tail-kind')).toBeVisible();
}

test.describe('BLK-builder-1720-3 State の追加する位置 (design 4c)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('見出しは「末尾」を名乗らず、State に「追加する位置」が出る', async ({ page }) => {
    await openState(page, SAMPLE);
    await page.locator('#st-tail-kind').selectOption('state');
    await expect(page.locator('#st-tail-where')).toBeVisible();
    const opts = await page.locator('#st-tail-where option').allTextContents();
    expect(opts).toEqual(['図の末尾', 'この遷移の途中']);
  });

  test('複合状態が無ければ「選んだ状態の中」は出ない', async ({ page }) => {
    await openState(page, SAMPLE);
    await page.locator('#st-tail-kind').selectOption('state');
    const opts = await page.locator('#st-tail-where option').allTextContents();
    expect(opts).not.toContain('選んだ状態の中');
  });

  test('遷移の途中に挟むと、元の 1 本が 2 本に割れる', async ({ page }) => {
    await openState(page, SAMPLE);
    await page.locator('#st-tail-kind').selectOption('state');
    await page.locator('#st-tail-id').fill('Warmup');
    await page.locator('#st-tail-where').selectOption('transition');
    await expect(page.locator('#st-tail-where-target')).toBeVisible();
    await page.locator('#st-tail-where-target').selectOption({ label: 'Idle → Running : start' });
    await page.locator('#st-tail-add').click();
    await page.waitForTimeout(400);

    const t = await getEditorText(page);
    expect(t).toContain('state Warmup');
    expect(t).toContain('Idle --> Warmup : start');
    expect(t).toContain('Warmup --> Running');
    // 割った元の行はもう無い。
    expect(t).not.toContain('Idle --> Running : start');
  });

  test('末尾を選べば従来どおり @enduml の直前に足す', async ({ page }) => {
    await openState(page, SAMPLE);
    await page.locator('#st-tail-kind').selectOption('state');
    await page.locator('#st-tail-id').fill('Paused');
    await page.locator('#st-tail-add').click();
    await page.waitForTimeout(400);

    const lines = (await getEditorText(page)).split('\n');
    expect(lines[lines.length - 2]).toBe('state Paused');
  });

  test('複合状態の中に入れると閉じ } の内側に入る', async ({ page }) => {
    await openState(page, WITH_COMPOSITE);
    await page.locator('#st-tail-kind').selectOption('state');
    await page.locator('#st-tail-id').fill('Inner3');
    // BLK-owner-20260925-0312-3: 親は位置のプルダウンに名前で並ぶ (別欄で選び直さない)。
    await page.locator('#st-tail-where').selectOption({ label: 'Outer の中' });
    await page.locator('#st-tail-add').click();
    await page.waitForTimeout(400);

    const lines = (await getEditorText(page)).split('\n');
    expect(lines[3]).toBe('  state Inner3');
    expect(lines[4]).toBe('}');
  });

  test('Composite に「この遷移の途中」は出さない (中身の無い箱を挟ませない)', async ({ page }) => {
    await openState(page, WITH_COMPOSITE);
    await page.locator('#st-tail-kind').selectOption('composite');
    const opts = await page.locator('#st-tail-where option').allTextContents();
    expect(opts[0]).toBe('図の末尾');
    expect(opts).toContain('Outer の中');
    expect(opts).not.toContain('この遷移の途中');
  });

  test('Ctrl+Z 1 手で挟む前の DSL に戻る', async ({ page }) => {
    await openState(page, SAMPLE);
    await page.locator('#st-tail-kind').selectOption('state');
    await page.locator('#st-tail-id').fill('Warmup');
    await page.locator('#st-tail-where').selectOption('transition');
    await page.locator('#st-tail-where-target').selectOption({ label: 'Idle → Running : start' });
    await page.locator('#st-tail-add').click();
    await page.waitForTimeout(400);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    const t = await getEditorText(page);
    expect(t).toContain('Idle --> Running : start');
    expect(t).not.toContain('state Warmup');
  });
});
