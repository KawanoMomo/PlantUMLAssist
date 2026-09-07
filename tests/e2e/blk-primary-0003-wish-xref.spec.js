// @ts-check
// BLK-primary-20260908-0003-wish 「参照関係グラフ」。
// 14 枚一式を新人に渡すとき、「この図とこの図は同じ部品名で繋がっている」という
// 関係を渡す手段が無かった。開いている図を 1 プロジェクトとして扱い、部品名を
// 押すとその名前が出る図がタブ上でハイライトされ、一覧から該当行へ運べる。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const SPI = [
  '@startuml', 'participant Spi_Driver', 'participant DmaCtrl',
  'Spi_Driver -> DmaCtrl : Spi_TransmitDma', '@enduml',
].join('\n');
const CAN = [
  '@startuml', 'participant Can_Driver', 'participant DmaCtrl',
  'Can_Driver -> DmaCtrl : Can_Write', '@enduml',
].join('\n');
const CLS = [
  '@startuml', 'class Spi_Driver', 'class Can_Driver',
  'Spi_Driver --> DmaCtrl', '@enduml',
].join('\n');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(700);
}

async function rename(page, name) {
  await page.evaluate((n) => {
    var ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), n);
  }, name);
  await page.waitForTimeout(200);
}

// spi / can / driver_common_class の 3 枚。DmaCtrl は 3 枚すべてに出てくる。
async function openThree(page) {
  await gotoApp(page);
  await rename(page, 'spi');
  await setDsl(page, SPI);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(300);
  await rename(page, 'can');
  await setDsl(page, CAN);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(300);
  await rename(page, 'driver_common_class');
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(500);
  await setDsl(page, CLS);
}

async function openXref(page) {
  const open = await page.evaluate(() => {
    var el = document.getElementById('xref-panel');
    return !!(el && el.classList.contains('open'));
  });
  if (open) await page.locator('#btn-tab-xref').click();
  await page.locator('#btn-tab-xref').click();
  await page.waitForTimeout(400);
}

test.describe('BLK-primary-20260908-0003-wish 参照関係グラフ', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('タブバーに「参照関係」の道具が出る', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#btn-tab-xref')).toBeVisible();
  });

  test('3 枚を 1 プロジェクトとして、図をまたぐ部品名が枚数付きで並ぶ', async ({ page }) => {
    await openThree(page);
    await openXref(page);

    const head = page.locator('#xref-head');
    await expect(head).toHaveAttribute('data-docs', '3');
    await expect(head).toHaveAttribute('data-shared', '3');
    await expect(head).toContainText('図をまたぐ部品名 3 件');

    // 多く跨ぐ名前が先頭に来る (辿る起点になる)。
    const first = page.locator('#xref-names .xref-name').first();
    await expect(first).toHaveAttribute('data-name', 'DmaCtrl');
    await expect(first).toHaveAttribute('data-docs', '3');
    // 1 枚にしか出ない語は手掛かりにならないので並べない。
    await expect(page.locator('#xref-names .xref-name[data-name="Spi_TransmitDma"]')).toHaveCount(0);
  });

  test('部品名を 1 回押すと、出てくる図が一覧に出てタブがハイライトされる', async ({ page }) => {
    await openThree(page);
    await openXref(page);

    // 押す前は案内文だけ。
    await expect(page.locator('#xref-hint')).toBeVisible();

    await page.locator('#xref-names .xref-name[data-name="DmaCtrl"]').click();
    await page.waitForTimeout(300);

    // 3 枚が行き先として並ぶ。宣言が無い図はその旨が分かる。
    const refs = page.locator('#xref-refs .xref-ref');
    await expect(refs).toHaveCount(3);
    await expect(page.locator('#xref-refs .xref-ref[data-doc-name="driver_common_class"]'))
      .toHaveAttribute('data-declared', '0');
    await expect(page.locator('#xref-refs .xref-ref[data-doc-name="spi"]'))
      .toHaveAttribute('data-declared', '1');

    // タブ側でも 3 枚に印が付く。1 枚ずつ開いて名前を照合しなくてよい。
    await expect(page.locator('#tab-bar .tab.xref-hit')).toHaveCount(3);
  });

  test('行き先を押すとその図のその行へ運ばれる', async ({ page }) => {
    await openThree(page);
    await openXref(page);
    await page.locator('#xref-names .xref-name[data-name="Spi_Driver"]').click();
    await page.waitForTimeout(300);

    await page.locator('#xref-refs .xref-ref[data-doc-name="spi"]').click();
    await page.waitForTimeout(800);

    // spi の図に移っている。
    await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-doc-name', 'spi');
    expect(await page.locator('#editor').inputValue()).toContain('Spi_TransmitDma');
  });

  test('図と図の繋がりが、共有している名前付きで出る', async ({ page }) => {
    await openThree(page);
    await openXref(page);
    const link = page.locator('#xref-links .xref-link[data-a="driver_common_class"][data-b="spi"]');
    await expect(link).toHaveCount(1);
    await expect(link).toContainText('DmaCtrl');
    await expect(link).toContainText('Spi_Driver');
  });

  test('参照関係を 1 枚のテキストとして書き出せる', async ({ page }) => {
    await openThree(page);
    await openXref(page);
    const dl = page.waitForEvent('download');
    await page.locator('#btn-xref-export').click();
    const download = await dl;
    expect(download.suggestedFilename()).toBe('xref.md');
  });

  test('図が 1 枚だけなら「またぐ名前は無い」と言う', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SPI);
    await openXref(page);
    await expect(page.locator('#xref-no-shared')).toBeVisible();
    await expect(page.locator('#xref-head')).toHaveAttribute('data-shared', '0');
  });
});
