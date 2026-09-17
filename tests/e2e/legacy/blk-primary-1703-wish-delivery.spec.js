// @ts-check
// BLK-primary-20260907-1703-wish 「納品パッケージ一括生成」。
// 全図 SVG の zip に表紙 (図一覧・版数・提出前チェック結果) と変更履歴
// (前回提出からの差分) を人手で足していた作業を、1 画面 + 1 クリックにする。
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

const DIR = saveDirFor(__filename);

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

  test('Export ▾ の「渡す」に「納品パッケージ」が出る', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#btn-export').click();
    await expect(page.locator('#exp-delivery')).toBeVisible();
  });

  test('開くと、題・版数・対象の図・チェック結果・差分が 1 画面に揃う', async ({ page }) => {
    await openTwoDiagrams(page);
    // BLK-owner-20260918-0329-prune: 入口は Export ▾ の「渡す」
    await page.locator('#btn-export').click();
    await page.locator('#exp-delivery').click();
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
    // BLK-owner-20260918-0329-prune: 入口は Export ▾ の「渡す」
    await page.locator('#btn-export').click();
    await page.locator('#exp-delivery').click();
    await page.locator('#dp-list .dp-pick[data-name="Adc_State"]').uncheck();
    await expect(page.locator('#dp-count')).toHaveText('1 / 2 枚');
    await page.locator('#dp-all').click();
    await expect(page.locator('#dp-count')).toHaveText('2 / 2 枚');
  });

  test('1 クリックで表紙入りの zip が落ちてくる', async ({ page }) => {
    await openTwoDiagrams(page);
    // BLK-owner-20260918-0329-prune: 入口は Export ▾ の「渡す」
    await page.locator('#btn-export').click();
    await page.locator('#exp-delivery').click();
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
    // BLK-owner-20260918-0329-prune: 入口は Export ▾ の「渡す」
    await page.locator('#btn-export').click();
    await page.locator('#exp-delivery').click();
    await page.locator('#dp-title').fill('GpioDrv 設計書');
    const dl = page.waitForEvent('download', { timeout: 90000 });
    await page.locator('#dp-build').click();
    await dl;
    await page.locator('#dp-close').click();

    // BLK-owner-20260918-0329-prune: 入口は Export ▾ の「渡す」
    await page.locator('#btn-export').click();
    await page.locator('#exp-delivery').click();
    await expect(page.locator('#dp-last')).toContainText('前回提出 1.0');
    await expect(page.locator('#dp-title')).toHaveValue('GpioDrv 設計書');
    await expect(page.locator('#dp-revision')).toHaveValue('1.1');
    // 何も直していないので「変わった図はありません」
    await expect(page.locator('#dp-change-line')).toContainText('変わった図はありません');
    await expect(page.locator('#dp-list')).toContainText('変更なし');
  });

  test('前回提出のあとに直した図だけが「変更」と出る', async ({ page }) => {
    await openTwoDiagrams(page);
    // BLK-owner-20260918-0329-prune: 入口は Export ▾ の「渡す」
    await page.locator('#btn-export').click();
    await page.locator('#exp-delivery').click();
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

    // BLK-owner-20260918-0329-prune: 入口は Export ▾ の「渡す」
    await page.locator('#btn-export').click();
    await page.locator('#exp-delivery').click();
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

  // BLK-primary-20260909-0003-wish: 控えが localStorage にしか無かったので、
  // 同じフォルダで何度出していても開き直すたびに「初回提出」に戻っていた。
  // 保存フォルダに控えを置き、納品履歴と「前回提出から変わった図だけ」を出す。
  test('納品履歴が保存フォルダに残り、開き直しても前回提出が基準になる', async ({ page }) => {
    test.setTimeout(150 * 1000);
    async function boot() {
      await page.addInitScript((d) => {
        try {
          window.localStorage.clear();
          window.localStorage.setItem('plantuml-autosave-config', JSON.stringify({
            enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d,
          }));
        } catch (e) {}
      }, DIR);
      await gotoApp(page);
    }
    async function put(name, dsl) {
      await page.evaluate(async (a) => {
        await fetch('/autosave', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
        });
      }, { dir: DIR, name, dsl });
    }

    await boot();
    await page.evaluate(async (d) => {
      await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
    }, DIR);
    await put('Adc_Seq', SEQ);
    await put('Adc_State', ST);

    // BLK-owner-20260918-0329-prune: 入口は Export ▾ の「渡す」
    await page.locator('#btn-export').click();
    await page.locator('#exp-delivery').click();
    await expect(page.locator('#dp-history')).toContainText('提出はまだ記録されていません');
    await expect(page.locator('#dp-count')).toContainText('枚');
    await page.locator('#dp-title').fill('GpioDrv 設計書');
    const dl = page.waitForEvent('download', { timeout: 90000 });
    await page.locator('#dp-build').click();
    const file = await dl;
    await expect(page.locator('#dp-history')).toContainText(file.suggestedFilename());

    // 開き直す (localStorage は消える。フォルダの控えだけが残る)。
    await boot();
    // Adc_Seq だけをフォルダ側で直す。
    await put('Adc_Seq', SEQ.replace('@enduml', ['App -> Adc : Start', '@enduml'].join('\n')));
    // BLK-owner-20260918-0329-prune: 入口は Export ▾ の「渡す」
    await page.locator('#btn-export').click();
    await page.locator('#exp-delivery').click();
    await expect(page.locator('#dp-last')).toContainText('前回提出 1.0');
    await expect(page.locator('#dp-history')).toContainText('前回 ');
    await expect(page.locator('#dp-change-line')).not.toContainText('初回提出');
    await expect(page.locator('#dp-change-line')).toContainText('変更 1 枚');
    // 前回提出から変わった図だけに絞れる。
    await page.locator('#dp-changed').click();
    await expect(page.locator('#dp-count')).toContainText(/^1 \/ \d+ 枚$/);
  });

  test('Ctrl+K のコマンドパレットからも開ける', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+k');
    await page.locator('#cp-input').fill('のうひん');
    await page.waitForTimeout(300);
    await expect(page.locator('#cp-list .cp-item').first()).toContainText('納品パッケージ');
  });
});
