// @ts-check
// BLK-primary-20260908-0923-wish 会議メモ — 変更サマリボードの中身 (要修正件数・印の付いた行・
// 申し送り) を 1 枚の Markdown に書き出し、会議室の外へ持ち出せるようにする。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const BEFORE = ['@startuml', 'class Adc_Driver {', '  Adc_Init()', '}', '@enduml'].join('\n');
const AFTER = ['@startuml', 'class Adc_Driver {', '  Adc_Init()', '  Adc_Ack()', '}', '@enduml'].join('\n');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(600);
}

// Adc_Driver を 1 枚開き、変更前を基準にしてから Adc_Ack() を足す。
async function openChangedDiagram(page) {
  await gotoApp(page);
  await page.evaluate(() => {
    const ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), 'Adc_Driver');
  });
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(400);
  await setDsl(page, BEFORE);
  await page.evaluate(() => window.MA.saveDiff.markAll(window.MA.workspace.list()));
  await setDsl(page, AFTER);
}

test.describe('BLK-primary-0923-wish 会議メモの書き出し', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try { window.localStorage.clear(); } catch (e) {}
    });
  });

  test('ボードに「会議メモを書き出す」があり、押すと Markdown が落ちてくる', async ({ page }) => {
    await openChangedDiagram(page);
    await page.locator('#btn-tab-board').click();
    await expect(page.locator('#cb-modal')).toBeVisible();

    const btn = page.locator('#cb-minutes');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText(/会議メモを書き出す/);

    // 追加された行に「要修正」を付けてから書き出す (会議で出た指摘)。
    const row = page.locator('#cb-body table.cb-diff tr.cb-add').first();
    await row.locator('td.cb-verdict button[data-verdict="要修正"]').click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      btn.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^会議メモ-\d{8}-\d{4}\.md$/);
    await expect(page.locator('#cb-minutes-state')).toContainText('会議メモを書き出しました');
  });

  test('落ちてきたメモに要修正の件数と該当行が入っている', async ({ page }) => {
    await openChangedDiagram(page);
    await page.locator('#btn-tab-board').click();
    const row = page.locator('#cb-body table.cb-diff tr.cb-add').first();
    await row.locator('td.cb-verdict button[data-verdict="要修正"]').click();

    // 申し送りも 1 行入れておく (会議の記録としてまとめて出ることを見る)。
    const note = page.locator('#cb-body .cb-note-row input.cb-note').first();
    await note.fill('Adc_Ack() は adc_state の Done→Configured に対応する');
    await note.press('Tab');

    // 実際に書き出される本文をそのまま読む (ダウンロード経由だと OS 依存になる)。
    const text = await page.evaluate(() => window.MA.meetingNotes.build({
      board: window.MA.changeBoard.build(
        window.MA.workspace.list(), window.MA.saveDiff.baselineOf, { collapse: true, context: 2 }),
      verdicts: window.MA.reviewVerdicts,
      notes: window.MA.handoverNotes,
      at: '2026-09-08T09:50:00.000Z',
    }).text);

    expect(text).toContain('# レビュー会議メモ');
    expect(text).toContain('要修正 1 件 / 済 0 件');
    expect(text).toContain('| Adc_Driver | 1 | 0 |');
    expect(text).toContain('### Adc_Driver (class)');
    expect(text).toContain('[要修正] + `Adc_Ack()`');
    expect(text).toContain('申し送り: Adc_Ack() は adc_state の Done→Configured に対応する');
  });

  test('コピーを押すとクリップボードに同じ本文が入る', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openChangedDiagram(page);
    await page.locator('#btn-tab-board').click();
    await page.locator('#cb-minutes-copy').click();
    await expect(page.locator('#cb-minutes-state')).toContainText('コピーしました');

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('# レビュー会議メモ');
    expect(copied).toContain('## 要修正の残り');
  });
});
