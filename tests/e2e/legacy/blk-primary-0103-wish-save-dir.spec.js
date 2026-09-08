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

async function openXref(page) {
  const open = await page.evaluate(() => {
    var el = document.getElementById('xref-panel');
    return !!(el && el.classList.contains('open'));
  });
  if (open) await page.locator('#btn-tab-xref').click();
  await page.locator('#btn-tab-xref').click();
  await page.waitForTimeout(400);
}

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

  test('渡す側: 書き出す文面に保存先ディレクトリが載る', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SPI);
    await setSaveDir(page, 'E:\\01_Loop\\persona-data\\primary');

    await openXref(page);
    const dl = page.waitForEvent('download');
    await page.locator('#btn-xref-export').click();
    const md = require('fs').readFileSync(await (await dl).path(), 'utf8');
    expect(md).toContain('## 保存先ディレクトリ');
    // 往復で壊れないスラッシュ区切りで載る。
    expect(md).toContain('E:/01_Loop/persona-data/primary');
  });

  test('受け取る側: 「保存先を貼る」に貼って反映すると設定が変わる', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SPI);
    await openXref(page);

    // 受け取った側の初期状態 (保存先フォルダ未設定)。保存先は server にも
    // 引き継がれるので、localStorage を消すだけでは戻らない。
    await resetSaveDir(page);
    await expect(page.locator('#xref-dir-box')).toBeHidden();
    await page.locator('#btn-xref-dir').click();
    await expect(page.locator('#xref-dir-box')).toBeVisible();
    // 今が未設定であることが読める。
    await expect(page.locator('#xref-dir-now')).toContainText('未設定');

    // 渡された xref.md をそのまま貼る。
    await page.locator('#xref-dir-input').fill([
      '# 参照関係 (14 枚)', '',
      '## 保存先ディレクトリ', '',
      '- 保存先ディレクトリ: `E:/01_Loop/persona-data/primary`', '',
      '## 図', '- spi (sequence)',
    ].join('\n'));
    await page.locator('#btn-xref-dir-apply').click();
    await page.waitForTimeout(300);

    expect(await getSaveDir(page)).toBe('file|E:/01_Loop/persona-data/primary');
    await expect(page.locator('#xref-dir-msg')).not.toHaveClass('ng');
    await expect(page.locator('#xref-dir-msg')).toContainText('E:/01_Loop/persona-data/primary');
    // ⚙設定の入力欄も追随する (次に開いたとき古い値が出ない)。
    await expect(page.locator('#cfg-file-dir')).toHaveValue('E:/01_Loop/persona-data/primary');
  });

  test('受け取る側: バックスラッシュ区切りを貼っても直して反映する', async ({ page }) => {
    await gotoApp(page);
    await resetSaveDir(page);
    await openXref(page);
    await page.locator('#btn-xref-dir').click();
    await page.locator('#xref-dir-input').fill('E:\\01_Loop\\persona-data\\primary');
    await page.locator('#btn-xref-dir-apply').click();
    await page.waitForTimeout(300);

    expect(await getSaveDir(page)).toBe('file|E:/01_Loop/persona-data/primary');
    await expect(page.locator('#xref-dir-msg')).toContainText('スラッシュ');
  });

  test('受け取る側: 壊れた値は反映せず、理由を出す (無言で空にしない)', async ({ page }) => {
    await gotoApp(page);
    await resetSaveDir(page);
    await openXref(page);
    await page.locator('#btn-xref-dir').click();
    // BLK-primary-20260908-0103 の実際の壊れ値。
    await page.locator('#xref-dir-input').fill('E:\u0001_Looppersona-dataprimary');
    await page.locator('#btn-xref-dir-apply').click();
    await page.waitForTimeout(300);

    // 設定は変わらない。
    expect(await getSaveDir(page)).not.toContain('_Looppersona');
    await expect(page.locator('#xref-dir-msg')).toHaveClass('ng');
    await expect(page.locator('#xref-dir-msg')).toContainText('バックスラッシュ');
  });

  test('「やめる」で閉じ、参照関係パネルを閉じると貼り付け欄も畳まれる', async ({ page }) => {
    await gotoApp(page);
    await resetSaveDir(page);
    await openXref(page);
    await page.locator('#btn-xref-dir').click();
    await expect(page.locator('#xref-dir-box')).toBeVisible();
    await page.locator('#btn-xref-dir-cancel').click();
    await expect(page.locator('#xref-dir-box')).toBeHidden();

    await page.locator('#btn-xref-dir').click();
    await expect(page.locator('#xref-dir-box')).toBeVisible();
    await page.locator('#btn-xref-close').click();
    await expect(page.locator('#xref-dir-box')).toBeHidden();
  });
});
