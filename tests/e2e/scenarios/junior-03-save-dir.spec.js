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
  // 図の設定の図名欄も新しい名前になる (前の名前のまま残らない)
  await expect(page.locator('#ds-docname')).toHaveValue(NEW);
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

// TICKET-owner-20261115-1829-prune: 部品名を統一したあと、保存先の図は「開いたファイルを上書きしますか」の
// 窓を出さず、ほかの図と同じく自動保存でそのファイルに書く (選び間違えて直した表記が入らない道を無くした)。
// `{名前}-編集中` の控えも作らない。
test('手順3 保存先から開いた図を直すと、窓を出さずにそのファイルへ直した表記が入る', async ({ page }) => {
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

  await expect.poll(async () => (await S.readDoc(page, DIR, NAME)) || '', { timeout: 10000 }).toContain('Spi_Driver');
  const saved = await S.readDoc(page, DIR, NAME);
  expect(saved).toContain('IRQCtrl');
  await expect(page.locator('#source-lock-modal')).toHaveCount(0);
  await expect(page.locator('#top-source-lock')).toHaveCount(0);
  expect(await S.listDir(page, DIR)).toEqual([NAME]);
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
// 保存先から開いた図も、ほかの図と同じく自動保存が書くまでは未保存のまま。
test('手順3 保存先の図を直すとタブ・上部バー・FILES ツリーに同時に未保存の印が出て、書き込むと揃って消える', async ({ page }) => {
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
  await expect(tabDot).toHaveText('●');
  await expect(save).toHaveAttribute('data-save-state', 'dirty');
  await expect(save).toContainText('● 保存');
  await expect(openMark).toHaveText('●');
  await expect(fileMark).toHaveText('●');

  // 自動保存がそのファイルへ書くと (窓は出ない)、3 か所の印が揃って消える。
  await expect(save).toHaveAttribute('data-save-state', 'saved', { timeout: 10000 });
  await expect(save).toHaveText('保存済み');
  await expect(tabDot).toHaveCount(0);
  await expect(openMark).toHaveCount(0);
  await expect(fileMark).toHaveCount(0);
  expect(await S.readDoc(page, DIR, 'spi_state')).toContain('Idle --> Run');
});

// BLK-owner-20260930-0311-1: ＋ で開いたシーケンス図に「参加者」で actor を先に 1 人足し、続けて participant を足すと、
// 本文の図種の読みが (ユースケース → シーケンスへ) 替わったとして、タブ名が黙って `{名前}_sequence` に替わり、
// 保存フォルダに actor 1 行だけの `{名前}.puml` が残った。タブの名前と書き先は読みが替わっても変えない。
test('手順3 actor を先に足してから participant を足しても、保存フォルダの図は 1 枚でタブ名は変わらない', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await page.locator('#rail .rail-btn[data-type="plantuml-sequence"]').click();
  await page.locator('#btn-tab-new').click();
  const name = await page.evaluate(() => window.MA.workspace.getActive().name);
  const add = async (ptype, alias) => {
    await page.locator('#seq-tail-kind-chip-participant').click();
    await page.locator('#seq-tail-ptype').selectOption(ptype);
    await page.locator('#seq-tail-alias').fill(alias);
    await page.locator('#seq-tail-alias').press('Enter');
  };
  await add('actor', 'P4');
  await expect.poll(async () => (await S.readDoc(page, DIR, name)) || '').toContain('actor P4');
  await add('participant', 'Q4');
  await expect.poll(async () => (await S.readDoc(page, DIR, name)) || '').toContain('participant Q4');
  await page.waitForTimeout(800);   // 回される書き込みがあれば、ここまでに届く

  // 到達条件: タブ名はそのまま、保存フォルダの図は 1 枚 (actor 1 行だけのファイルも `_sequence` も無い)。
  expect(await page.evaluate(() => window.MA.workspace.getActive().name)).toBe(name);
  await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-doc-name', name);
  expect(await S.listDir(page, DIR)).toEqual([name]);
  const saved = await S.readDoc(page, DIR, name);
  expect(saved).toContain('actor P4');
  expect(saved).toContain('participant Q4');
});

// BLK-human-20261006-2020-1 / BLK-owner-20261006-2021-1: Ctrl+S で書けたら、タブ・上部バー・FILES の行の未保存の印が
// その時に消え、保存ボタンの隣に時刻と書いた先が出る。以前は自動の書き戻しを見送る見本のままのタブと、
// ダウンロード保存では、ファイルが書けても ○ / ● が残り、保存されたかが画面から読めなかった。
test('手順3 Ctrl+S で保存すると未保存の印が消え、時刻と保存先が出る (見本のままのタブ・1 字直した後)', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  const save = page.locator('#top-save');
  const tabDot = page.locator('#tab-bar .tab.active .tab-dot');
  const openMark = page.locator('#files-panel .files-row.is-active .files-row-mark');
  const flash = page.locator('#top-save-flash');
  const name = await page.evaluate(() => window.MA.workspace.getActive().name);
  // 起動直後の見本のまま: 印は ○ (まだ保存していない)。
  await expect(tabDot).toHaveText('○');
  await expect(save).toHaveAttribute('data-save-state', 'dirty');

  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await expect(save).toHaveAttribute('data-save-state', 'saved', { timeout: 10000 });
  await expect(tabDot).toHaveCount(0);
  await expect(openMark).toHaveCount(0);
  await expect(flash).toBeVisible();
  await expect(flash).toContainText(name + '.puml に保存');
  await expect(flash).toHaveText(/\d\d:\d\d:\d\d/);
  // 下端の札も書けた回を言う (「見本のまま · 書いていません」を書いた後に残さない)。
  await expect(page.locator('#status-autosave')).not.toContainText('見本のまま');
  await expect(page.locator('#status-autosave')).toContainText(name + '.puml');
  expect(await S.readDoc(page, DIR, name)).not.toBeNull();
});

test('手順3 保存先が未設定 (ダウンロード) でも、1 字直すと印が付き Ctrl+S で消える', async ({ page }) => {
  await S.bootDownloadMode(page, DIR + '-dl');
  const save = page.locator('#top-save');
  const tabDot = page.locator('#tab-bar .tab.active .tab-dot');
  const openMark = page.locator('#files-panel .files-row.is-active .files-row-mark');
  const flash = page.locator('#top-save-flash');
  await page.locator('#editor').click();
  let dl = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  await dl;
  await expect(save).toHaveAttribute('data-save-state', 'saved', { timeout: 10000 });
  await expect(tabDot).toHaveCount(0);

  // 1 字直す (実キー入力) → 3 か所に ● が付く。
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Home');
  await page.keyboard.type("'\n");
  await expect(tabDot).toHaveText('●');
  await expect(save).toHaveAttribute('data-save-state', 'dirty');
  await expect(openMark).toHaveText('●');

  dl = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  await dl;
  await expect(save).toHaveAttribute('data-save-state', 'saved', { timeout: 10000 });
  await expect(tabDot).toHaveCount(0);
  await expect(openMark).toHaveCount(0);
  await expect(flash).toContainText('.puml をダウンロード');
});
