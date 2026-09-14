// @ts-check
// junior 台本 手順3: GUI の設定で保存先を persona-data\junior に変更し、上書き保存する。
//
// BLK-junior-20260913-0306: 一覧を開く・覗く・書き出すはタブ列のボタンを押せるのに、
// 毎周必ず通る保存だけがボタンを持たず、Ctrl+K で「ファイルを保存」と打つ経路しか
// 無かった。保存先チップの隣に [💾 保存] を常時出す。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順3 設定で保存先を変えると、上部バーの表示がその場で追いつく', async ({ page }) => {
  await S.bootDownloadMode(page);
  // 未設定ならダウンロードになることが先に出る。
  await expect(page.locator('#top-save-target')).toHaveAttribute('data-mode', 'download');

  await page.locator('#top-save-target').click();
  await expect(page.locator('#cfg-modal')).toBeVisible();
  await page.locator('input[name="cfg-backend"][value="file"]').check();
  await page.locator('#cfg-file-dir').fill(DIR);
  await page.locator('#cfg-ok').click();
  await page.waitForTimeout(400);

  // 到達条件: 保存先が設定済みだと画面から読める。
  const chip = page.locator('#top-save-target');
  await expect(chip).toHaveAttribute('data-mode', 'file');
  await expect(chip).toHaveClass(/configured/);
  expect(await chip.getAttribute('title')).toContain(DIR);

  // 到達条件その2: 保存は上部バーのボタン 1 押しで済む (コマンド名を打たない)。
  const save = page.locator('#top-save');
  await expect(save).toBeVisible();
  await expect(save).toHaveAttribute('data-mode', 'file');
  await expect(save).toHaveText('💾 上書き保存');
  expect(await save.getAttribute('title')).toContain(DIR);

  // 到達条件その3: 押すと保存フォルダへ書かれ、どこへ書いたかが下端に出る。
  await S.clearDir(page, DIR);
  await page.locator('#editor').fill(['@startuml', 'participant Gpio_Driver',
    'Gpio_Driver -> Hal : Gpio_Init()', '@enduml'].join('\n'));
  await page.waitForTimeout(700);
  await save.click();
  await expect(page.locator('#status-save-result')).toContainText('に保存しました', { timeout: 10000 });
  const names = await S.listDir(page, DIR);
  expect(names.length).toBeGreaterThanOrEqual(1);
});

// BLK-junior-20260915-0307: 下書き spi_sequence の図名を変えて上書き保存したら、
// 新しい名前と元の下書き名が内容同一のまま 2 枚残り、資料化は古い名前を拾った。
test('手順3 図名を変えて保存すると、古い名前のファイルは残らない', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);

  // 前提: 下書き spi_sequence が保存フォルダにあり、同じ内容を開いている。
  const dsl = ['@startuml', 'title SPI初期化', 'participant Spi_Driver', 'participant Hw_Ctrl',
    'Spi_Driver -> Hw_Ctrl : Spi_Init', '@enduml'].join('\n');
  await S.putDoc(page, DIR, 'spi_sequence', dsl);
  await S.renameActive(page, 'spi_sequence');
  await S.typeDsl(page, dsl);
  await page.waitForTimeout(600);

  // 図の設定の「図名 / File name」で名前を変える (台本の図名変更)。
  await page.locator('#props-tab-settings').click();
  const nameIn = page.locator('#ds-docname');
  await nameIn.fill('SPIドライバ初期化シーケンス');
  await nameIn.dispatchEvent('change');
  await page.waitForTimeout(1500);

  // 到達条件: 保存フォルダに残るのは新しい名前だけ。
  const names = await S.listDir(page, DIR);
  expect(names).toContain('SPIドライバ初期化シーケンス');
  expect(names).not.toContain('spi_sequence');
  // 何が起きたかは画面に出る (黙って消さない)。
  await expect(page.locator('#ds-name-notice')).toContainText('spi_sequence.puml');
});
