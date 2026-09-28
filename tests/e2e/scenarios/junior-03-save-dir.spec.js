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
  // BLK-builder-20260924-2152-2-red: 前に控えていたフォルダに新規タブと同名の diagram1 が残っていても、
  // 保存先を変えたら FILES の部品フォルダとパンくずは新しいフォルダの中身で出る (前のフォルダの
  // DIAGRAM1 の段が残らない)。前のフォルダは test-results 配下に作る。
  const PREV = DIR + '-prev';
  await S.bootDownloadMode(page, PREV);
  await S.clearDir(page, DIR);
  await S.clearDir(page, PREV);
  await S.putDoc(page, PREV, 'diagram1', ['@startuml', 'participant A', 'A -> B : x', '@enduml'].join('\n'));
  await page.reload();
  await page.waitForSelector('html[data-app-ready="1"]', { state: 'attached' });
  await expect(page.locator('#folder-panel .folder-item[data-file-name="diagram1"]')).toHaveCount(1);
  await expect(page.locator('#files-parts .files-part-head', { hasText: 'DIAGRAM1' })).toHaveCount(1);
  // 未設定ならダウンロードになることが先に出る。
  await expect(page.locator('#top-save-target')).toHaveAttribute('data-mode', 'download');
  // 保存先の無い新規の図は、上部バーにフォルダの段を出さない (ファイル名だけ)。
  await expect(page.locator('#top-crumbs .top-crumb')).toHaveCount(0);

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
  // design 10a (BLK-builder-20260924-1715-1): 上部バー左のパンくずにも保存先のフォルダ名が出る。
  await expect(page.locator('#top-crumbs .top-crumb')).toHaveText([DIR.replace(/[\\/]+$/, '').split(/[\\/]/).pop()]);
  await expect(page.locator('#folder-panel .folder-item[data-file-name="diagram1"]')).toHaveCount(0);
  await expect(page.locator('#files-parts .files-part-head', { hasText: 'DIAGRAM1' })).toHaveCount(0);

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

// BLK-junior-20260925-1732-friction: 図の設定のタイトル欄を変えた直後にタブ名をダブルクリックで変えて Ctrl+S すると、
// タイトルを入れた自動保存が前の名前 (dma_usecase) で後から書かれ、新しい名前と同じ中身の dma_usecase.puml が残った。
test('手順3 タイトル欄を変えてからすぐタブ名を変えて保存しても、古い名前のファイルは残らない', async ({ page }) => {
  const NEW = 'DMAドライバ利用ユースケース図';
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  const dsl = ['@startuml', 'left to right direction', 'actor App', 'usecase "DMA転送開始" as UC1',
    'App --> UC1', '@enduml'].join('\n');
  await S.putDoc(page, DIR, 'dma_usecase', dsl);
  await S.renameActive(page, 'dma_usecase');
  await S.typeDsl(page, dsl);
  await page.waitForTimeout(600);
  // タイトル欄の自動保存がまだ待っている間にタブ名を変える (1 秒の既定の debounce を長くして必ずその間に入れる)。
  await page.evaluate(() => window.MA.autoSave.setConfig({ debounceMs: 5000 }));

  await page.locator('#props-tab-settings').click();
  await page.locator('#ds-title').click();
  await page.keyboard.type(NEW);
  await page.keyboard.press('Tab');
  page.once('dialog', (d) => d.accept(NEW));
  await page.locator('#tab-bar .tab.active').first().dblclick();
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await expect(page.locator('#status-save-result')).toContainText('に保存しました', { timeout: 10000 });
  // 待っていた保存の debounce (5 秒) より長く待ってから見る。
  await page.waitForTimeout(6000);

  const names = await S.listDir(page, DIR);
  expect(names).toContain(NEW);
  expect(names).not.toContain('dma_usecase');
  expect(await S.readDoc(page, DIR, NEW)).toContain('title ' + NEW);
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

  // 到達条件その3: 上部の「元ファイル保護」の札を 1 クリックすると、元ファイルを書き換える方に戻る。
  const lock = page.locator('#top-source-lock');
  await expect(lock).toBeVisible();
  await lock.click();
  await page.waitForTimeout(1500);
  expect(await S.readDoc(page, DIR, NAME)).toContain('Spi_Driver');
});

// BLK-builder-20260923-1849-1 (design 10a): FILES ツリーの節は「開いている図・保存先 = 開く、
// 読むだけ・GIT = 畳む」で出る。保存先の一覧は起動した時点で見えていて、押さずに図を選べる。
// 読むだけは畳んでいても件数と入口 (👀 / ⇔) が見出しの行に残る。
test('手順3 起動すると保存先の一覧が開いていて、読むだけ・GIT は畳まれている', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'J03_tree_state', S.GPIO_STATE);
  await S.reopenApp(page);

  // 保存先: 押さずに開いている (見出しの ▾ と一覧の行)。
  await expect(page.locator('#folder-panel')).toHaveClass(/\bopen\b/);
  await expect(page.locator('#btn-tab-folder')).toHaveAttribute('aria-expanded', 'true');
  // BLK-owner-20260924-0637-1: 保存先節の中はツリー (部品のフォルダ → ファイルの行) だけ。旧 📂 一覧は節に出さない。
  await expect(page.locator('#files-parts .files-part-head[data-part="j03"]')).toBeVisible();
  await expect(page.locator('#folder-panel .folder-item[data-file-name="J03_tree_state"]')).toHaveCount(1);
  await expect(page.locator('#folder-panel')).toBeHidden();
  // 起動時に開いても、カーソルは絞り込み欄へ飛ばない (エディタに打った文字が吸われない)。
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).not.toBe('folder-filter');

  // 読むだけ・GIT: 畳んでいる。
  await expect(page.locator('#files-sec-readonly')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#files-body-readonly')).toBeHidden();
  await expect(page.locator('#files-sec-git')).toHaveAttribute('aria-expanded', 'false');
  // 畳んでいても入口は押せる位置にある。
  await expect(page.locator('#btn-tab-peek')).toBeVisible();
  await expect(page.locator('#btn-tab-senior')).toBeVisible();
  // 見出しを実マウスで押すと開閉する。
  await page.locator('#files-sec-readonly').click();
  await expect(page.locator('#files-body-readonly')).toBeVisible();
  await page.locator('#files-sec-readonly').click();
  await expect(page.locator('#files-body-readonly')).toBeHidden();

  // 保存先の見出しを押して畳むと、次に開いたときも畳んだまま (開閉は覚える)。
  await page.locator('#btn-tab-folder').click();
  await expect(page.locator('#folder-panel')).not.toHaveClass(/\bopen\b/);
  await S.reopenApp(page);
  await page.waitForTimeout(500);
  await expect(page.locator('#folder-panel')).not.toHaveClass(/\bopen\b/);
  await expect(page.locator('#btn-tab-folder')).toHaveAttribute('aria-expanded', 'false');
});

// BLK-builder-20260924-1741-2 (design 9a / 10a): 未保存の印はタブ・上部バーの保存ボタン・FILES ツリーの行で
// 同じ判定・同じ時に出る。以前はタブにだけ ● が出て、ツリーには出ず、上部バーは「保存済み」のままだった。
// 保存先から開いた図は、最初に書き戻す前に「上書きしますか」と聞く。答えるまでは未保存のまま。
test('手順3 保存先の図を直すとタブ・上部バー・FILES ツリーに同時に未保存の印が出て、書き換えると揃って消える', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'spi_state', ['@startuml', '[*] --> Idle', '@enduml'].join('\n'));
  // 保存先を読み直して、置いた図がツリーに並んだ状態にする。
  await S.openFolder(page);
  await S.closeFolderList(page);
  const partHead = page.locator('#files-parts .files-part-head[data-part="spi"], #files-parts .files-part-head[data-part="SPI"]').first();
  await expect(partHead).toBeVisible({ timeout: 10000 });
  if ((await partHead.getAttribute('aria-expanded')) !== 'true') await partHead.click();
  const fileRow = page.locator('#files-parts .files-part-file[data-file-name="spi_state"]');
  await fileRow.click();
  await expect(page.locator('#editor')).toHaveValue(/Idle/);

  const save = page.locator('#top-save');
  const tabDot = page.locator('#tab-bar .tab.active .tab-dot');
  const openMark = page.locator('#files-panel .files-row.is-active .files-row-mark');
  const fileMark = fileRow.locator('.files-row-mark');
  await expect(save).toHaveAttribute('data-save-state', 'saved');
  await expect(tabDot).toHaveCount(0);
  await expect(openMark).toHaveCount(0);
  await expect(fileMark).toHaveCount(0);

  // 直す (実キー入力)。@enduml の行の頭に 1 行足す (@enduml より後ろの行は図の中身に入らない)。
  await page.locator('#editor').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Home');
  await page.keyboard.type('Idle --> Run\n');
  await expect(page.locator('#source-lock-modal')).toBeVisible({ timeout: 10000 });
  await expect(tabDot).toHaveText('●');
  await expect(save).toHaveAttribute('data-save-state', 'dirty');
  await expect(save).toContainText('● 保存');
  await expect(openMark).toHaveText('●');
  await expect(fileMark).toHaveText('●');

  // 「このファイルを書き換える」で書くと、3 か所の印が揃って消える。
  await page.locator('#source-lock-overwrite').click();
  await expect(save).toHaveAttribute('data-save-state', 'saved', { timeout: 10000 });
  await expect(save).toHaveText('保存済み');
  await expect(tabDot).toHaveCount(0);
  await expect(openMark).toHaveCount(0);
  await expect(fileMark).toHaveCount(0);
  expect(await S.readDoc(page, DIR, 'spi_state')).toContain('Idle --> Run');
});
