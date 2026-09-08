// @ts-check
// BLK-primary-20260907-1303-wish 「引き継ぎパッケージ」。
// ⇉系統チェック・🔍名前突合・▤変更サマリ を別々のタブで開いて見せる代わりに、
// 4 つ (系統チェック結果 / 名前突合結果 / 直近の変更サマリ / SVG 一式) を
// 1 操作で 1 つの zip に書き出す。渡された側は index.html 1 枚で同じものを見られる。
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const SEQ = [
  '@startuml', 'participant Adc_Drv', 'participant Adc_Hw',
  'Adc_Drv -> Adc_Hw : Adc_Init', 'Adc_Drv -> Adc_Hw : Adc_Start', '@enduml',
].join('\n');
const ST = [
  '@startuml', 'state Idle', 'state Busy',
  'Idle --> Busy : Adc_Init', 'Busy --> Idle : Adc_Start', '@enduml',
].join('\n');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(700);
}

// 同じ系統 (adc) の 2 枚をタブに開く。系統チェックが成立する最小の形。
async function openTwoDiagrams(page) {
  await gotoApp(page);
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

test.describe('BLK-primary-1303-wish 引き継ぎパッケージ', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('タブバーに「引き継ぎ」の道具が出る', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#btn-tab-handoff')).toBeVisible();
  });

  test('1 クリックで zip が 1 つ落ちてくる (3 つのタブを開かずに済む)', async ({ page }) => {
    await openTwoDiagrams(page);
    const dl = page.waitForEvent('download', { timeout: 60000 });
    await page.locator('#btn-tab-handoff').click();
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(/^handoff-\d{8}-\d{4}\.zip$/);
  });

  test('zip には index.html と図の枚数ぶんの SVG が入る', async ({ page }) => {
    await openTwoDiagrams(page);
    const dl = page.waitForEvent('download', { timeout: 60000 });
    await page.locator('#btn-tab-handoff').click();
    const file = await dl;
    const at = await file.path();
    const buf = fs.readFileSync(at);
    const text = buf.toString('latin1');
    expect(text.slice(0, 4)).toBe('PK');
    expect(text).toContain('index.html');
    expect(text).toContain('svg/Adc_Seq.svg');
    expect(text).toContain('svg/Adc_State.svg');
  });

  // 節は 5 つになった (4 = 申し送りチェックリスト。BLK-primary-20260908-1803-wish)。
  test('書き出した中身に 5 つの節と判定が入る', async ({ page }) => {
    await openTwoDiagrams(page);
    // zip を解かずに中身を確かめるため、同じ材料からモデルを組み立てて見る。
    const model = await page.evaluate(() => {
      var HP = window.MA.handoffPackage;
      var FA = window.MA.familyAudit;
      var NA = window.MA.nameAudit;
      var docs = window.MA.workspace.list().map(function(d) {
        return { id: d.id, name: d.name, diagramType: d.diagramType, dsl: d.dsl };
      });
      var snap = HP.buildSnapshot({
        docs: docs, families: FA.audit(docs), names: NA.audit(docs),
        board: null, svgs: {},
      });
      return { verdict: snap.verdict, html: HP.renderIndexHtml(snap), total: snap.total };
    });
    expect(model.total).toBe(2);
    expect(model.html).toContain('1. 系統チェック結果');
    expect(model.html).toContain('2. 名前突合結果');
    expect(model.html).toContain('3. 直近の変更サマリ');
    expect(model.html).toContain('4. 申し送りチェックリスト');
    expect(model.html).toContain('5. 図一式');
    // 2 枚は同じ動作名で揃えてあるので「問題なし」で渡せる。
    expect(model.verdict).toContain('問題なし');
  });

  test('画面に「書き出しました」と判定の 1 行が出る', async ({ page }) => {
    await openTwoDiagrams(page);
    const dl = page.waitForEvent('download', { timeout: 60000 });
    await page.locator('#btn-tab-handoff').click();
    await dl;
    await expect(page.locator('#bulk-export-status')).toContainText('引き継ぎパッケージを書き出しました');
    await expect(page.locator('#bulk-export-status')).toContainText('問題なし');
  });

  test('Ctrl+K のコマンドパレットからも作れる', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('ひきつぎ');
    await page.waitForTimeout(300);
    await expect(page.locator('#cp-list .cp-item').first()).toContainText('引き継ぎパッケージ');
  });
});
