// @ts-check
// BLK-reviewer-20260907-2303-wish 「監査履歴」。
// 監査ツールが育つと、DSL が 1 行も変わっていなくても同じ欠陥が別カテゴリへ移り、
// 件数だけを見ていると解消したように読めてしまう。監査を回すたびに記録を積み、
// 欠陥ごとに「どの run でどのカテゴリだったか」を並べて、解消と再分類を分けて出す。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const SEQ = [
  '@startuml', 'participant Adc_Drv', 'participant Adc_Hw',
  'Adc_Drv -> Adc_Hw : Adc_Init', 'Adc_Drv -> Adc_Hw : Adc_Start', '@enduml',
].join('\n');
const ST = [
  '@startuml', 'state Idle', 'state Busy',
  'Idle --> Busy : Adc_Init', 'Busy --> Idle : Adc_Stop', '@enduml',
].join('\n');
const ST_FIXED = [
  '@startuml', 'state Idle', 'state Busy',
  'Idle --> Busy : Adc_Init', 'Busy --> Idle : Adc_Start', '@enduml',
].join('\n');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(600);
}

// 同じ系統 (adc) のシーケンスと状態遷移を 1 枚ずつ。トレース漏れが出る最小の形。
async function openPair(page) {
  await gotoApp(page);
  await page.evaluate(() => { localStorage.removeItem('pua.audit.timeline'); });
  await page.evaluate(() => {
    var ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), 'Adc_Seq');
  });
  await setDsl(page, SEQ);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    var ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), 'Adc_State');
  });
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(500);
  await setDsl(page, ST);
}

async function record(page, label) {
  await page.locator('#at-label').fill(label);
  await page.locator('#at-record').click();
  await page.waitForTimeout(300);
}

test('監査履歴を開くと、まだ記録が無いことと記録の仕方が書いてある', async ({ page }) => {
  await openPair(page);
  await page.locator('#btn-tab-audit-timeline').click();
  await expect(page.locator('#at-modal')).toBeVisible();
  await expect(page.locator('#at-body')).toContainText('まだ記録がありません');
});

test('1 回目の記録では、解消と再分類を区別できないとはっきり出る', async ({ page }) => {
  await openPair(page);
  await page.locator('#btn-tab-audit-timeline').click();
  await record(page, 'run1');
  await expect(page.locator('#at-summary')).toContainText('2 回目から');
  await expect(page.locator('#at-table, #at-body table')).toBeVisible();
  await expect(page.locator('#at-body th').nth(1)).toContainText('run1');
});

test('2 回目を記録すると run が列で並び、解消・再分類・継続・新規の件数が出る', async ({ page }) => {
  await openPair(page);
  await page.locator('#btn-tab-audit-timeline').click();
  await record(page, 'run1');
  await page.locator('#at-close').click();

  await setDsl(page, ST_FIXED);
  await page.locator('#btn-tab-audit-timeline').click();
  await record(page, 'run2');

  const summary = page.locator('#at-summary');
  await expect(summary).toContainText('解消');
  await expect(summary).toContainText('再分類');
  await expect(summary).toContainText('継続');
  await expect(summary).toContainText('新規');
  // run 列 = 2 本 (欠陥列と扱い列を除く)。
  await expect(page.locator('#at-body th')).toHaveCount(4);
  await expect(page.locator('#at-body th').nth(2)).toContainText('run2');
});

test('同じ run 名で 2 回記録しても列は増えない (行が 2 本に割れない)', async ({ page }) => {
  await openPair(page);
  await page.locator('#btn-tab-audit-timeline').click();
  await record(page, 'run1');
  await record(page, 'run1');
  await expect(page.locator('#at-body th')).toHaveCount(3);
});

test('記録を消すと最初の案内に戻る', async ({ page }) => {
  await openPair(page);
  page.on('dialog', (d) => d.accept());
  await page.locator('#btn-tab-audit-timeline').click();
  await record(page, 'run1');
  await page.locator('#at-clear').click();
  await page.waitForTimeout(200);
  await expect(page.locator('#at-body')).toContainText('まだ記録がありません');
});
