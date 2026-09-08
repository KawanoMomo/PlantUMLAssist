// @ts-check
// BLK-junior-20260907-0843-wish: 参照図と編集中の図を突き合わせ、
// 打ち間違い・並べ間違い・語尾の不統一を保存前に挙げる。
// これまでは目視で見比べるしかなく、気づくのは保存した後だった。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const SENIOR = [
  '@startuml',
  'title GpioDrv',
  'actor App',
  'participant GpioDrv',
  'App -> GpioDrv : ポートを設定',
  'App -> GpioDrv : 割り込みを設定',
  'GpioDrv --> App : 結果を通知',
  '@enduml',
].join('\n');

// 部品名だけ替えた正しい写し
const MINE_OK = SENIOR.replace(/GpioDrv/g, 'UartDrv');
// 打ち間違い (UartDvr) と語尾の崩れ (有効にする) を仕込んだ写し
const MINE_NG = MINE_OK
  .replace('participant UartDrv', 'participant UartDvr')
  .replace('割り込みを設定', '割り込みを有効にする');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(1200);
}

async function twoTabsThenCompare(page, mine) {
  await gotoApp(page);
  await typeDsl(page, SENIOR);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(600);
  await typeDsl(page, mine);
  await page.locator('#btn-tab-compare').click();
  await expect(page.locator('#compare-pane')).toBeVisible();
  await expect(page.locator('#compare-svg svg')).toBeVisible({ timeout: 15000 });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
});

test('参照ペインに「⚖ 整合チェック」があり、押すまで結果は出ない', async ({ page }) => {
  await twoTabsThenCompare(page, MINE_OK);
  await expect(page.locator('#btn-check-run')).toBeVisible();
  await expect(page.locator('#check-list')).toBeHidden();
});

test('正しく写せていれば「食い違いなし」と出る', async ({ page }) => {
  await twoTabsThenCompare(page, MINE_OK);
  await page.locator('#btn-check-run').click();
  await expect(page.locator('#check-summary')).toHaveText('食い違いなし');
  await expect(page.locator('#check-list')).toContainText('食い違いはありません');
});

test('打ち間違いと語尾の崩れを保存前に挙げる', async ({ page }) => {
  await twoTabsThenCompare(page, MINE_NG);
  await page.locator('#btn-check-run').click();
  await expect(page.locator('#check-summary')).toContainText('件');
  await expect(page.locator('.check-row[data-check-kind="typo"]')).toContainText('UartDvr');
  await expect(page.locator('.check-row[data-check-kind="suffix"]')).toContainText('有効にする');
});

test('行が抜けていれば「こちらにありません」と挙げる', async ({ page }) => {
  await twoTabsThenCompare(page, MINE_OK.replace('App -> UartDrv : 割り込みを設定\n', ''));
  await page.locator('#btn-check-run').click();
  await expect(page.locator('.check-row[data-check-kind="order"]')).toContainText('こちらにありません');
});

test('指摘を押すとその行が DSL で選ばれる', async ({ page }) => {
  await twoTabsThenCompare(page, MINE_NG);
  await page.locator('#btn-check-run').click();
  const row = page.locator('.check-row[data-check-kind="typo"]').first();
  const line = Number(await row.getAttribute('data-check-line'));
  await row.click();
  const sel = await page.evaluate(() => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    return ed.value.slice(ed.selectionStart, ed.selectionEnd);
  });
  expect(sel).toBe(MINE_NG.split('\n')[line]);
  expect(sel).toContain('UartDvr');
});

test('直してから押し直すと指摘が消える', async ({ page }) => {
  await twoTabsThenCompare(page, MINE_NG);
  await page.locator('#btn-check-run').click();
  await expect(page.locator('#check-summary')).toContainText('件');
  await typeDsl(page, MINE_OK);
  await page.locator('#btn-check-run').click();
  await expect(page.locator('#check-summary')).toHaveText('食い違いなし');
});
