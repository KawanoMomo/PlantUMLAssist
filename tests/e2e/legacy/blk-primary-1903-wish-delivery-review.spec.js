// @ts-check
// BLK-primary-20260908-1903-wish 「提出前レビュー画面 (変更前後を並べて出す)」。
// 納品パッケージが出すのは件数と行数だけで、何が変わったかはタブを 1 枚ずつ
// 切り替えて見比べるしかなかった。前回提出時点の図と今の図を並べて / 重ねて出す。
// BLK-primary-20260924-1332-wish: 🔍 提出前レビューの画面 (#dr-modal) は ▤ 変更サマリボードに畳んだ。
// 同じ事実を、ボードを 変更前 = 前回提出・🖼 SVGで見る で開いた画面で見る形に書き換えた
// (「重ねて表示」はボードの 🖼 表示の「切替」の 1 段になった)。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const SEQ_A = [
  '@startuml', 'title ADC 初期化', 'participant App', 'participant Adc',
  'App -> Adc : Init', '@enduml',
].join('\n');
const SEQ_B = [
  '@startuml', 'title ADC 初期化', 'participant App', 'participant AdcDriver',
  'App -> AdcDriver : Init', 'AdcDriver --> App : Done', '@enduml',
].join('\n');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(700);
}

// 1 枚の図を「前回提出済み」にしてから中身を変える。
async function submitThenEdit(page) {
  await gotoApp(page);
  await page.evaluate(() => {
    var ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), 'Adc_Seq');
  });
  await setDsl(page, SEQ_A);
  // 前回提出の控えを直に置く (zip のダウンロードは別 spec の職掌)。
  await page.evaluate((dsl) => {
    window.MA.deliveryPackage.markDelivered(
      [{ name: 'Adc_Seq', dsl: dsl }], { title: '設計書', revision: '1.0' });
  }, SEQ_A);
  await setDsl(page, SEQ_B);
}

test.describe('BLK-primary-1903-wish 提出前レビュー (▤ 変更サマリボードの 前回提出)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  async function openReview(page) {
    // BLK-owner-20260918-0329-prune: 入口は Export ▾ の「渡す」
    await page.locator('#btn-export').click();
    await page.locator('#exp-delivery').click();
    await page.locator('#dp-review').click();
    await expect(page.locator('#cb-modal')).toBeVisible();
  }

  test('納品パッケージに「変更前後を見比べる」が出る', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#btn-export').click();
    await page.locator('#exp-delivery').click();
    await expect(page.locator('#dp-review')).toBeVisible();
  });

  test('押すとボードが 前回提出・SVG で開き、変わった文字を名指しする', async ({ page }) => {
    await submitThenEdit(page);
    await openReview(page);
    await expect(page.locator('#dp-modal')).toBeHidden();
    await expect(page.locator('#cb-base')).toHaveValue('delivery');
    await expect(page.locator('#cb-svg')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#cb-summary')).toContainText('変更前 = 前回提出');
    const entry = page.locator('.cb-entry[data-doc-name="Adc_Seq"]');
    // 前回提出の SVG と今の SVG が両方描かれている
    await expect(entry.locator('.cb-pane-body svg')).toHaveCount(2, { timeout: 20000 });
    await expect(entry.locator('.cb-svg-diff')).toContainText('見た目が変わっています', { timeout: 20000 });
    await expect(entry.locator('.cb-svg-added')).toContainText('AdcDriver');
    await expect(entry.locator('.cb-svg-removed')).toContainText('Adc');
    // 重ねる: 切替を 3 回押すと 変更前だけ → 変更後だけ → 重ねる
    const flip = entry.locator('.cb-flip');
    await flip.click();
    await flip.click();
    await flip.click();
    await expect(flip).toHaveText('切替: 重ねる');
    await expect(entry.locator('.cb-show')).toHaveAttribute('data-side', 'overlay');
    await expect(entry.locator('.cb-pane-body svg')).toHaveCount(2);
    await expect(entry.locator('.cb-pane[data-side="after"] .cb-pane-label')).toBeVisible();
  });

  test('前回提出に無い図は「新規の図です」と言う', async ({ page }) => {
    await submitThenEdit(page);
    await page.locator('#btn-tab-new').click();
    await page.evaluate(() => {
      var ws = window.MA.workspace;
      ws.rename(ws.getActiveId(), 'New_Seq');
    });
    await setDsl(page, SEQ_A);
    await openReview(page);
    const entry = page.locator('.cb-entry[data-doc-name="New_Seq"]');
    await expect(entry.locator('.cb-svg-diff')).toContainText('新規の図です', { timeout: 20000 });
  });

  test('Ctrl+K「提出前レビュー」でも同じボードが開く (行は 1 つ)', async ({ page }) => {
    await submitThenEdit(page);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('提出前レビュー');
    await page.waitForTimeout(250);
    await expect(page.locator('#cp-list .cp-item', { hasText: '提出前レビュー' })).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(page.locator('#cb-modal')).toBeVisible();
    await expect(page.locator('#cb-base')).toHaveValue('delivery');
    await expect(page.locator('#cb-svg')).toHaveAttribute('aria-pressed', 'true');
  });
});
