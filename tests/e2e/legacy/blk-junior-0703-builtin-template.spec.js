// @ts-check
// BLK-junior-20260907-0703: GPIO コンポーネント図 (部品 4 つ・依存 6 本) の新規作成。
// 一括欄は構文込みで 184 字を打たせていた。組み込みの雛形なら、選んで
// 作る部品名を 1 語打つだけで同じ図ができる。
// ここでは起票者の手順をそのままなぞり、クリック数とキー入力数を実測する。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

test.describe('BLK-junior-0703 組み込みの雛形で 1 枚目のコンポーネント図を作る', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('雛形は末尾の「組み込みの雛形」に並び、今の図種のものがその先頭に来る', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#rail-cmp').click();
    await page.waitForTimeout(500);
    await page.locator('#btn-tab-template').click();
    await page.waitForTimeout(400);

    // 既定は従来どおり「開いている図」のまま (雛形は末尾に足すだけ)
    const first = await page.locator('#tpl-source option').first().getAttribute('value');
    expect(first.indexOf('doc:')).toBe(0);

    await expect(page.locator('#tpl-source optgroup')).toHaveAttribute('label', '組み込みの雛形');
    const inGroup = await page.locator('#tpl-source optgroup option').evaluateAll(
      (els) => els.map((e) => /** @type {HTMLOptionElement} */ (e).value));
    expect(inGroup[0]).toBe('builtin:component-driver');
  });

  test('雛形を選ぶと置換元が埋まり、置換先の欄に焦点が入る', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#rail-cmp').click();
    await page.waitForTimeout(500);
    await page.locator('#btn-tab-template').click();
    await page.waitForTimeout(400);
    await page.locator('#tpl-source').selectOption('builtin:component-driver');
    await page.waitForTimeout(400);

    expect(await page.locator('#tpl-from').inputValue()).toBe('Xxx');
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('tpl-to');
  });

  test('手順 3 を実測する: クリック 10 以下 / キー入力 50 以下で 4 部品・6 依存の図ができる', async ({ page }) => {
    await gotoApp(page);

    let clicks = 0;
    let keys = 0;
    const click = async (sel) => { clicks++; await page.locator(sel).click(); };
    const type = async (sel, text) => { keys += text.length; await page.locator(sel).fill(text); };

    // 手順 3: コンポーネント図に切り替え、雛形から GPIO の図を作る
    await click('#rail-cmp');
    await page.waitForTimeout(500);
    await click('#btn-tab-template');
    await page.waitForTimeout(400);
    // select は「開く + 選ぶ」で 2 クリックとして数える
    clicks += 2;
    await page.locator('#tpl-source').selectOption('builtin:component-driver');
    await page.waitForTimeout(400);
    await type('#tpl-to', 'Gpio');
    await page.locator('#tpl-to').dispatchEvent('input');
    await page.waitForTimeout(400);
    await click('#btn-tpl-create');
    await page.waitForTimeout(900);

    const dsl = await getEditorText(page);
    const lines = dsl.split('\n').map((l) => l.trim());
    expect(lines.filter((l) => /^component\s/.test(l)).length).toBe(4);
    expect(lines.filter((l) => /\.\.>/.test(l)).length).toBe(6);
    expect(dsl).toContain('GpioDrv');
    expect(dsl).not.toContain('Xxx');

    // 起票の絶対基準
    expect(clicks).toBeLessThanOrEqual(10);
    expect(keys).toBeLessThanOrEqual(50);
    console.log('BLK-junior-0703 実測: clicks=' + clicks + ' keys=' + keys);
  });

  test('既存の図をテンプレートにする従来の経路は変わらない', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#btn-tab-template').click();
    await page.waitForTimeout(400);
    // 開いている図 (起動時のサンプル) が候補に残っている
    const values = await page.locator('#tpl-source option').evaluateAll(
      (els) => els.map((e) => /** @type {HTMLOptionElement} */ (e).value));
    expect(values.some((v) => v.indexOf('doc:') === 0)).toBe(true);
    expect(values.some((v) => v.indexOf('builtin:') === 0)).toBe(true);
  });
});
