// @ts-check
// BLK-junior-20260908-1103-wish の画面写真。参照ペインの「🔀 対応表」で
// 先輩だけにある状態・遷移が橙で並び、そこに「＋この図にも足す」が付いて、
// 端点の対応が付かない遷移では行き先の聞き返しが出ているところを撮る。
const { test } = require('@playwright/test');
const { gotoApp, shotOut, saveDirFor } = require('./helpers');

const OUT = shotOut('shot-blk-junior-1103-wish.png');
// 自動保存の書き込み先をこの spec 専用にする (既定だと autosave/ に図が残る)。
const DIR = saveDirFor(__filename);

const SENIOR = [
  '@startuml',
  '[*] --> Idle',
  'state Idle',
  'state Ready',
  'state Configured',
  'Idle --> Ready : init',
  'Idle --> Configured : configure',
  '@enduml',
].join('\n');

const MINE = [
  '@startuml',
  '[*] --> Idle',
  'state Idle',
  'state Ready_State',
  'Idle --> Ready_State : init',
  '@enduml',
].join('\n');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(1200);
}

test('shot: 対応表の橙の行から自分の図に足す', async ({ page }) => {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page);
  await typeDsl(page, SENIOR);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(600);
  await typeDsl(page, MINE);
  await page.locator('#btn-tab-compare').click();
  await page.locator('#btn-map-run').click();
  await page.waitForSelector('#map-list .map-row');

  // 変更前の master にはボタンが無い。あるときだけ聞き返しまで開いて撮る。
  const take = page.locator('.map-row[data-map-match="ref-only"][data-map-type="transition"] .map-take');
  if (await take.count() > 0) {
    await take.first().click();
    await page.waitForTimeout(300);
  }
  await page.locator('#compare-pane').screenshot({ path: OUT });
});
