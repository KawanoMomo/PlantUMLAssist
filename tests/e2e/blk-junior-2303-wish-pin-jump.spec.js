// @ts-check
// BLK-junior-20260907-2303-wish: 指摘一覧から「この指摘の対象へジャンプ」。
// 指摘を選ぶ → ジャンプ → 修正フォームが自動で開く、が 1 操作になることを実機で見る。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const DSL = [
  '@startuml',
  'title Timer state',
  '[*] --> Idle',
  'Idle --> Busy : Timer_StartConv',
  'Busy --> Idle : Timer_Ack',
  'Busy --> Error : Timer_Fault',
  '@enduml',
].join('\n');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    var ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(2000);
}

async function openState(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(1200);
  await setDsl(page, DSL);
}

// 指摘の一覧を「開いた状態」にする。ボタンは開閉のトグルなので、開いていれば押さない。
async function openPinPanel(page) {
  const open = await page.evaluate(() => {
    var el = document.getElementById('pin-panel');
    return !!(el && el.classList.contains('open'));
  });
  // 開いていれば一度閉じる。ボタンは開閉のトグルで、開き直すと中身も組み直される。
  if (open) await page.locator('#btn-tab-pins').click();
  await page.locator('#btn-tab-pins').click();
  await page.waitForTimeout(300);
}

async function pinLine(page, line, text) {
  await page.evaluate((n) => {
    var ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    var start = ed.value.split('\n').slice(0, n - 1).join('\n').length + (n > 1 ? 1 : 0);
    ed.focus();
    ed.selectionStart = start;
    ed.selectionEnd = start;
  }, line);
  await openPinPanel(page);
  await page.locator('#pin-text').fill(text);
  await page.locator('#pin-add').click();
  await page.waitForTimeout(1200);
}

test.describe('BLK-junior-20260907-2303-wish: 指摘から対象へジャンプ', () => {

  test('指摘の「対象へジャンプ」1 クリックで対象が選択され、修正フォームが開く', async ({ page }) => {
    await openState(page);
    await pinLine(page, 6, '異常検知からの復帰遷移が無い');

    // 一覧を開いて、指摘 1 件にジャンプボタンが出ている。
    await openPinPanel(page);
    const jump = page.locator('#pin-panel .pin-jump').first();
    await expect(jump).toBeVisible();
    await expect(jump).toHaveText('対象へジャンプ');

    // クリック 1 回。ここで 選択 + 右ペインが同時に動く。
    await jump.click();
    await page.waitForTimeout(600);

    // 何をしたかが一覧の中で言われている。
    await expect(page.locator('#pin-jump-note')).toContainText('L6');

    // 対象要素が選択されている (図の上のハイライトの元になる選択状態)。
    const sel = await page.evaluate(() => window.MA.selection.getSelected());
    expect(sel.length).toBe(1);
    expect(sel[0].line).toBe(6);

    // 右ペインは「選択中」タブ = 修正フォームが開いている。
    await expect(page.locator('#props-tab-props')).toHaveClass(/active/);
    await expect(page.locator('#props-content')).toBeVisible();
  });

  test('指摘先の行が書き換わるとジャンプは押せず、理由が出る', async ({ page }) => {
    await openState(page);
    await pinLine(page, 6, '異常検知からの復帰遷移が無い');

    // 指摘先の行を書き換える (anchor が合わなくなる)。
    const cur = await page.evaluate(() => (
      /** @type {HTMLTextAreaElement} */ (document.getElementById('editor')).value));
    await setDsl(page, cur.replace('Busy --> Error : Timer_Fault', 'Busy --> Fault : Timer_Fault'));

    await openPinPanel(page);
    const jump = page.locator('#pin-panel .pin-jump').first();
    await expect(jump).toBeDisabled();
    await expect(jump).toHaveText('対象が迷子');
  });

  test('「次の未読へジャンプ」で未読の指摘を順に辿れる', async ({ page }) => {
    await openState(page);
    await pinLine(page, 4, 'Timer_StartConv に対応する method が無い');
    await pinLine(page, 6, '異常検知からの復帰遷移が無い');

    await openPinPanel(page);
    const next = page.locator('#pin-next-open');
    await expect(next).toContainText('2');

    await next.click();
    await page.waitForTimeout(500);
    let sel = await page.evaluate(() => window.MA.selection.getSelected());
    expect(sel[0].line).toBe(4);

    await next.click();
    await page.waitForTimeout(500);
    sel = await page.evaluate(() => window.MA.selection.getSelected());
    expect(sel[0].line).toBe(6);
  });
});
