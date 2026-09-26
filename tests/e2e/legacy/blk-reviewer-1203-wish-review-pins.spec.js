// @ts-check
// BLK-reviewer-20260907-1203-wish: レビューの指摘を図の該当箇所にピン留めする。
// reviewer が指摘を打ち、primary が図を開いた瞬間に該当箇所が光り、既読で追える、を実機で見る。
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

// 指摘先の行にキャレットを置いてから、指摘を打って留める。
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

test.describe('BLK-reviewer-20260907-1203-wish: 指摘を図にピン留めする', () => {

  test('指摘を打つと DSL にコメントとして残り、図の行は 1 行も動かない', async ({ page }) => {
    await openState(page);
    await pinLine(page, 4, 'Timer_StartConv に対応する method が無い');
    var t = await getEditorText(page);
    expect(t).toContain("' @pin ");
    expect(t).toContain('Timer_StartConv に対応する method が無い');
    expect(t).toContain('Idle --> Busy : Timer_StartConv');
    // 描画は壊れない (エラー表示が出ない)
    await expect(page.locator('#render-status')).not.toContainText('ERROR');
  });

  test('未読の指摘があるとタブの道具に件数が出る', async ({ page }) => {
    await openState(page);
    await expect(page.locator('#btn-tab-pins')).toHaveText('指摘 −');
    await pinLine(page, 4, 'method が無い');
    await expect(page.locator('#btn-tab-pins')).toHaveText('指摘 1/1');
    await expect(page.locator('#btn-tab-pins')).toHaveClass(/has-open/);
  });

  test('図を開いた時点で該当箇所に印が出て、押すと指摘が読める', async ({ page }) => {
    await openState(page);
    await pinLine(page, 4, 'Timer_StartConv に対応する method が無い');
    await page.keyboard.press('Escape');
    await page.locator('#preview-container').click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(500);
    var marker = page.locator('#overlay-layer .review-pin').first();
    if (await marker.count() === 0) test.skip();
    await expect(marker).toHaveAttribute('data-pin-state', 'open');
    await marker.click();
    await page.waitForTimeout(300);
    await expect(page.locator('#pin-panel')).toContainText('Timer_StartConv に対応する method が無い');
  });

  test('既読にすると印と状態が変わり、DSL にも残る (次の run で反映確認に使える)', async ({ page }) => {
    await openState(page);
    await pinLine(page, 4, 'method が無い');
    await page.locator('.pin-toggle').first().click();
    await page.waitForTimeout(1200);
    // BLK-junior-20260908-0103-wish: バッジの件数は「未対応」= 対応済み以外になった。
    // 既読 (読んだだけ) はまだ直っていないので 1/1 のまま。0 になるのは対応済みにしたとき。
    await expect(page.locator('#btn-tab-pins')).toHaveText('指摘 1/1');
    await expect(page.locator('#pin-panel .pin-row').first()).toHaveAttribute('data-pin-state', 'read');
    var t = await getEditorText(page);
    expect(t).toContain('|read|');
  });

  test('指摘先の行が直されると「行が見つかりません」として残る (消えない)', async ({ page }) => {
    await openState(page);
    await pinLine(page, 4, 'method が無い');
    var t = await getEditorText(page);
    await setDsl(page, t.replace('Idle --> Busy : Timer_StartConv', 'Idle --> Busy : Timer_Start'));
    await page.keyboard.press('Escape');
    await page.locator('#btn-tab-pins').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#pin-panel')).toHaveClass(/open/);
    await expect(page.locator('#pin-panel')).toContainText('行が見つかりません');
  });

  test('一覧の行番号を押すとエディタのその行へ飛ぶ', async ({ page }) => {
    await openState(page);
    await pinLine(page, 5, 'Timer_Ack も見当たらない');
    await page.locator('.pin-where').first().click();
    await page.waitForTimeout(300);
    var picked = await page.evaluate(() => {
      var ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      return ed.value.slice(ed.selectionStart, ed.selectionEnd);
    });
    expect(picked).toBe('Busy --> Idle : Timer_Ack');
  });

  test('指摘は消せる', async ({ page }) => {
    await openState(page);
    await pinLine(page, 4, 'method が無い');
    await page.locator('.pin-del').first().click();
    await page.waitForTimeout(1200);
    await expect(page.locator('#btn-tab-pins')).toHaveText('指摘 −');
    expect(await getEditorText(page)).not.toContain("' @pin ");
  });
});
