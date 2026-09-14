// @ts-check
// BLK-primary-20260908-1703-wish 指摘と変更の対応表 — 変更サマリボードの 1 エントリを
// 「reviewer の指摘」に 1 クリックで結び、会議前に「指摘 → 差分 / 対応なし」の一覧を作る。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(600);
}

// 指摘 2 件が付いた図を基準にしてから、1 行足して「今回の変更」を作る。
// 指摘は基準の側にも入れておく (指摘ピンの行自体を差分に出さないため)。
async function openReviewedDiagram(page) {
  await gotoApp(page);
  await page.evaluate(() => {
    const ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), 'Adc_Driver');
  });
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(400);

  const dsls = await page.evaluate(() => {
    const base = ['@startuml', 'class Adc_Driver {', '  Adc_Init()', '}', '@enduml'].join('\n');
    const RP = window.MA.reviewPins;
    let withPins = RP.add(base, { line: 3, text: 'Done→Configured に対応するメソッドが無い', author: 'reviewer' });
    withPins = RP.add(withPins, { line: 3, text: 'リセットフローが片方向', author: 'reviewer' });
    const after = withPins.replace('  Adc_Init()', '  Adc_Init()\n  Adc_Ack()');
    return { before: withPins, after: after };
  });

  await setDsl(page, dsls.before);
  await page.evaluate(() => window.MA.saveDiff.markAll(window.MA.workspace.list()));
  await setDsl(page, dsls.after);
  await page.locator('#btn-tab-board').click();
  await expect(page.locator('#cb-modal')).toBeVisible();
}

test.describe('BLK-primary-1703-wish 指摘と変更の対応表', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try { window.localStorage.clear(); } catch (e) {}
    });
  });

  test('ボードの先頭に対応表が出て、既定では全件が「対応なし」', async ({ page }) => {
    await openReviewedDiagram(page);
    const map = page.locator('#cb-body .cb-map');
    await expect(map).toBeVisible();
    await expect(map.locator(".cb-map-head .cb-map-count")).toHaveText('指摘 2 件 (対応 0 / 未対応 2)');
    const rows = map.locator('table.cb-map-table tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.first().locator('td.cb-map-state')).toHaveText('対応なし');
    // 指摘の本文が表に出ている (指摘.md を別に開かなくてよい)。
    await expect(map).toContainText('Done→Configured に対応するメソッドが無い');
  });

  test('差分の下の指摘ボタン 1 クリックで結ばれ、対応表が「対応済み」に変わる', async ({ page }) => {
    await openReviewedDiagram(page);
    const links = page.locator('#cb-body .cb-links[data-doc-name="Adc_Driver"]');
    await expect(links).toBeVisible();
    const btn = links.locator('button.cb-link-btn').first();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');

    await btn.click();   // ← クリック 1 回で紐付け

    // 押したボタンはその場に残る (並びが変わると 2 件目を探し直すことになる)。
    const first = page.locator('#cb-body .cb-links button.cb-link-btn').first();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(first).toContainText('Adc_Driver#1');
    const map = page.locator('#cb-body .cb-map');
    await expect(map.locator(".cb-map-head .cb-map-count")).toHaveText('指摘 2 件 (対応 1 / 未対応 1)');
    await expect(map.locator('table.cb-map-table tr[data-map-status="linked"]')).toHaveCount(1);
    await expect(map.locator('tr[data-map-status="linked"] button.cb-map-goto')).toHaveText('Adc_Driver');

    // もう一度押すと外れる (取り消しの操作を別に置かない)。
    await first.click();
    await expect(map.locator(".cb-map-head .cb-map-count")).toHaveText('指摘 2 件 (対応 0 / 未対応 2)');
  });

  test('「未対応の指摘のみ」で、まだ結んでいない指摘だけが残る', async ({ page }) => {
    await openReviewedDiagram(page);
    await page.locator('#cb-body .cb-links button.cb-link-btn').first().click();
    await page.locator('#cb-map-pending').check();
    const rows = page.locator('#cb-body .cb-map table.cb-map-table tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator('td.cb-map-state')).toHaveText('対応なし');
    await expect(rows.first()).toContainText('リセットフローが片方向');
  });

  test('対応表を Markdown で書き出せる (会議資料)', async ({ page }) => {
    await openReviewedDiagram(page);
    await page.locator('#cb-body .cb-links button.cb-link-btn').first().click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#cb-map-export').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^指摘対応表-\d{8}-\d{4}\.md$/);
    await expect(page.locator('#cb-minutes-state')).toContainText('指摘 2 件 (対応 1 / 未対応 1)');
  });

  test('会議メモにも対応表が付く', async ({ page }) => {
    await openReviewedDiagram(page);
    await page.locator('#cb-body .cb-links button.cb-link-btn').first().click();
    const text = await page.evaluate(() => window.buildMeetingNotes().text);
    expect(text).toContain('# 指摘と変更の対応表');
    expect(text).toContain('対応済み');
    expect(text).toContain('Adc_Driver');
  });

  test('指摘が 1 件も無い図では、対応表が空の表ではなく理由を出す', async ({ page }) => {
    await gotoApp(page);
    await page.evaluate(() => {
      const ws = window.MA.workspace;
      ws.rename(ws.getActiveId(), 'Adc_Driver');
    });
    await page.locator('#diagram-type').selectOption('plantuml-class');
    await page.waitForTimeout(400);
    await setDsl(page, ['@startuml', 'class Adc_Driver {', '  Adc_Init()', '}', '@enduml'].join('\n'));
    await page.evaluate(() => window.MA.saveDiff.markAll(window.MA.workspace.list()));
    await setDsl(page, ['@startuml', 'class Adc_Driver {', '  Adc_Init()', '  Adc_Ack()', '}', '@enduml'].join('\n'));
    await page.locator('#btn-tab-board').click();
    await expect(page.locator('#cb-body .cb-map .cb-map-empty')).toContainText('指摘ピンがありません');
    // 指摘が無いときは結び目のボタン列も出さない (押せないボタンを置かない)。
    await expect(page.locator('#cb-body .cb-links')).toHaveCount(0);
  });
});
