// @ts-check
// BLK-junior-20260908-1603 「図名 = ファイル名」。
// 台本の「タイトルの末尾に (先輩反映) を付け足す」を DSL の title 行だと思って
// editor を書き換えようとした。ファイル名を決めているのはタブの図名の方で、
// 対応は画面のどこにも出ていなかった。さらに、タブのダブルクリックの prompt を
// 開いている間に自動保存が走り、前周の完了物に今回の編集が入った。
// 図の設定に「図名 / File name」が並び、そこで名前を変えられて、
// 前の名前のファイルを直前の版に戻せること。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('./helpers');

const DIR = saveDirFor(__filename);
const BASE = 'GPIOドライバ初期化 (レビュー反映)';
const V1 = ['@startuml', 'title GPIOドライバ初期化アクティビティ', 'start', ':Gpio_Init;', 'stop', '@enduml'].join('\n');
const V2 = V1.replace(':Gpio_Init;', ':Gpio_Init;\n:Gpio_SetPin;');

async function setup(page) {
  await gotoApp(page);
  await page.evaluate(([dir, name]) => {
    window.MA.autoSave.setConfig({
      enabled: true, debounceMs: 300, restoreMode: 'none',
      backend: 'file', fileDir: dir,
    });
    window.MA.workspace.rename(window.MA.workspace.getActiveId(), name);
  }, [DIR, BASE]);
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await page.waitForTimeout(400);
}

async function setDsl(page, text) {
  await page.locator('#editor').fill(text);
  await page.waitForTimeout(900);
}

async function openSettings(page) {
  await page.locator('#props-tab-settings').click();
  await page.waitForTimeout(300);
}

test('図の設定に図名が並び、保存されるファイル名をその場で言う', async ({ page }) => {
  await setup(page);
  await setDsl(page, V1);
  await openSettings(page);

  await expect(page.locator('#ds-docname')).toHaveValue(BASE);
  const hint = page.locator('#ds-name-hint');
  await expect(hint).toContainText(BASE + '.puml');
  // title 行と役割が混ざらないよう、その場で言い分ける
  await expect(hint).toContainText('Title は図の中の見出し');
  // Title の欄は DSL の title 行のままで、ファイル名ではない
  await expect(page.locator('#ds-title')).toHaveValue('GPIOドライバ初期化アクティビティ');
});

test('図名をここで変えると、タブ名と以降の保存先が変わる', async ({ page }) => {
  await setup(page);
  await setDsl(page, V1);
  await openSettings(page);

  await page.locator('#ds-docname').fill('GPIOドライバ初期化 (先輩反映)');
  await page.locator('#ds-docname').dispatchEvent('change');
  await page.waitForTimeout(600);

  await expect(page.locator('#tab-bar .tab-label').first()).toHaveText('GPIOドライバ初期化 (先輩反映)');
  await expect(page.locator('#ds-name-hint')).toContainText('GPIOドライバ初期化 (先輩反映).puml');
});

test('前の名前のファイルに入った今回の編集を、直前の版に戻せる', async ({ page }) => {
  await setup(page);
  // 1 周目の完了物として保存する
  await setDsl(page, V1);
  await page.locator('#btn-save').dispatchEvent('click');
  await page.waitForTimeout(800);
  // 続けて編集すると、名前を変える前に自動保存が前の名前のファイルへ書く
  await setDsl(page, V2);
  await page.locator('#btn-save').dispatchEvent('click');
  await page.waitForTimeout(800);

  await openSettings(page);
  await page.locator('#ds-docname').fill('GPIOドライバ初期化 (先輩反映)');
  await page.locator('#ds-docname').dispatchEvent('change');
  await page.waitForTimeout(400);

  const notice = page.locator('#ds-name-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(BASE + '.puml');
  await page.locator('#btn-ds-name-restore').click();
  await expect(page.locator('#ds-name-notice-text')).toContainText('直前の版に戻しました');

  // 保存フォルダの前の名前のファイルが、1 周目の内容に戻っている
  const back = await page.evaluate(([dir, name]) => {
    return window.MA.workspace.loadFile(name, dir).then((t) => t || '');
  }, [DIR, BASE]);
  expect(back).toContain('Gpio_Init');
  expect(back).not.toContain('Gpio_SetPin');
});

test('手数: 図の設定を開いて名前の末尾に (先輩反映) を足すまで', async ({ page }) => {
  await setup(page);
  await setDsl(page, V1);

  let clicks = 0;
  let keys = 0;
  const click = async (sel) => { clicks++; await page.locator(sel).click(); };

  await click('#props-tab-settings');
  await page.waitForTimeout(300);
  await click('#ds-docname');
  // 末尾にキャレットを置いて付け足す (打つのは付け足す分だけ)
  await page.keyboard.press('End');
  keys++;
  const add = ' (先輩反映)';
  await page.keyboard.type(add);
  keys += add.length;
  await page.keyboard.press('Enter');
  keys++;
  await page.waitForTimeout(500);

  await expect(page.locator('#ds-docname'))
    .toHaveValue('GPIOドライバ初期化 (レビュー反映) (先輩反映)');
  expect(clicks).toBeLessThanOrEqual(10);
  expect(keys).toBeLessThanOrEqual(50);
  console.log('BLK-junior-20260908-1603 手数: クリック ' + clicks + ' / キー入力 ' + keys);
});
