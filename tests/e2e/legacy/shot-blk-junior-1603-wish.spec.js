const { test } = require('@playwright/test');
const { gotoApp, saveDirFor, shotOut } = require('../helpers');

// BLK-junior-20260908-1603-wish の画面写真。継承元を登録した図で ⇡継承元 を開き、
// 「継承元が更新されています (差分 N 行)」と増えた行が出ているところを撮る。
const DIR = saveDirFor(__filename);
const REF_DIR = DIR + '/primary';
const CHILD = 'GPIOドライバ初期化アクティビティ_先輩反映';
const PARENT = 'GPIOドライバ初期化アクティビティ_primary';

const PARENT_V1 = '@startuml\ntitle GPIOドライバ初期化アクティビティ\nstart\n:ポート設定を読む;\n:GPIO を初期化;\nstop\n@enduml';
const PARENT_V2 = '@startuml\ntitle GPIOドライバ初期化アクティビティ\nstart\n:ポート設定を読む;\n:クロックを有効化;\n:GPIO を初期化;\nstop\n@enduml';
const CHILD_DSL = '@startuml\ntitle GPIOドライバ初期化アクティビティ\nstart\n:ポート設定を読む;\n:GPIO を初期化;\n:自分のメモを足した;\nstop\n@enduml';

async function put(page, dir, name, dsl) {
  await page.evaluate((a) => fetch('/autosave', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
  }).then((r) => r.ok), { name, dsl, dir });
}

test('shot: 継承元が更新されていることを差分の行数で言う', async ({ page }) => {
  test.setTimeout(120000);
  await gotoApp(page);
  await page.evaluate(() => window.MA.lineage.reset());
  await page.evaluate((a) => {
    window.MA.autoSave.setConfig({
      enabled: true, debounceMs: 500, restoreMode: 'none', backend: 'file', fileDir: a.dir,
    });
    window.MA.workspace.rename(window.MA.workspace.getActiveId(), a.name);
  }, { dir: DIR, name: CHILD });
  await page.locator('#editor').fill(CHILD_DSL);
  await page.waitForTimeout(700);

  await put(page, REF_DIR, PARENT, PARENT_V1);
  await page.locator('#btn-tab-lineage').click();
  await page.locator('#lg-dir').fill(REF_DIR);
  await page.locator('#lg-dir').dispatchEvent('change');
  await page.waitForTimeout(400);
  await page.locator('#lg-parent').selectOption(PARENT);
  await page.locator('#lg-set').click();
  await page.waitForTimeout(400);
  await page.locator('#lg-close').click();

  // 先輩が 1 行足す → 開いた時点で更新が出る
  await put(page, REF_DIR, PARENT, PARENT_V2);
  await page.locator('#btn-tab-lineage').click();
  await page.waitForSelector('#lg-diff');
  await page.waitForTimeout(300);
  await page.locator('#lg-modal-content').screenshot({ path: shotOut('shot-blk-junior-1603-wish.png') });
});
