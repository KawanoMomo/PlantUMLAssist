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
  // design 9a: 保存ボタンは状態を出す。未保存なら ● 保存 + Ctrl+S。
  await expect(save).toHaveAttribute('data-save-state', 'dirty');
  await expect(save).toContainText('保存');
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

// BLK-junior-20260915-2240: 部品名を統一したあと上書き保存すると出る確認が二択とも
// 同格に見え、強調はむしろ「元ファイルを保つ」側に付いていた。選び間違えると直した
// 表記が元ファイルに入らないまま、エラーも出ずに進んでしまう。
test('手順3 上書き確認は「書き換える」が既定だと分かり、1 クリックで直した表記が入る', async ({ page }) => {
  const NAME = 'SPIドライバ構成';
  const BEFORE = ['@startuml', 'title SPIドライバ構成', '[SPI_Driver] --> [IrqCtrl]', '@enduml'].join('\n');
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, NAME, BEFORE);
  await S.openFolder(page);
  await S.openFolderItem(page, NAME);
  await page.waitForTimeout(800);

  // 部品名を統一した (「要素名をまとめて付け替え」の結果と同じ本文) 状態にする。
  await S.typeDsl(page, BEFORE.replace('SPI_Driver', 'Spi_Driver').replace('IrqCtrl', 'IRQCtrl'));
  await page.waitForSelector('#source-lock-modal');

  // 到達条件その1: 既定は「書き換える」側で、印と文言でそれが分かる。
  const main = page.locator('#source-lock-overwrite');
  await expect(main).toContainText('おすすめ');
  await expect(main).toHaveAttribute('data-default', '1');
  // 到達条件その2: 「保つ」側には、元ファイルが今の表記に変わらないことが添えてある。
  await expect(page.locator('#source-lock-keep')).toContainText('変わりません');
  // 確認が出ている間も本文は打てる (焦点は奪わない)。
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id))
    .not.toBe('source-lock-overwrite');

  // 到達条件その3: 主ボタン 1 クリックで、直した表記が元ファイルに入る。
  await main.click();
  await expect(page.locator('#source-lock-modal')).toHaveCount(0);
  await page.waitForTimeout(1200);
  const saved = await S.readDoc(page, DIR, NAME);
  expect(saved).toContain('Spi_Driver');
  expect(saved).toContain('IRQCtrl');
});

// BLK-junior-20260916-0046: 指摘反映で 10 ファイルを 1 枚ずつ開いて直して保存すると、
// 保存のたびに上書き確認へ答えることになる。答えは「他のファイルも同じ扱い」で 1 回に
// 畳まれているが、1 枚ずつ開いて直す手順そのものは残る (10 枚で 20 クリック)。
// 保存フォルダをまたぐ ⇄ 一括置換なら 1 回で済むので、詰まったその場から入れる。
test('手順3 上書き確認から、同じ直しを保存フォルダの図へまとめて当てられる', async ({ page }) => {
  const NAMES = ['一括-gpio_init_sequence', '一括-spi_sequence', '一括-TIMER初期化'];
  const before = (n) => ['@startuml', 'title ' + n, 'participant SPI_Driver',
    'participant Hal', 'SPI_Driver -> Hal : Init()', '@enduml'].join('\n');

  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of NAMES) await S.putDoc(page, DIR, n, before(n));

  // 1 枚目を一覧から開いて表記を直す (junior の指摘反映の 1 枚目)。
  await S.openFolder(page);
  await S.openFolderItem(page, NAMES[0]);
  await S.typeDsl(page, before(NAMES[0]).replace(/SPI_Driver/g, 'Spi_Driver'));
  await page.waitForSelector('#source-lock-modal');

  // 到達条件その1: 二択の下に「まとめて当てる」道があり、何が省けるかが読める。
  const bulk = page.locator('#source-lock-bulk');
  await expect(bulk).toBeVisible();
  await expect(bulk).toContainText('まとめて');
  await expect(bulk).toContainText('1 枚ずつ開き直さずに済みます');

  // 到達条件その2: 1 クリックで確認は閉じ (この図は書き換える側に倒る)、
  // ⇄ 一括置換が「全図に適用」で開く。
  await bulk.click();
  await expect(page.locator('#source-lock-modal')).toHaveCount(0);
  await page.waitForSelector('#rename-panel.open', { timeout: 5000 });
  await expect(page.locator('#rename-all-docs')).toBeChecked();

  // 到達条件その3: いま直した組が欄に入っている (打ち直させない)。
  await expect(page.locator('#rename-from')).toHaveValue('SPI_Driver');
  await expect(page.locator('#rename-to')).toHaveValue('Spi_Driver');

  // 到達条件その4: そのまま適用すると、開いていない残りの図まで直る
  // (1 枚ずつ開き直さない)。
  await page.waitForTimeout(1000);
  const apply = page.locator('#btn-rename-apply');
  await expect(apply).toBeEnabled();
  await apply.click();
  await page.waitForTimeout(2500);

  for (const n of NAMES) {
    const saved = await S.readDoc(page, DIR, n);
    expect(saved, n + ' が直っていない').toContain('Spi_Driver');
    expect(saved, n + ' に旧表記が残っている').not.toMatch(/SPI_Driver/);
  }
});

test('手順3 「保つ」を選んでも、元ファイルが変わらないことが出て 1 クリックで戻せる', async ({ page }) => {
  const NAME = 'SPIドライバ構成2';
  const BEFORE = ['@startuml', 'title SPIドライバ構成2', '[SPI_Driver] --> [IrqCtrl]', '@enduml'].join('\n');
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, NAME, BEFORE);
  await S.openFolder(page);
  await S.openFolderItem(page, NAME);
  await page.waitForTimeout(800);
  await S.typeDsl(page, BEFORE.replace('SPI_Driver', 'Spi_Driver'));
  await page.waitForSelector('#source-lock-modal');

  await page.locator('#source-lock-keep').click();
  await page.waitForTimeout(1000);
  // 到達条件その1: 何が起きたかを言い切る (黙って元の表記のままにしない)。
  await expect(page.locator('#status-save-result')).toContainText('変更前のまま');
  // 到達条件その2: 元ファイルはまだ古い表記のまま (これが junior の詰まった状態)。
  expect(await S.readDoc(page, DIR, NAME)).toContain('SPI_Driver');

  // 到達条件その3: 上部の 🔒 札を 1 クリックすると、元ファイルを書き換える方に戻る。
  const lock = page.locator('#top-source-lock');
  await expect(lock).toBeVisible();
  await lock.click();
  await page.waitForTimeout(1500);
  expect(await S.readDoc(page, DIR, NAME)).toContain('Spi_Driver');
});
