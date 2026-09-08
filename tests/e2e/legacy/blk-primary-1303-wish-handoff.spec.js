// @ts-check
// BLK-primary-20260907-1303-wish 「引き継ぎパッケージ」。
// ⇉系統チェック・🔍名前突合・▤変更サマリ を別々のタブで開いて見せる代わりに、
// 4 つ (系統チェック結果 / 名前突合結果 / 直近の変更サマリ / SVG 一式) を
// 1 操作で 1 つの zip に書き出す。渡された側は index.html 1 枚で同じものを見られる。
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

const SAVE_DIR = saveDirFor(__filename);
const ABS_DIR = path.join(__dirname, '..', '..', '..', SAVE_DIR);

const SEQ = [
  '@startuml', 'participant Adc_Drv', 'participant Adc_Hw',
  'Adc_Drv -> Adc_Hw : Adc_Init', 'Adc_Drv -> Adc_Hw : Adc_Start', '@enduml',
].join('\n');
const ST = [
  '@startuml', 'state Idle', 'state Busy',
  'Idle --> Busy : Adc_Init', 'Busy --> Idle : Adc_Start', '@enduml',
].join('\n');

// BLK-primary-20260908-2303-wish: 📦引き継ぎ は押すとまず「対象確認」を出す。
// 書き出しはそのパネルの「この N 枚で書き出す」から始まる。
async function clickHandoff(page) {
  await page.locator('#btn-tab-handoff').click();
  await expect(page.locator('#et-modal')).toBeVisible();
  await page.locator('#et-build').click();
}

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

  test('対象確認から zip が 1 つ落ちてくる (3 つのタブを開かずに済む)', async ({ page }) => {
    await openTwoDiagrams(page);
    const dl = page.waitForEvent('download', { timeout: 60000 });
    await clickHandoff(page);
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(/^handoff-\d{8}-\d{4}\.zip$/);
  });

  test('zip には index.html と図の枚数ぶんの SVG が入る', async ({ page }) => {
    await openTwoDiagrams(page);
    const dl = page.waitForEvent('download', { timeout: 60000 });
    await clickHandoff(page);
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
    await clickHandoff(page);
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

// BLK-primary-20260908-2303-wish 「書き出す前の対象確認」。
// 開いているタブ 2 枚だけが zip に入り、保存フォルダの残りが黙って落ちていた。
// 押した直後に「対象 N 枚 / 保存フォルダ M 枚」と的の切替を出し、渡す前に直せるようにする。
const FOLDER_FILES = {
  spi_init_sequence: SEQ,
  plantuml_state: ST,
  dma_state: ST,
  dma_transfer_sequence: SEQ,
  adc_init_sequence: SEQ,
  uart_state: ST,
};

function writeFolder() {
  try { fs.rmSync(ABS_DIR, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(ABS_DIR, { recursive: true });
  Object.keys(FOLDER_FILES).forEach((n) => {
    fs.writeFileSync(path.join(ABS_DIR, n + '.puml'), FOLDER_FILES[n], 'utf8');
  });
}

async function openWithFolder(page) {
  await page.addInitScript((dir) => {
    try {
      window.localStorage.clear();
      // 自動保存は切る。的はフォルダの中身そのものなので、テスト中に枚数が増えると
      // 「何枚あるか」の検証にならない。
      window.localStorage.setItem('plantuml-autosave-config', JSON.stringify({
        enabled: false, debounceMs: 200, restoreMode: 'manual', backend: 'file', fileDir: dir,
      }));
    } catch (e) {}
  }, SAVE_DIR);
  await gotoApp(page);
  await page.evaluate((dsl) => {
    var ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), 'spi_init_sequence');
    var ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = dsl;
    ed.dispatchEvent(new Event('input'));
  }, SEQ);
  await page.waitForTimeout(700);
  // フォルダは起動が済んでから作る (起動時の diagram1.puml を持ち越さない)。
  writeFolder();
}

test.describe('BLK-primary-2303-wish 書き出す前の対象確認', () => {

  test('📦引き継ぎ を押すと、書き出す前に対象確認が出る', async ({ page }) => {
    await openTwoDiagrams(page);
    await page.locator('#btn-tab-handoff').click();
    await expect(page.locator('#et-modal')).toBeVisible();
    await expect(page.locator('#et-modal-content')).toContainText('対象確認');
    // 保存先フォルダが無い運用では、タブが対象のすべてだと言い切る (偽の警告を出さない)。
    await expect(page.locator('#et-line')).toHaveAttribute('data-warn', '0');
    await expect(page.locator('#et-build')).toContainText('2 枚で書き出す');
  });

  test('タブ 1 枚でも既定はフォルダ全体の 6 枚で、対象一覧に未オープンの図が並ぶ', async ({ page }) => {
    await openWithFolder(page);
    await page.locator('#btn-tab-handoff').click();
    await expect(page.locator('#et-line')).toHaveAttribute('data-folder', '6');
    await expect(page.locator('#et-line')).toHaveAttribute('data-count', '6');
    await expect(page.locator('#et-line')).toHaveAttribute('data-warn', '0');
    await expect(page.locator('#et-list')).toContainText('uart_state');
    await expect(page.locator('.et-item[data-open="0"]')).toHaveCount(5);
  });

  test('「開いているタブだけ」に切り替えると、何枚が落ちるかを書き出す前に警告する', async ({ page }) => {
    await openWithFolder(page);
    await page.locator('#btn-tab-handoff').click();
    await expect(page.locator('#et-line')).toHaveAttribute('data-folder', '6');
    await page.locator('#et-mode-open').check();
    await expect(page.locator('#et-line')).toHaveAttribute('data-count', '1');
    await expect(page.locator('#et-line')).toHaveAttribute('data-missing', '5');
    await expect(page.locator('#et-line')).toHaveAttribute('data-warn', '1');
    await expect(page.locator('#et-line')).toContainText('対象 1 枚 / 保存フォルダ 6 枚');
    await expect(page.locator('#et-hint')).toContainText('保存フォルダ全体');
    // 切り替え直せば元の 6 枚に戻る (的の選択がその場で効く)。
    await page.locator('#et-mode-folder').check();
    await expect(page.locator('#et-line')).toHaveAttribute('data-count', '6');
  });

  test('フォルダ全体で書き出すと、開いていない図も zip に入り、結果に枚数が残る', async ({ page }) => {
    await openWithFolder(page);
    const dl = page.waitForEvent('download', { timeout: 90000 });
    await page.locator('#btn-tab-handoff').click();
    await expect(page.locator('#et-line')).toHaveAttribute('data-count', '6');
    await page.locator('#et-build').click();
    const file = await dl;
    const text = fs.readFileSync(await file.path()).toString('latin1');
    expect(text).toContain('svg/uart_state.svg');
    expect(text).toContain('svg/spi_init_sequence.svg');
    await expect(page.locator('#bulk-export-status')).toContainText('6 枚 / 保存フォルダ 6 枚');
  });

  test('キャンセルすれば何も書き出さずに閉じる', async ({ page }) => {
    await openTwoDiagrams(page);
    await page.locator('#btn-tab-handoff').click();
    await expect(page.locator('#et-modal')).toBeVisible();
    await page.locator('#et-cancel').click();
    await expect(page.locator('#et-modal')).toBeHidden();
  });
});
