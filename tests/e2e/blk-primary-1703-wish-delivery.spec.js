// @ts-check
// BLK-primary-20260907-1703-wish 「納品パッケージ一括生成」。
// 全図 SVG の zip に表紙 (図一覧・版数・提出前チェック結果) と変更履歴
// (前回提出からの差分) を人手で足していた作業を、1 画面 + 1 クリックにする。
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const SEQ = [
  '@startuml', 'title ADC 初期化', 'participant App', 'participant Adc',
  'App -> Adc : Init', '@enduml',
].join('\n');
const ST = [
  '@startuml', 'state Idle', 'state Busy', 'Idle --> Busy : Init', '@enduml',
].join('\n');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(700);
}

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

test.describe('BLK-primary-1703-wish 納品パッケージ', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });

  test('タブバーに「納品パッケージ」の道具が出る', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#btn-tab-delivery')).toBeVisible();
  });

  test('開くと、題・版数・対象の図・チェック結果・差分が 1 画面に揃う', async ({ page }) => {
    await openTwoDiagrams(page);
    await page.locator('#btn-tab-delivery').click();
    await expect(page.locator('#dp-modal')).toBeVisible();
    // まだ 1 度も出していないので初回提出、版数の既定は 1.0
    await expect(page.locator('#dp-last')).toContainText('まだ 1 度も提出していません');
    await expect(page.locator('#dp-revision')).toHaveValue('1.0');
    await expect(page.locator('#dp-count')).toHaveText('2 / 2 枚');
    await expect(page.locator('#dp-list')).toContainText('Adc_Seq');
    await expect(page.locator('#dp-list')).toContainText('Adc_State');
    await expect(page.locator('#dp-submit-line')).toContainText('提出前チェック');
    await expect(page.locator('#dp-change-line')).toContainText('初回提出');
  });

  test('対象から外した図はその場で枚数に反映される', async ({ page }) => {
    await openTwoDiagrams(page);
    await page.locator('#btn-tab-delivery').click();
    await page.locator('#dp-list .dp-pick[data-name="Adc_State"]').uncheck();
    await expect(page.locator('#dp-count')).toHaveText('1 / 2 枚');
    await page.locator('#dp-all').click();
    await expect(page.locator('#dp-count')).toHaveText('2 / 2 枚');
  });

  test('1 クリックで表紙入りの zip が落ちてくる', async ({ page }) => {
    await openTwoDiagrams(page);
    await page.locator('#btn-tab-delivery').click();
    await page.locator('#dp-title').fill('GpioDrv 設計書');
    const dl = page.waitForEvent('download', { timeout: 90000 });
    await page.locator('#dp-build').click();
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(/^delivery-\d{8}-\d{4}\.zip$/);
    const text = fs.readFileSync(await file.path()).toString('latin1');
    expect(text.slice(0, 2)).toBe('PK');
    expect(text).toContain('index.html');
    expect(text).toContain('svg/Adc_Seq.svg');
    expect(text).toContain('svg/Adc_State.svg');
    await expect(page.locator('#dp-status')).toContainText('納品パッケージを書き出しました');
  });

  test('出したあとに開き直すと、前回提出が控えられ次の版数が入る', async ({ page }) => {
    await openTwoDiagrams(page);
    await page.locator('#btn-tab-delivery').click();
    await page.locator('#dp-title').fill('GpioDrv 設計書');
    const dl = page.waitForEvent('download', { timeout: 90000 });
    await page.locator('#dp-build').click();
    await dl;
    await page.locator('#dp-close').click();

    await page.locator('#btn-tab-delivery').click();
    await expect(page.locator('#dp-last')).toContainText('前回提出 1.0');
    await expect(page.locator('#dp-title')).toHaveValue('GpioDrv 設計書');
    await expect(page.locator('#dp-revision')).toHaveValue('1.1');
    // 何も直していないので「変わった図はありません」
    await expect(page.locator('#dp-change-line')).toContainText('変わった図はありません');
    await expect(page.locator('#dp-list')).toContainText('変更なし');
  });

  test('前回提出のあとに直した図だけが「変更」と出る', async ({ page }) => {
    await openTwoDiagrams(page);
    await page.locator('#btn-tab-delivery').click();
    const dl = page.waitForEvent('download', { timeout: 90000 });
    await page.locator('#dp-build').click();
    await dl;
    await page.locator('#dp-close').click();

    // Adc_Seq を 1 行増やす
    await page.evaluate(() => {
      var ws = window.MA.workspace;
      var d = ws.list().filter(function(x) { return x.name === 'Adc_Seq'; })[0];
      ws.setActive(d.id);
    });
    await page.waitForTimeout(600);
    await setDsl(page, SEQ.replace('@enduml', 'App -> Adc : Start\n@enduml'));

    await page.locator('#btn-tab-delivery').click();
    await expect(page.locator('#dp-change-line')).toContainText('変更 1 枚');
    await expect(page.locator('#dp-list label:has-text("Adc_Seq")')).toContainText('変更');
    await expect(page.locator('#dp-list label:has-text("Adc_State")')).toContainText('変更なし');
  });

  test('index.html は表紙 (題・版数・日付) と目次と差分表と図を 1 枚に持つ', async ({ page }) => {
    await openTwoDiagrams(page);
    const html = await page.evaluate(() => {
      var DP = window.MA.deliveryPackage;
      var CB = window.MA.changeBoard;
      var SC = window.MA.submitCheck;
      var docs = window.MA.workspace.list().map(function(d) {
        return { id: d.id, name: d.name, diagramType: d.diagramType, dsl: d.dsl };
      });
      var pkg = DP.buildPackage({
        docs: docs, svgs: {}, title: 'GpioDrv 設計書', revision: '1.0',
        submit: SC.check(docs, SC.DEFAULT_TERMS),
        board: CB.build(docs, DP.baselineOf, { includeSame: true }),
        last: DP.lastDelivery(),
      });
      return DP.renderIndexHtml(pkg);
    });
    expect(html).toContain('GpioDrv 設計書');
    expect(html).toContain('目次');
    expect(html).toContain('1. 提出前チェック結果');
    expect(html).toContain('2. 前回提出からの差分');
    expect(html).toContain('3. 図面');
    expect(html).toContain('Adc_Seq');
  });

  test('Ctrl+K のコマンドパレットからも開ける', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('のうひん');
    await page.waitForTimeout(300);
    await expect(page.locator('#cp-list .cp-item').first()).toContainText('納品パッケージ');
  });
});
