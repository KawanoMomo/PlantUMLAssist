// @ts-check
// BLK-junior-20260907-0543: 既にある 2 行の順序だけを入れ替える。
// Properties にも行編集パネルにも並べ替えが無く、削除 → 末尾に追加し直すか
// DSL を全選択して打ち直すしかなかった (約 350 字 = キー入力 50 超)。
// 行編集パネルの「↑移動 / ↓移動」(Alt+↑↓) で 1 手で入れ替わることを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const GPIO_CLASS = [
  '@startuml',
  'class GpioDrv',
  'class GpioDrv_Input',
  'class GpioDrv_Output',
  'class GpioDrv_Interrupt',
  'GpioDrv <|-- GpioDrv_Input',
  'GpioDrv <|-- GpioDrv_Output',
  'GpioDrv_Input --> GpioDrv_Interrupt',
  'GpioDrv_Output --> GpioDrv_Interrupt',
  '@enduml',
].join('\n');

async function openClass(page) {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(500);
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, GPIO_CLASS);
  await page.waitForTimeout(500);
}

async function openLinePanel(page) {
  await page.locator('#btn-tab-lines').click();
  await expect(page.locator('#lines-panel')).toHaveClass(/open/);
}

async function pickLine(page, text) {
  await page.locator('#lines-list .line-row', { hasText: text }).first().click();
  await expect(page.locator('#lines-text')).toBeEnabled();
}

function lineIndex(dsl, text) {
  return dsl.split('\n').indexOf(text);
}

test.describe('BLK-junior-0543 行の並べ替え', () => {
  test('選んだ行に ↑移動 / ↓移動 が出る', async ({ page }) => {
    await openClass(page);
    await openLinePanel(page);
    await expect(page.locator('#btn-lines-move-up')).toBeDisabled();
    await expect(page.locator('#btn-lines-move-down')).toBeDisabled();
    await pickLine(page, 'GpioDrv_Output --> GpioDrv_Interrupt');
    await expect(page.locator('#btn-lines-move-up')).toBeEnabled();
    await expect(page.locator('#btn-lines-move-down')).toBeEnabled();
  });

  test('↑移動 1 回で隣の 2 行が入れ替わる (クリック 3・キー入力 0)', async ({ page }) => {
    await openClass(page);
    let clicks = 0;
    await openLinePanel(page); clicks++;
    await pickLine(page, 'GpioDrv_Output --> GpioDrv_Interrupt'); clicks++;
    await page.locator('#btn-lines-move-up').click(); clicks++;

    await expect.poll(async () => {
      const dsl = await getEditorText(page);
      return lineIndex(dsl, 'GpioDrv_Output --> GpioDrv_Interrupt');
    }).toBe(7);

    const dsl = await getEditorText(page);
    expect(lineIndex(dsl, 'GpioDrv_Input --> GpioDrv_Interrupt')).toBe(8);
    expect(dsl.split('\n').length).toBe(GPIO_CLASS.split('\n').length);
    expect(clicks).toBeLessThanOrEqual(10);
  });

  test('Alt+↑ / Alt+↓ でも動く', async ({ page }) => {
    await openClass(page);
    await openLinePanel(page);
    await pickLine(page, 'GpioDrv_Output --> GpioDrv_Interrupt');
    await page.locator('#lines-text').press('Alt+ArrowUp');
    await expect.poll(async () => lineIndex(await getEditorText(page), 'GpioDrv_Output --> GpioDrv_Interrupt')).toBe(7);
    await page.locator('#lines-text').press('Alt+ArrowDown');
    await expect.poll(async () => lineIndex(await getEditorText(page), 'GpioDrv_Output --> GpioDrv_Interrupt')).toBe(8);
  });

  test('続けて押すと何行でも運べ、行の集合は変わらない', async ({ page }) => {
    await openClass(page);
    await openLinePanel(page);
    await pickLine(page, 'GpioDrv_Output --> GpioDrv_Interrupt');
    await page.locator('#btn-lines-move-up').click();
    await expect.poll(async () => lineIndex(await getEditorText(page), 'GpioDrv_Output --> GpioDrv_Interrupt')).toBe(7);
    await page.locator('#btn-lines-move-up').click();
    await expect.poll(async () => lineIndex(await getEditorText(page), 'GpioDrv_Output --> GpioDrv_Interrupt')).toBe(6);

    const dsl = await getEditorText(page);
    expect(dsl.split('\n').slice().sort().join('|')).toBe(GPIO_CLASS.split('\n').slice().sort().join('|'));
  });

  test('先頭の行では ↑移動 が押せない', async ({ page }) => {
    await openClass(page);
    await openLinePanel(page);
    await pickLine(page, 'class GpioDrv');
    // 一覧は @startuml を隠すので、選べる最初の行 = DSL の 2 行目。
    await expect(page.locator('#btn-lines-move-up')).toBeEnabled();
    await page.locator('#btn-lines-move-up').click();
    await expect.poll(async () => lineIndex(await getEditorText(page), 'class GpioDrv')).toBe(0);
    await expect(page.locator('#btn-lines-move-up')).toBeDisabled();
  });

  test('Ctrl+Z 1 手で移動前に戻る', async ({ page }) => {
    await openClass(page);
    await openLinePanel(page);
    const before = await getEditorText(page);
    await pickLine(page, 'GpioDrv_Output --> GpioDrv_Interrupt');
    await page.locator('#btn-lines-move-up').click();
    await expect.poll(async () => lineIndex(await getEditorText(page), 'GpioDrv_Output --> GpioDrv_Interrupt')).toBe(7);
    await page.locator('#btn-lines-close').click();
    await page.locator('#editor').click();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    expect(await getEditorText(page)).toBe(before);
  });

  test('並べ替えた図がそのまま描ける', async ({ page }) => {
    await openClass(page);
    await openLinePanel(page);
    await pickLine(page, 'GpioDrv_Output --> GpioDrv_Interrupt');
    await page.locator('#btn-lines-move-up').click();
    await expect.poll(async () => lineIndex(await getEditorText(page), 'GpioDrv_Output --> GpioDrv_Interrupt')).toBe(7);
    await page.waitForTimeout(1500);
    await expect(page.locator('#status-parse')).toHaveText('パース OK');
    await expect(page.locator('#preview-svg svg')).toBeVisible();
  });
});
