// @ts-check
// BLK-primary-20260907-0723 / design 4c「State — 遷移を選択」
// 遷移ラベルを trigger [guard] / action の 3 要素に分けて入力させ、
// 組み立てた DSL 行をその場に見せる。1 行のテキストに構文を書かせない。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const SAMPLE = [
  '@startuml',
  'title Sample State',
  'state Idle',
  'state Running',
  '[*] --> Idle',
  'Idle --> Running : start',
  'Running --> Idle : stop',
  'Running --> [*] : done',
  '@enduml',
].join('\n');

async function openState(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(600);
  await page.evaluate((text) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = text;
    ed.dispatchEvent(new Event('input'));
  }, SAMPLE);
  await page.waitForTimeout(700);
}

// 一覧から遷移を選んで編集フォームを開く。text は一覧行に出る要約の一部。
async function pickTransition(page, text) {
  const row = page.locator('#props-content div:has(> .st-tr-pick)', { hasText: text }).first();
  await row.locator('.st-tr-pick').click();
  await expect(page.locator('#st-tr-trig')).toBeVisible();
}

test.describe('BLK-primary-0723 遷移を 3 要素で編集する', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('選択なしのパネルに遷移一覧が並び、図をクリックせずに選べる', async ({ page }) => {
    await openState(page);
    const picks = page.locator('#props-content .st-tr-pick');
    await expect(picks).toHaveCount(4);
    await expect(page.locator('#props-content')).toContainText('Idle → Running : start');
    await expect(page.locator('#props-content')).toContainText('[*] → Idle');
  });

  test('選んだ遷移が trigger / guard / action の 3 欄に分かれて出る', async ({ page }) => {
    await openState(page);
    await pickTransition(page, 'Idle → Running : start');
    await expect(page.locator('#st-tr-from')).toHaveValue('Idle');
    await expect(page.locator('#st-tr-to')).toHaveValue('Running');
    await expect(page.locator('#st-tr-trig')).toHaveValue('start');
    await expect(page.locator('#st-tr-guard')).toHaveValue('');
    await expect(page.locator('#st-tr-act')).toHaveValue('');
  });

  test('3 欄に入れると組み立てられる行がその場に出る', async ({ page }) => {
    await openState(page);
    await pickTransition(page, 'Idle → Running : start');
    await expect(page.locator('#st-tr-preview')).toHaveText('Idle --> Running : start');

    await page.locator('#st-tr-guard').fill('ready');
    await expect(page.locator('#st-tr-preview')).toHaveText('Idle --> Running : start [ready]');
    await page.locator('#st-tr-act').fill('boot()');
    await expect(page.locator('#st-tr-preview')).toHaveText('Idle --> Running : start [ready] / boot()');
  });

  test('更新するとプレビューと同じ行が DSL に入る', async ({ page }) => {
    await openState(page);
    await pickTransition(page, 'Idle → Running : start');
    await page.locator('#st-tr-trig').fill('power_on');
    await page.locator('#st-tr-guard').fill('vcc > 3.0');
    await page.locator('#st-tr-act').fill('init()');
    const preview = await page.locator('#st-tr-preview').textContent();
    await page.locator('#st-tr-update').click();
    await expect.poll(async () => await getEditorText(page)).toContain('power_on');
    expect(await getEditorText(page)).toContain(preview);
    expect(await getEditorText(page)).toContain('Idle --> Running : power_on [vcc > 3.0] / init()');
  });

  test('⇄ で From と To を入れ替えられる', async ({ page }) => {
    await openState(page);
    await pickTransition(page, 'Idle → Running : start');
    await page.locator('#st-tr-swap').click();
    await expect(page.locator('#st-tr-from')).toHaveValue('Running');
    await expect(page.locator('#st-tr-to')).toHaveValue('Idle');
    await expect(page.locator('#st-tr-preview')).toHaveText('Running --> Idle : start');
    await page.locator('#st-tr-update').click();
    await expect.poll(async () => await getEditorText(page)).toContain('Running --> Idle : start');
  });

  test('末尾に追加する遷移も 3 欄 + プレビューで組める', async ({ page }) => {
    await openState(page);
    await page.locator('#st-tail-kind').selectOption('transition');
    await expect(page.locator('#st-tail-preview')).toBeVisible();
    await page.locator('#st-tail-from').selectOption('Running');
    await page.locator('#st-tail-to').selectOption('Idle');
    await page.locator('#st-tail-trig').fill('fault');
    await page.locator('#st-tail-guard').fill('code != 0');
    await page.locator('#st-tail-act').fill('log()');
    await expect(page.locator('#st-tail-preview')).toHaveText('Running --> Idle : fault [code != 0] / log()');
    await page.locator('#st-tail-add').click();
    await expect.poll(async () => await getEditorText(page))
      .toContain('Running --> Idle : fault [code != 0] / log()');
  });

  test('組み立てた図がそのまま描ける', async ({ page }) => {
    await openState(page);
    await pickTransition(page, 'Running → Idle : stop');
    await page.locator('#st-tr-guard').fill('done');
    await page.locator('#st-tr-update').click();
    await expect.poll(async () => await getEditorText(page)).toContain('[done]');
    await page.waitForTimeout(1500);
    await expect(page.locator('#status-parse')).toHaveText('OK');
    await expect(page.locator('#preview-svg svg')).toBeVisible();
  });
});
