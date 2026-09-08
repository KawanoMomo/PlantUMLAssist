// @ts-check
// BLK-reviewer-20260908-1403-wish 「突合一覧」。
// 突合は audit.js を node で叩いて JSON を読むしかなく、run のたびにその場の
// スクリプトを保守していた。名前の不一致・未使用 participant・粒度のばらつきが
// 1 画面に並び、カテゴリと図で絞れて、行から図へ飛べて、指摘.md 用に写せること。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

// Gpio_Driver と GPIO_Driver (表記揺れ)、どの矢印にも出てこない Unused (未使用)。
const SEQ = [
  '@startuml', 'participant Gpio_Driver', 'participant Gpio_Hw', 'participant Unused',
  'Gpio_Driver -> Gpio_Hw : Gpio_Init', '@enduml',
].join('\n');
const CLS = [
  '@startuml', 'class GPIO_Driver {', '  +Gpio_Init()', '}', '@enduml',
].join('\n');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(600);
}

async function openTwo(page) {
  await gotoApp(page);
  await page.evaluate(() => {
    var ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), 'Gpio_Seq');
  });
  await setDsl(page, SEQ);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    var ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), 'Gpio_Class');
  });
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(500);
  await setDsl(page, CLS);
}

test('突合一覧を開くと、種類の違う指摘が 1 つの表に並ぶ', async ({ page }) => {
  await openTwo(page);
  await page.locator('#btn-tab-cross').click();
  await expect(page.locator('#ab-modal')).toBeVisible();

  const rows = page.locator('#ab-body .ab-row');
  expect(await rows.count()).toBeGreaterThan(1);
  // 表記揺れと未使用 participant が、別のモーダルを開かずに同じ表に出る
  await expect(page.locator('#ab-body tr[data-ab-kind="name.variants"]')).toHaveCount(1);
  await expect(page.locator('#ab-body tr[data-ab-kind="consistency.unused"]')).toHaveCount(1);
  await expect(page.locator('#ab-summary')).toContainText('件');
});

test('カテゴリと図の 2 通りで絞り込める', async ({ page }) => {
  await openTwo(page);
  await page.locator('#btn-tab-cross').click();
  const before = await page.locator('#ab-body .ab-row').count();

  await page.locator('#ab-kind').selectOption('consistency.unused');
  await page.waitForTimeout(200);
  await expect(page.locator('#ab-body .ab-row')).toHaveCount(1);
  await expect(page.locator('#ab-body .ab-title')).toHaveText('Unused');

  await page.locator('#ab-kind').selectOption('');
  await page.locator('#ab-doc').selectOption('Gpio_Class');
  await page.waitForTimeout(200);
  // Gpio_Seq にしか無い未使用 participant は落ち、
  // 両方にまたがる表記揺れは残る (図をまたぐ指摘を絞り込みで見失わない)。
  await expect(page.locator('#ab-body tr[data-ab-kind="consistency.unused"]')).toHaveCount(0);
  await expect(page.locator('#ab-body tr[data-ab-kind="name.variants"]')).toHaveCount(1);
  expect(await page.locator('#ab-body .ab-row').count()).toBeLessThan(before);
});

test('行を押すとその図が前に出て、一覧は閉じる', async ({ page }) => {
  await openTwo(page);
  await page.locator('#btn-tab-cross').click();
  await page.locator('#ab-body tr[data-ab-kind="consistency.unused"]').click();
  await expect(page.locator('#ab-modal')).toBeHidden();
  const name = await page.evaluate(() => {
    var ws = window.MA.workspace;
    var id = ws.getActiveId();
    var hit = '';
    ws.list().forEach(function(d) { if (d.id === id) hit = d.name; });
    return hit;
  });
  expect(name).toBe('Gpio_Seq');
});

test('指摘.md 用の markdown はカテゴリ見出しと図名つきで作られる', async ({ page }) => {
  await openTwo(page);
  await page.locator('#btn-tab-cross').click();
  // クリップボードは環境によっては拒む。写す中身そのものを見る。
  const md = await page.evaluate(() => window.copyAuditBoard());
  expect(md).toContain('# 突合ダッシュボード');
  expect(md).toContain('## 整合/未使用');
  expect(md).toContain('[Gpio_Seq] Unused');
});
