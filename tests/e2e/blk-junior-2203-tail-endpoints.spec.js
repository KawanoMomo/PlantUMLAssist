// @ts-check
// BLK-junior-20260907-2203 (friction):
// 応答メッセージ行を選び直しても「末尾に追加」の From/To が前回値のままで、
// プルダウンを 2 つ選び直すことになっていた。選んだ行の当事者を初期値にする。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const DSL = ['@startuml',
  'participant App',
  'participant Gpio_Driver',
  'App -> Gpio_Driver : Gpio_Init()',
  'Gpio_Driver --> App : InitDone',
  '@enduml'].join('\n');

async function setDsl(page, dsl) {
  await page.evaluate((text) => {
    var ed = document.getElementById('editor');
    ed.value = text;
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  }, dsl);
  await page.waitForTimeout(600);
}

// 応答行 (Gpio_Driver --> App : InitDone) を DSL 側で選ぶ。
async function selectInitDone(page) {
  await page.locator('#overlay-layer rect[data-line="5"]').first().click();
  await page.waitForSelector('#seq-msg-from, #props-panel select', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);
}

// 選択を外して「末尾に追加」フォームへ戻る。Ctrl+Enter がその近道
// (BLK-builder-20260907-1346-3)。
async function openTailForm(page) {
  await page.keyboard.press('Control+Enter');
  await page.waitForSelector('#seq-tail-from', { timeout: 5000 });
  await page.waitForTimeout(200);
}

test.describe('BLK-junior-2203: 選んだ行の当事者が末尾追加に活きる', () => {
  test('応答行を選ぶと、末尾追加の From/To がその当事者になる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, DSL);

    await selectInitDone(page);
    await openTailForm(page);

    await expect(page.locator('#seq-tail-from')).toHaveValue('Gpio_Driver');
    await expect(page.locator('#seq-tail-to')).toHaveValue('App');
    await expect(page.locator('#seq-tail-endpoint-note'))
      .toHaveText('直前に選んだ Gpio_Driver → App を初期値にしています');
  });

  test('何も選んでいなければこれまでどおり先頭の参加者のまま', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, DSL);
    await expect(page.locator('#seq-tail-from')).toHaveValue('App');
    await expect(page.locator('#seq-tail-endpoint-note')).toHaveCount(0);
  });

  test('別の行を選び直すと初期値も付いてくる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, DSL);

    await selectInitDone(page);
    await openTailForm(page);
    await expect(page.locator('#seq-tail-from')).toHaveValue('Gpio_Driver');

    // 呼び出し行 (App -> Gpio_Driver) を選び直す
    await page.locator('#overlay-layer rect[data-line="4"]').first().click();
    await page.waitForTimeout(300);
    await openTailForm(page);
    await expect(page.locator('#seq-tail-from')).toHaveValue('App');
    await expect(page.locator('#seq-tail-to')).toHaveValue('Gpio_Driver');
  });

  test('手順5: エラー応答を 1 本足すのがクリック 10 以下・キー 50 以下で終わる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, DSL);

    // 実操作だけを数える (セットアップは数えない)
    await page.evaluate(() => {
      window.__count = { click: 0, key: 0 };
      document.addEventListener('click', () => { window.__count.click++; }, true);
      document.addEventListener('keydown', () => { window.__count.key++; }, true);
    });

    // 1) 応答行を選ぶ → 2) 選択を外して末尾追加フォームへ戻る
    await page.locator('#overlay-layer rect[data-line="5"]').first().click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+Enter');
    await page.waitForSelector('#seq-tail-from', { timeout: 5000 });
    await page.waitForTimeout(200);

    // From/To は選び直さない (ここが今回の直し)
    expect(await page.locator('#seq-tail-from').inputValue()).toBe('Gpio_Driver');
    expect(await page.locator('#seq-tail-to').inputValue()).toBe('App');

    // 3) 矢印を「応答・戻り」に → 4) 本文 → 5) 末尾に追加
    await page.locator('#seq-tail-arrow-seg .prop-seg[data-value="-->"]').click();
    await page.locator('#seq-tail-label-rle textarea, #seq-tail-label-rle [contenteditable]').first().click();
    await page.keyboard.type('InitError');
    await page.locator('#seq-tail-add').click();
    await page.waitForTimeout(600);

    const dsl = await getEditorText(page);
    expect(dsl).toContain('Gpio_Driver --> App : InitError');

    const n = await page.evaluate(() => window.__count);
    expect(n.click).toBeLessThanOrEqual(10);
    expect(n.key).toBeLessThanOrEqual(50);
    console.log('BLK-junior-2203 実測: クリック ' + n.click + ' / キー ' + n.key);
  });
});
