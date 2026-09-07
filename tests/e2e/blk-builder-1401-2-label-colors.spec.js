const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

// BLK-builder-20260907-1401-2 (design 2b): 本文 / Label のツールバーは B I U ··· creole。
// 色は `···` の内側に畳み、パネルに「文字色 / Text color」「最近使った色」「色を外す」を出す。

const FIXTURE = [
  '@startuml',
  'title Label Colors',
  'actor User',
  'participant System',
  '',
  'User -> System : doLogin',
  'System --> User : ack',
  '@enduml',
].join('\n');

async function setEditor(page, text) {
  await page.evaluate((t) => {
    var ed = document.getElementById('editor');
    ed.value = t;
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await page.waitForTimeout(800);
}

async function selectMessage(page) {
  await page.evaluate(() => {
    var r = document.querySelector('#overlay-layer rect[data-type="message"]');
    r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(400);
}

test.describe('BLK-builder-20260907-1401-2: 本文の色パネル', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await gotoApp(page);
    await setEditor(page, FIXTURE);
    await selectMessage(page);
  });

  test('ツールバーは B I U ··· creole で、色見本は畳まれている', async ({ page }) => {
    const bar = page.locator('.rle-toolbar').first();
    await expect(bar.locator('.rle-b')).toBeVisible();
    await expect(bar.locator('.rle-i')).toBeVisible();
    await expect(bar.locator('.rle-u')).toBeVisible();
    await expect(bar.locator('.rle-color-more')).toBeVisible();
    await expect(bar.locator('.rle-creole')).toHaveText('creole');
    await expect(bar.locator('.rle-color-panel')).toBeHidden();
    await expect(bar.locator('.rle-color').first()).toBeHidden();
  });

  test('··· で色パネルが開き、文字色 / 色を外す / Esc の案内が出る', async ({ page }) => {
    const bar = page.locator('.rle-toolbar').first();
    await bar.locator('.rle-color-more').click();
    const panel = bar.locator('.rle-color-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('文字色 / Text color');
    await expect(panel.locator('.rle-color-clear')).toHaveText('色を外す');
    await expect(panel).toContainText('Esc で閉じる');
    await expect(await bar.locator('.rle-color-more').getAttribute('aria-expanded')).toBe('true');
  });

  test('色を押すと本文に <color:...> が入り、最近使った色に残る', async ({ page }) => {
    const bar = page.locator('.rle-toolbar').first();
    await bar.locator('.rle-color-more').click();
    // 本文を全選択してから色を押す
    await page.evaluate(() => {
      var ta = document.querySelector('.rle-textarea');
      ta.focus();
      ta.setSelectionRange(0, ta.value.length);
    });
    const swatch = bar.locator('.rle-color-panel .rle-color').first();
    const color = await swatch.getAttribute('data-color');
    await swatch.click();
    await page.waitForTimeout(600);

    const dsl = await getEditorText(page);
    expect(dsl).toContain('<color:' + color + '>');

    // 最近使った色にその色が積まれる
    await selectMessage(page);
    const bar2 = page.locator('.rle-toolbar').first();
    await bar2.locator('.rle-color-more').click();
    await expect(bar2.locator('.rle-color-panel .rle-recent-row')).toContainText('最近使った色');
    await expect(bar2.locator('.rle-color-panel .rle-recent[data-color="' + color + '"]')).toHaveCount(1);
  });

  test('Esc は先に色パネルだけを閉じる', async ({ page }) => {
    const bar = page.locator('.rle-toolbar').first();
    await bar.locator('.rle-color-more').click();
    await expect(bar.locator('.rle-color-panel')).toBeVisible();
    await page.locator('.rle-textarea').first().focus();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await expect(bar.locator('.rle-color-panel')).toBeHidden();
    // パネルが閉じただけで、本文エディタは残っている
    await expect(page.locator('.rle-textarea').first()).toBeVisible();
  });

  test('「色を外す」で選択範囲の色指定だけが消える', async ({ page }) => {
    const bar = page.locator('.rle-toolbar').first();
    await bar.locator('.rle-color-more').click();
    // 色付きの本文を入力欄に置き、全選択してから「色を外す」を押す
    await page.evaluate(() => {
      var ta = document.querySelector('.rle-textarea');
      ta.value = '<color:#f74a4a>doLogin</color>';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      ta.setSelectionRange(0, ta.value.length);
    });
    await bar.locator('.rle-color-panel .rle-color-clear').click();
    await page.waitForTimeout(400);
    const val = await page.locator('.rle-textarea').first().inputValue();
    expect(val).toBe('doLogin');
  });
});
