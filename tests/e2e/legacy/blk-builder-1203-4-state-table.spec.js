// @ts-check
// BLK-builder-20260907-1203-4 / design 4c「状態遷移表 / State transition table」
// 図と同じ内容を「現在の状態 × きっかけ」の表で確認でき、セルから遷移を選び、
// 空欄から遷移を新規追加できる。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('../helpers');

const SAMPLE = [
  '@startuml',
  'title Sample State',
  'state Idle',
  'state Running',
  '[*] --> Idle',
  'Idle --> Running : start',
  'Running --> Idle : stop',
  'Running --> [*] : done',
  '@enduml',
].join('\n');

async function openState(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(600);
  await page.evaluate((text) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = text;
    ed.dispatchEvent(new Event('input'));
  }, SAMPLE);
  await page.waitForTimeout(700);
}

async function openTable(page) {
  await openState(page);
  await page.locator('#btn-state-table-toggle').click();
  await expect(page.locator('#state-table-body')).toBeVisible();
}

test.describe('BLK-builder-1203-4 状態遷移表', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('状態遷移図のときだけ表の帯が出る', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#state-table-panel')).toBeHidden();
    await page.locator('#diagram-type').selectOption('plantuml-state');
    await page.waitForTimeout(700);
    await expect(page.locator('#state-table-panel')).toBeVisible();
    await page.locator('#diagram-type').selectOption('plantuml-sequence');
    await page.waitForTimeout(700);
    await expect(page.locator('#state-table-panel')).toBeHidden();
  });

  test('既定では畳まれていて、押すと開く', async ({ page }) => {
    await openState(page);
    await expect(page.locator('#state-table-body')).toBeHidden();
    await page.locator('#btn-state-table-toggle').click();
    await expect(page.locator('#state-table-body')).toBeVisible();
    await page.locator('#btn-state-table-toggle').click();
    await expect(page.locator('#state-table-body')).toBeHidden();
  });

  test('行が状態・列がきっかけ、遷移の無いところは空欄', async ({ page }) => {
    await openTable(page);
    const body = page.locator('#state-table-body');
    await expect(body.locator('thead th')).toHaveCount(5);
    await expect(body.locator('thead th').nth(2)).toHaveText('start');
    await expect(body.locator('tbody tr')).toHaveCount(3);
    await expect(body.locator('tbody tr').nth(0).locator('th')).toHaveText('（開始）');
    // Idle 行: start だけ埋まっていて、stop / done は空欄
    const idle = body.locator('tbody tr').nth(1);
    await expect(idle.locator('td').nth(1)).toHaveText('Running');
    await expect(idle.locator('td').nth(2)).toHaveText('—');
    // Running から [*] へ向かうセルは「（終了）」
    await expect(body.locator('tbody tr').nth(2).locator('td').nth(3)).toHaveText('（終了）');
  });

  test('埋まっているセルを押すとその遷移が右パネルで開く', async ({ page }) => {
    await openTable(page);
    await page.locator('#state-table-body tbody tr').nth(1).locator('td').nth(1).click();
    await expect(page.locator('#st-tr-from')).toHaveValue('Idle');
    await expect(page.locator('#st-tr-to')).toHaveValue('Running');
    await expect(page.locator('#st-tr-trig')).toHaveValue('start');
  });

  test('空欄を押すと行と列を入れた遷移追加フォームが開き、確定で DSL に入る', async ({ page }) => {
    await openTable(page);
    // Idle 行 × stop 列 (空欄)
    await page.locator('#state-table-body tbody tr').nth(1).locator('td').nth(2).click();
    // BLK-human-20260923-2000: 空欄は右パネルの続けて入れるフォームを開く (モーダルは廃止)。
    await expect(page.locator('#st-tail-trig')).toHaveValue('stop');
    await page.locator('#st-tail-to').selectOption('Running');
    await page.locator('#st-tail-add').click();
    await page.waitForTimeout(700);
    expect(await getEditorText(page)).toContain('Idle --> Running : stop');
    // 表も追随して空欄が埋まる
    await expect(page.locator('#state-table-body tbody tr').nth(1).locator('td').nth(2))
      .toHaveText('Running');
  });

  test('DSL を書き換えると表も追随する', async ({ page }) => {
    await openTable(page);
    await page.evaluate(() => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      ed.value = ed.value.replace('Running --> [*] : done', 'Running --> [*] : finish');
      ed.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(700);
    await expect(page.locator('#state-table-body thead th').nth(4)).toHaveText('finish');
  });

  test('表の下に使い方と数の要約が出る', async ({ page }) => {
    await openTable(page);
    await expect(page.locator('#state-table-summary')).toContainText('3 行 · 4 きっかけ · 4 遷移');
    await expect(page.locator('#state-table-summary'))
      .toContainText('空欄をクリックすると遷移を新規追加します');
  });

  test('CSV で書き出しボタンがある', async ({ page }) => {
    await openState(page);
    await expect(page.locator('#btn-state-table-csv')).toBeVisible();
    const csv = await page.evaluate(() => window.MA.stateTable.toCsv(
      window.MA.stateTable.build(window.MA.modules.plantumlState.parse(
        /** @type {HTMLTextAreaElement} */ (document.getElementById('editor')).value))));
    expect(csv.split('\r\n')[0]).toBe('現在の状態 \\ きっかけ,（きっかけなし）,start,stop,done');
  });
});
