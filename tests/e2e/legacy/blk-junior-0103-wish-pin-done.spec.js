// @ts-check
// BLK-junior-20260908-0103-wish: レビュー指摘に「対応済み」を持たせ、指摘と修正の
// 対応関係を図に残す。junior が指摘を直したあと、ファイル名末尾の「(レビュー反映)」で
// 状態を持たなくても「どの指摘にどの修正が対応するか」が図の中で読める、を実機で見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

const DSL = [
  '@startuml',
  'title Timer state',
  '[*] --> Idle',
  'Idle --> Busy : Timer_StartConv',
  'Busy --> Idle : Timer_Ack',
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

async function pinLine(page, line, text) {
  await page.evaluate((n) => {
    var ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    var start = ed.value.split('\n').slice(0, n - 1).join('\n').length + (n > 1 ? 1 : 0);
    ed.focus();
    ed.selectionStart = start;
    ed.selectionEnd = start;
  }, line);
  await page.locator('#btn-tab-pins').click();
  await page.locator('#pin-text').fill(text);
  await page.locator('#pin-add').click();
  await page.waitForTimeout(1200);
}

test.describe('BLK-junior-20260908-0103-wish: 指摘を対応済みにして修正を残す', () => {

  test('既読にしただけでは未対応のまま数える (読んだ ≠ 直した)', async ({ page }) => {
    await openState(page);
    await pinLine(page, 4, 'method が無い');
    await expect(page.locator('#btn-tab-pins')).toHaveText('📌 指摘 1/1');
    await page.locator('.pin-toggle').first().click();
    await page.waitForTimeout(1200);
    await expect(page.locator('#btn-tab-pins')).toHaveText('📌 指摘 1/1');
    await expect(page.locator('#pin-panel .pin-row').first()).toContainText('既読');
  });

  test('対応済みにすると件数が減り、DSL にも done として残る', async ({ page }) => {
    await openState(page);
    await pinLine(page, 4, 'method が無い');
    await page.locator('.pin-done').first().click();
    await page.waitForTimeout(1200);
    await expect(page.locator('#btn-tab-pins')).toHaveText('📌 指摘 0/1');
    expect(await getEditorText(page)).toContain('|done|');
    await expect(page.locator('#pin-panel .pin-head')).toHaveAttribute('data-done', '1');
  });

  test('直した後に対応済みにすると、指摘が迷子にならず 修正前 → 修正後 が並ぶ', async ({ page }) => {
    await openState(page);
    await pinLine(page, 4, '遷移名が状態機械と合っていない');
    // junior が指摘どおりに直す。直した時点では指摘先の行が消えて迷子になる。
    var t = await getEditorText(page);
    await setDsl(page, t.replace('Idle --> Busy : Timer_StartConv', 'Idle --> Busy : Timer_Start'));
    await page.keyboard.press('Escape');
    await page.locator('#btn-tab-pins').click();
    await page.waitForTimeout(400);
    await expect(page.locator('#pin-panel')).toContainText('行が見つかりません');
    // 直した要素を選んでから「対応済みにする」を押すと、その行が修正後として記録される。
    await page.evaluate(() => {
      window.MA.selection.setSelected([
        { type: 'transition', id: 'Idle --> Busy : Timer_Start', line: 4 },
      ]);
    });
    await page.locator('.pin-done').first().click();
    await page.waitForTimeout(1200);
    await expect(page.locator('#pin-panel')).not.toContainText('行が見つかりません');
    await expect(page.locator('#pin-panel .pin-fix')).toContainText(
      '修正: Idle --> Busy : Timer_StartConv → Idle --> Busy : Timer_Start');
    // 記録は DSL に残るので、次に開いた先輩 (primary) も同じ対応関係を読める。
    expect(await getEditorText(page)).toContain('Idle --> Busy : Timer_StartConv');
  });

  test('対応済みの印は「済」になり、押しても既読トグルで戻らない', async ({ page }) => {
    await openState(page);
    await pinLine(page, 4, 'method が無い');
    await page.locator('.pin-done').first().click();
    await page.waitForTimeout(1200);
    await expect(page.locator('#pin-panel .pin-row').first()).toHaveAttribute('data-pin-state', 'done');
    // 対応済みの行には既読トグルを出さない (修正の記録を押し間違いで消さない)
    await expect(page.locator('#pin-panel .pin-row[data-pin-state="done"] .pin-toggle')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.locator('#preview-container').click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(500);
    var marker = page.locator('#overlay-layer .review-pin').first();
    if (await marker.count() === 0) return;
    await expect(marker).toHaveAttribute('data-pin-state', 'done');
  });

  test('未対応に戻せる (修正が足りなかったとき)', async ({ page }) => {
    await openState(page);
    await pinLine(page, 4, 'method が無い');
    await page.locator('.pin-done').first().click();
    await page.waitForTimeout(1200);
    await page.locator('.pin-reopen').first().click();
    await page.waitForTimeout(1200);
    await expect(page.locator('#btn-tab-pins')).toHaveText('📌 指摘 1/1');
    await expect(page.locator('#pin-panel .pin-row').first()).toHaveAttribute('data-pin-state', 'open');
  });
});
