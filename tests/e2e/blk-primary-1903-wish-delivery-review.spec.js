// @ts-check
// BLK-primary-20260908-1903-wish 「提出前レビュー画面 (変更前後を並べて出す)」。
// 納品パッケージが出すのは件数と行数だけで、何が変わったかはタブを 1 枚ずつ
// 切り替えて見比べるしかなかった。前回提出時点の図と今の図を並べて / 重ねて出す。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

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

test.describe('BLK-primary-1903-wish 提出前レビュー', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('納品パッケージに「変更前後を見比べる」が出る', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#btn-tab-delivery').click();
    await expect(page.locator('#dp-review')).toBeVisible();
  });

  test('押すと前回提出と今回が並び、変わった文字を名指しする', async ({ page }) => {
    await submitThenEdit(page);
    await page.locator('#btn-tab-delivery').click();
    await page.locator('#dp-review').click();
    await expect(page.locator('#dr-modal')).toBeVisible();
    // 変更のある図が最初に開く
    await expect(page.locator('#dr-headline')).toContainText('変更 1 枚');
    await expect(page.locator('#dr-summary')).toContainText('見た目が変わっています', { timeout: 20000 });
    // 前回提出の SVG と今の SVG が両方描かれている
    await expect(page.locator('#dr-view svg')).toHaveCount(2);
    await expect(page.locator('#dr-added')).toContainText('AdcDriver');
    await expect(page.locator('#dr-removed')).toContainText('Adc');
  });

  test('「重ねて表示」に切り替えると 2 枚が重なる', async ({ page }) => {
    await submitThenEdit(page);
    await page.locator('#btn-tab-delivery').click();
    await page.locator('#dp-review').click();
    await expect(page.locator('#dr-summary')).toContainText('見た目が変わっています', { timeout: 20000 });
    await expect(page.locator('#dr-mode')).toContainText('並べて表示中');
    await page.locator('#dr-mode').click();
    await expect(page.locator('#dr-mode')).toContainText('重ねて表示中');
    await expect(page.locator('.dr-stack .dr-before svg')).toBeVisible();
    await expect(page.locator('.dr-stack .dr-after svg')).toBeVisible();
  });

  test('前回提出に無い図は「新規の図です」と言う', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => {
      var ws = window.MA.workspace;
      ws.rename(ws.getActiveId(), 'New_Seq');
    });
    await setDsl(page, SEQ_A);
    await page.locator('#btn-tab-delivery').click();
    await page.locator('#dp-review').click();
    await expect(page.locator('#dr-summary')).toContainText('新規の図です', { timeout: 20000 });
  });

  test('戻ると納品パッケージがそのまま残っている', async ({ page }) => {
    await submitThenEdit(page);
    await page.locator('#btn-tab-delivery').click();
    await page.locator('#dp-review').click();
    await expect(page.locator('#dr-modal')).toBeVisible();
    await page.locator('#dr-close').click();
    await expect(page.locator('#dr-modal')).toBeHidden();
    await expect(page.locator('#dp-modal')).toBeVisible();
  });
});
