// @ts-check
// BLK-primary-20260908-0103-wish 「保存先設定つきで 1 プロジェクトを渡す」。
// 参照関係を渡せても保存先ディレクトリの値は各自の ⚙設定に閉じており、
// 受け取った側は自分でパスを打ち直す (書式を誤ると一覧が無言で空になる)。
// 書き出しに保存先を載せ、受け取った側は貼るだけで反映できるようにする。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const SPI = [
  '@startuml', 'participant Spi_Driver', 'participant DmaCtrl',
  'Spi_Driver -> DmaCtrl : Spi_TransmitDma', '@enduml',
].join('\n');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(700);
}

// 書き出し側は TICKET-owner-20261115-2140-prune で、渡された文面を貼る受け口は
// TICKET-owner-20261116-0621-prune で外した。残すのは、保存先の欄にパスを打つ (貼る) と
// 直せる崩れは直して反映し、直せない崩れは断ること。

// 保存先を変える所。パンくずのフォルダ名 (FILES の保存先の一番上) を押すと ⚙設定が開く。
async function openSaveDirSetting(page) {
  const target = page.locator('#top-save-target');
  if (!(await target.isVisible())) await page.locator('#btn-tab-folder').click();
  await target.click();
  await expect(page.locator('#cfg-modal')).toBeVisible();
  await page.locator('#cfg-backend-cards input[value="file"]').check();
  await expect(page.locator('#cfg-file-dir')).toBeVisible();
}

// 保存先の値。持ち主の居る persona-data を指さないよう、test-results の下の相対パスにする。
const DIR = 'test-results/xref-handoff';

async function setSaveDir(page, dir) {
  await page.evaluate((d) => {
    window.MA.autoSave.setConfig({ backend: 'file', fileDir: d });
  }, dir);
  await page.waitForTimeout(200);
}

// 受け取った側の初期状態に戻す。保存先は server にも引き継がれるので、
// localStorage を消すだけでは前のテストの値が残る。
async function resetSaveDir(page) {
  await page.evaluate(() => {
    window.MA.autoSave.setConfig({ backend: 'localStorage', fileDir: './autosave' });
  });
  await page.waitForTimeout(200);
}

async function getSaveDir(page) {
  return page.evaluate(() => {
    var c = window.MA.autoSave.getConfig();
    return c.backend + '|' + c.fileDir;
  });
}

test.describe('BLK-primary-20260908-0103-wish 保存先つきの引き継ぎ', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
  });
  test.afterEach(async ({ page }) => {
    await resetSaveDir(page).catch(() => {});
  });

  test('保存先の欄にパスを貼って「設定を保存」すると、その値に替わる', async ({ page }) => {
    await gotoApp(page);
    await resetSaveDir(page);
    await openSaveDirSetting(page);
    // 実際の貼り付け (Ctrl+V)。パス 1 行はそのまま入る。
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate((t) => navigator.clipboard.writeText(t), DIR);
    await page.locator('#cfg-file-dir').fill('');
    await page.locator('#cfg-file-dir').click();
    await page.keyboard.press('Control+v');
    await expect(page.locator('#cfg-file-dir')).toHaveValue(DIR);
    await page.locator('#cfg-ok').click();
    await expect(page.locator('#cfg-modal')).toBeHidden();
    expect(await getSaveDir(page)).toBe('file|' + DIR);
  });

  test('受け取る側: バックスラッシュ区切りを貼っても直して反映する', async ({ page }) => {
    await gotoApp(page);
    await resetSaveDir(page);
    await openSaveDirSetting(page);
    await page.locator('#cfg-file-dir').fill('.\\test-results\\xref-handoff');
    await page.locator('#cfg-ok').click();
    await expect(page.locator('#cfg-modal')).toBeHidden();
    expect(await getSaveDir(page)).toBe('file|./' + DIR);
  });

  test('受け取る側: 壊れた値は反映せず、理由を出す (無言で空にしない)', async ({ page }) => {
    await gotoApp(page);
    await resetSaveDir(page);
    await openSaveDirSetting(page);
    // BLK-primary-20260908-0103 の実際の壊れ値。
    await page.locator('#cfg-file-dir').fill('E:\u0001_Looppersona-dataprimary');
    await page.locator('#cfg-ok').click();
    await page.waitForTimeout(300);

    // 設定は変わらず、モーダルも閉じない。
    expect(await getSaveDir(page)).not.toContain('_Looppersona');
    await expect(page.locator('#cfg-modal')).toBeVisible();
    await expect(page.locator('#cfg-file-dir-msg')).toContainText('⚠');
  });

  test('畳んだ 参照関係の「保存先を貼る」の欄は残っていない', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#xref-dir-box')).toHaveCount(0);
    await expect(page.locator('#btn-xref-dir')).toHaveCount(0);
  });
});
