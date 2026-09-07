// @ts-check
// BLK-primary-20260907-2303-wish: 変更サマリボードは開き直すたびに「前回保存時点からの
// 差分」に計算し直されるので、レビュー会議が終わると「なぜ直したか」が残らず、
// 新人への引き継ぎは口頭説明を図の枚数ぶん繰り返すことになっていた。
// ボードの各行に一言を添えて申し送りとして残し、その図を次に開いた人に帯で出す。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const ADC = '@startuml\nclass Adc_Driver {\n  Adc_Init()\n}\n@enduml';
const SPI = '@startuml\nclass Spi_Driver {\n  Spi_Init()\n}\n@enduml';
const WHY = 'adc_state の Done→Configured に対応するメソッドが無かった';

// 最初の 1 回だけ空にする。reload しても申し送りが残ることを見るテストがあるので、
// 読み込みのたびに消してしまうと確かめたいものが消える (sessionStorage は reload で残る)。
async function freshWorkspace(page) {
  await page.addInitScript(() => {
    try {
      if (!window.sessionStorage.getItem('e2e-cleared')) {
        window.localStorage.clear();
        window.sessionStorage.setItem('e2e-cleared', '1');
      }
    } catch (e) {}
  });
}

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(250);
}

// 2 枚開いて基準を取り、1 枚目 (adc) に Adc_Ack() を足した状態にする。
async function twoDiagramsOneChanged(page) {
  await gotoApp(page);
  await typeDsl(page, ADC);
  await page.locator('#btn-tab-new').click();
  await typeDsl(page, SPI);

  await page.locator('#btn-tab-diff').click();
  await page.locator('#diff-mark-all').click();
  await page.locator('body').click({ position: { x: 5, y: 5 } });

  await page.locator('#tab-bar .tab').first().click();
  await page.waitForTimeout(200);
  await typeDsl(page, ADC.replace('  Adc_Init()', '  Adc_Init()\n  Adc_Ack()'));
}

test.describe('BLK-primary-2303-wish 申し送り', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('変更サマリの行に一言を添えると、その図を開いた人に帯で出る', async ({ page }) => {
    await twoDiagramsOneChanged(page);

    await page.locator('#btn-tab-board').click();
    await expect(page.locator('#cb-modal')).toBeVisible();
    const row = page.locator('#cb-body .cb-entry .cb-note-row').first();
    await expect(row).toBeVisible();
    await row.locator('input.cb-note').fill(WHY);
    await row.locator('input.cb-note').blur();
    await expect(row.locator('.cb-note-state')).toHaveText('保存済み');
    await expect(page.locator('#cb-summary')).toContainText('申し送り 1 件');
    await page.locator('#cb-close').click();

    // 別の図へ移ると帯は出ない (その図の申し送りだけを出す)
    await page.locator('#tab-bar .tab').nth(1).click();
    await page.waitForTimeout(200);
    await expect(page.locator('#hn-banner')).toBeHidden();

    // 申し送りを書いた図に戻ると、開いた時点で帯が出る
    await page.locator('#tab-bar .tab').first().click();
    await page.waitForTimeout(200);
    await expect(page.locator('#hn-banner')).toBeVisible();
    await expect(page.locator('#hn-banner-text')).toContainText('申し送り');
    await expect(page.locator('#hn-banner-text')).toContainText(WHY);
  });

  test('基準を取り直して差分が消えても申し送りは残る', async ({ page }) => {
    await twoDiagramsOneChanged(page);

    await page.locator('#btn-tab-board').click();
    await page.locator('#cb-body .cb-entry .cb-note-row input.cb-note').first().fill(WHY);
    await page.locator('#cb-body .cb-entry .cb-note-row input.cb-note').first().blur();
    await page.locator('#cb-close').click();

    // 今の内容を基準にし直す = ボードの差分は 0 枚になる
    await page.locator('#btn-tab-diff').click();
    await page.locator('#diff-mark-all').click();
    await page.locator('body').click({ position: { x: 5, y: 5 } });

    await page.locator('#btn-tab-board').click();
    await expect(page.locator('#cb-body .cb-empty')).toBeVisible();
    // 差分が無くなっても、申し送りは「この画面に出ていない図」として残る
    await expect(page.locator('#cb-body .cb-notes-only')).toBeVisible();
    await expect(page.locator('#cb-body .cb-notes-only input.cb-note').first()).toHaveValue(WHY);
    await expect(page.locator('#cb-summary')).toContainText('申し送り 1 件');
  });

  test('開き直しても申し送りは残り、新人が開いたときに出る', async ({ page }) => {
    await twoDiagramsOneChanged(page);
    await page.locator('#btn-tab-board').click();
    await page.locator('#cb-body .cb-entry .cb-note-row input.cb-note').first().fill(WHY);
    await page.locator('#cb-body .cb-entry .cb-note-row input.cb-note').first().blur();
    await page.locator('#cb-close').click();

    // 引き継がれた側が開き直した状態 (localStorage は消さない)
    await page.reload();
    await page.waitForTimeout(1200);
    await expect(page.locator('#hn-banner')).toBeVisible();
    await expect(page.locator('#hn-banner-text')).toContainText(WHY);
  });

  test('× で閉じても申し送りは消えず、書き直すとその行へ飛ぶ', async ({ page }) => {
    await twoDiagramsOneChanged(page);
    await page.locator('#btn-tab-board').click();
    await page.locator('#cb-body .cb-entry .cb-note-row input.cb-note').first().fill(WHY);
    await page.locator('#cb-body .cb-entry .cb-note-row input.cb-note').first().blur();
    await page.locator('#cb-close').click();
    await expect(page.locator('#hn-banner')).toBeVisible();

    await page.locator('#hn-banner-edit').click();
    await expect(page.locator('#cb-modal')).toBeVisible();
    await expect(page.locator('#cb-body .cb-note-row input.cb-note').first()).toBeFocused();
    await page.locator('#cb-close').click();

    await page.locator('#hn-banner-close').click();
    await expect(page.locator('#hn-banner')).toBeHidden();
    // 閉じたのは帯だけ。ボードには申し送りが残っている
    await page.locator('#btn-tab-board').click();
    await expect(page.locator('#cb-body .cb-note-row input.cb-note').first()).toHaveValue(WHY);
  });

  test('空にすると申し送りが消え、帯も出なくなる', async ({ page }) => {
    await twoDiagramsOneChanged(page);
    await page.locator('#btn-tab-board').click();
    const input = page.locator('#cb-body .cb-entry .cb-note-row input.cb-note').first();
    await input.fill(WHY);
    await input.blur();
    await input.fill('');
    await input.blur();
    await expect(page.locator('#cb-body .cb-entry .cb-note-row .cb-note-state').first()).toHaveText('');
    await expect(page.locator('#cb-summary')).not.toContainText('申し送り');
    await page.locator('#cb-close').click();
    await expect(page.locator('#hn-banner')).toBeHidden();
  });
});
