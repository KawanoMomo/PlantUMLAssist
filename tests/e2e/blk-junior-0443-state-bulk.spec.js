// @ts-check
// BLK-junior-20260907-0443: GPIO ドライバの状態遷移図 (state 4・遷移 6) を新規作成する。
// 1 件ずつの「末尾に追加」だと 10 件でクリックが 10 を超え、DSL 直書きに逃げていた。
// 種類=一括 のテキスト欄で、入力 1 回 + クリック 1 回で 10 件入ることを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const GPIO_BULK = [
  'Idle : 待機',
  'Active',
  'Error',
  'Shutdown',
  '[*] --> Idle',
  'Idle --> Active : Gpio_Init()',
  'Active --> Error : fault [code != 0] / log()',
  'Error --> Idle : reset',
  'Active --> Shutdown : stop',
  'Shutdown --> [*]',
].join('\n');

async function newState(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(600);
  // 新規作成の状況にそろえる。テンプレートの state / 遷移が残っていると
  // 「一括で何件入ったか」を数えられない。
  await page.evaluate(() => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = ['@startuml', '@enduml'].join('\n');
    ed.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(600);
  await expect(page.locator('#st-tail-kind')).toBeVisible();
  await page.locator('#st-tail-kind').selectOption('bulk');
  await expect(page.locator('#st-tail-bulk')).toBeVisible();
}

test.describe('BLK-junior-0443 状態遷移図の一括末尾追加', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('種類に「一括 (複数行)」があり、書き方の案内が出る', async ({ page }) => {
    await newState(page);
    await expect(page.locator('#st-tail-bulk-hint')).toBeVisible();
    await expect(page.locator('#st-tail-add')).toHaveText('+ まとめて末尾に追加');
  });

  test('state 4 つ + 遷移 6 本が 1 回の確定でまとめて入る', async ({ page }) => {
    await newState(page);
    await page.locator('#st-tail-bulk').fill(GPIO_BULK);
    await page.locator('#st-tail-add').click();
    await expect.poll(async () => await getEditorText(page)).toContain('Active --> Shutdown');

    const out = await getEditorText(page);
    const lines = out.split('\n');
    expect(lines.filter((l) => /^state\s/.test(l)).length).toBe(4);
    expect(lines.filter((l) => l.includes('-->')).length).toBe(6);
    expect(out).toContain('state "待機" as Idle');
    expect(out).toContain('Active --> Error : fault [code != 0] / log()');
    expect(out).toContain('[*] --> Idle');
    expect(out).toContain('Shutdown --> [*]');
  });

  test('宣言が遷移より前に並び、図として描画できる', async ({ page }) => {
    await newState(page);
    await page.locator('#st-tail-bulk').fill(GPIO_BULK);
    await page.locator('#st-tail-add').click();
    await expect.poll(async () => await getEditorText(page)).toContain('Shutdown --> [*]');

    const lines = (await getEditorText(page)).split('\n');
    let lastState = -1, firstTrans = lines.length;
    lines.forEach((l, i) => {
      if (/^state\s/.test(l)) lastState = i;
      if (l.includes('-->') && i < firstTrans) firstTrans = i;
    });
    expect(lastState).toBeLessThan(firstTrans);

    await page.waitForTimeout(1500);
    await expect(page.locator('#status-parse')).toHaveText('OK');
    await expect(page.locator('#preview-svg svg')).toBeVisible();
  });

  test('Ctrl+Z 1 手でまとめて戻る', async ({ page }) => {
    await newState(page);
    const before = await getEditorText(page);
    await page.locator('#st-tail-bulk').fill(GPIO_BULK);
    await page.locator('#st-tail-add').click();
    await expect.poll(async () => await getEditorText(page)).toContain('Shutdown --> [*]');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    expect(await getEditorText(page)).toBe(before);
  });

  test('空欄で押しても DSL は変わらない', async ({ page }) => {
    await newState(page);
    const before = await getEditorText(page);
    page.once('dialog', (d) => d.accept());
    await page.locator('#st-tail-add').click();
    await page.waitForTimeout(400);
    expect(await getEditorText(page)).toBe(before);
  });
});
