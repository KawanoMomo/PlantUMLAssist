// @ts-check
// BLK-primary-20260906-2043 (4 回目の再発、格上げ friction→blocked):
// レビュー指摘は「この 3 クラスに同じメソッドが無い」の形で来るのに、GUI では
// クラスを 1 つ選ぶ→メソッド追加フォームを開く→打つ、を対象の数だけ繰り返していた。
// 「⊞ 一括適用」で名前を 1 度だけ打ち、当てる先をまとめて選んで 1 回で当てる。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const COMMON = [
  '@startuml',
  'title driver_common_class',
  'class Adc_Driver {',
  '  + Adc_Init() : void',
  '}',
  'class Gpio_Driver {',
  '  + Gpio_Init() : void',
  '  + Gpio_Reset() : void',
  '}',
  'class Can_Driver',
  '@enduml',
].join('\n');

async function openClass(page, dsl) {
  await gotoApp(page);
  await page.evaluate(() => {
    const sel = /** @type {HTMLSelectElement} */ (document.getElementById('diagram-type'));
    sel.value = 'plantuml-class';
    sel.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(400);
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, dsl);
  await page.waitForTimeout(900);
}

test.describe('一括適用 (BLK-primary-2043)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
    await openClass(page, COMMON);
  });

  test('パネルを開くと、開いているクラス図のクラスが対象として並ぶ', async ({ page }) => {
    await page.locator('#btn-tab-apply').click();
    await expect(page.locator('#apply-panel')).toHaveClass(/open/);
    for (const name of ['Adc_Driver', 'Gpio_Driver', 'Can_Driver']) {
      await expect(page.locator('#apply-targets .ap-row[data-key$="#' + name + '"]')).toHaveCount(1);
    }
  });

  test('名前を 1 度打って 3 クラスを選ぶと、1 回で 3 件入る', async ({ page }) => {
    await page.locator('#btn-tab-apply').click();
    await page.locator('#apply-name').fill('Reset');
    await page.locator('#apply-extra').fill('void');
    await page.locator('#btn-apply-all').click();
    await expect(page.locator('#apply-summary')).toHaveAttribute('data-add', '3');
    await page.locator('#btn-apply-run').click();
    await page.waitForTimeout(600);
    const text = await getEditorText(page);
    expect(text.split('+ Reset() : void').length - 1).toBe(3);
    // 本体を持たなかった Can_Driver も本体ごと開かれて入る
    expect(text).toContain('class Can_Driver {');
    // 既存メンバーは残る
    expect(text).toContain('+ Adc_Init() : void');
    expect(text).toContain('+ Gpio_Reset() : void');
  });

  test('既にあるクラスは「既にあり」と出て二重に入らない', async ({ page }) => {
    await page.locator('#btn-tab-apply').click();
    await page.locator('#apply-name').fill('Gpio_Reset');
    await page.locator('#btn-apply-all').click();
    await expect(page.locator('#apply-summary')).toHaveAttribute('data-skip', '1');
    await expect(page.locator('#apply-targets .ap-row[data-key$="#Gpio_Driver"]')).toHaveClass(/skip/);
    await page.locator('#btn-apply-run').click();
    await page.waitForTimeout(600);
    const text = await getEditorText(page);
    expect(text.split('Gpio_Reset').length - 1).toBe(3); // 元 1 + Adc/Can へ 1 件ずつ
  });

  test('属性追加に切り替えると欄が「型」になり、属性として入る', async ({ page }) => {
    await page.locator('#btn-tab-apply').click();
    await page.locator('#apply-kind').selectOption('class-attribute');
    await expect(page.locator('#apply-extra-label')).toHaveText('型');
    await page.locator('#apply-name').fill('state');
    await page.locator('#apply-extra').fill('uint8');
    await page.locator('#apply-targets .ap-row[data-key$="#Adc_Driver"] input').check();
    await page.locator('#btn-apply-run').click();
    await page.waitForTimeout(600);
    expect(await getEditorText(page)).toContain('+ state : uint8');
  });

  test('名前が空・対象ゼロでは適用できず、Ctrl+Z で 1 手で戻る', async ({ page }) => {
    await page.locator('#btn-tab-apply').click();
    await expect(page.locator('#btn-apply-run')).toBeDisabled();
    await page.locator('#apply-name').fill('Reset');
    await expect(page.locator('#btn-apply-run')).toBeDisabled();  // 対象未選択
    await page.locator('#btn-apply-all').click();
    await expect(page.locator('#btn-apply-run')).toBeEnabled();
    await page.locator('#btn-apply-run').click();
    await page.waitForTimeout(600);
    expect(await getEditorText(page)).toContain('+ Reset()');
    await page.locator('#btn-apply-close').click();
    await page.locator('#editor').click();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(600);
    expect(await getEditorText(page)).not.toContain('+ Reset()');
  });
});
