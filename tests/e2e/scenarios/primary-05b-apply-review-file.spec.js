// @ts-check
// primary 台本 手順5.5: persona-data\reviewer\指摘.md を読み、そこにある指摘を全部反映する。
// 参加者名だけの変更は「⇄一括置換」の #rename-all-docs を外して対象図だけに絞る。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順5.5 参加者名だけの指摘は、対象図だけに絞って反映できる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // 指摘: can_state の Can_Driver だけを Can_Ctrl に改める(can_init_sequence は触らない)。
  await S.putDoc(page, DIR, 'can_state', S.docFor('can_state'));
  await S.putDoc(page, DIR, 'can_init_sequence', S.docFor('can_init_sequence'));
  await S.openFolderItem(page, 'can_init_sequence');
  expect(await page.locator('#editor').inputValue()).toContain('participant Can_Driver');

  // BLK-primary-20260909-0403 で入った「開いたファイルを書き換えるか」の問いに、
  // 指摘を直す目的で開いた側の答え (書き換える) を先に返す。答える前に他の操作へ
  // 進むと、この問いが操作を受け取ってしまう。
  const lock = page.locator('#source-lock-modal');
  if (await lock.isVisible().catch(() => false)) {
    await page.locator('#source-lock-overwrite').click();
    await page.waitForTimeout(800);
  }

  await S.runCommand(page, '一括置換');
  const allDocs = page.locator('#rename-all-docs');
  if (await allDocs.isChecked()) await allDocs.uncheck();
  await page.locator('#rename-from').fill('Can_Driver');
  await page.locator('#rename-to').fill('Can_Ctrl');
  await page.waitForTimeout(1200);

  // 到達条件その1: 影響の一覧が、対象の図だけを件数つきで挙げる。
  const listed = (await page.locator('#rename-folder').textContent()) || '';
  expect(listed).toMatch(/can_init_sequence(開いている)?\s*3\s*件/);

  // 到達条件その2: 絞ったうえで適用でき、開いている図が新しい名前になる。
  await expect(page.locator('#btn-rename-apply')).toBeEnabled();
  await page.locator('#btn-rename-apply').click();
  await page.waitForTimeout(1500);
  expect(await page.locator('#editor').inputValue()).toContain('Can_Ctrl');

  // 到達条件その3: 絞ったので、触っていない図は元のまま残る。
  expect(await S.readDoc(page, DIR, 'can_state')).not.toContain('Can_Ctrl');
});

// BLK-primary-20260913-0206: 同じ手順5.5 の一括置換の後始末が、開いているタブを
// 丸ごと保存フォルダへ書き戻していた。見比べのために開いて「元のまま保つ」と答えた
// ファイルまで、タブの編集途中の本文で潰される。primary から見ると「打ち直して保存した
// 内容が別の図のファイルに入っている」= 内容シャッフルとして現れる。
// 置換が当たった図だけを書き、錠の答えはここでも効く、を到達条件にする。
const LOCK_DIR = DIR + '-lock';

test('手順5.5 「元のまま保つ」と答えた図は、一括置換の後始末でも書き換わらない', async ({ page }) => {
  await S.bootWithSaveDir(page, LOCK_DIR);
  await S.clearDir(page, LOCK_DIR);
  await S.putDoc(page, LOCK_DIR, 'driver_common_class', S.docFor('driver_common_class'));
  await S.putDoc(page, LOCK_DIR, 'can_init_sequence', S.docFor('can_init_sequence'));
  await page.reload();
  await page.waitForSelector('#editor');
  await page.waitForTimeout(600);

  // 見比べ目的で開き、手を入れたうえで「元ファイルは元のまま保つ」を選ぶ。
  await S.openFolderItem(page, 'driver_common_class');
  const opened = await page.locator('#editor').inputValue();
  await S.typeDsl(page, opened.replace('Spi_Driver', 'Spi_Ctrl'));
  await page.waitForTimeout(900);
  const lock = page.locator('#source-lock-modal');
  await expect(lock).toBeVisible();
  // この 1 枚だけの答えにする (既定は「以後も同じ扱い」が入っている)。
  const applyAll = page.locator('#source-lock-all');
  if (await applyAll.isChecked()) await applyAll.uncheck();
  await page.locator('#source-lock-keep').click();
  await page.waitForTimeout(1200);
  // 前提: この時点では元ファイルは守られ、編集は控えの側に出ている。
  expect(await S.readDoc(page, LOCK_DIR, 'driver_common_class')).not.toContain('Spi_Ctrl');

  // 置換が当たる図も開いておく (当たらないと後始末まで進まない)。
  await S.openFolderItem(page, 'can_init_sequence');
  await S.overwriteOpenedFile(page);

  await S.runCommand(page, '一括置換');
  const allDocs = page.locator('#rename-all-docs');
  if (await allDocs.count() && !(await allDocs.isChecked())) await allDocs.check();
  await page.locator('#rename-from').fill('Can_Driver');
  await page.locator('#rename-to').fill('Can_Ctrl');
  await page.waitForTimeout(1200);
  await expect(page.locator('#btn-rename-apply')).toBeEnabled();
  await page.locator('#btn-rename-apply').click();
  await page.waitForTimeout(1800);

  // 到達条件その1: 置換が当たった図には反映される。
  expect(await S.readDoc(page, LOCK_DIR, 'can_init_sequence')).toContain('Can_Ctrl');
  // 到達条件その2: 錠に「元のまま保つ」と答えた図は、後始末でも書き換わらない。
  const kept = await S.readDoc(page, LOCK_DIR, 'driver_common_class');
  expect(kept).not.toContain('Spi_Ctrl');
  expect(kept).toContain('Spi_Driver');
});

// BLK-primary-20260909-0503-wish: 同じ 5.5 の中でも、指摘が「junior の GPIO 図と
// primary の GPIO 図が別物」のときは、差分を見た後に決めたこと (統一する / 別物と
// する) を自分の図へ反映する手段が無く、他人のフォルダを別途覗いて手で見比べ、
// 手で打ち替えるしかなかった。突合の場でそのまま決められることを到達条件にする。
// 突合は「隣り合うフォルダ」を相手にするので、この 2 件だけが隣になる場所を使う
// (手順5.5 の一括置換が使う DIR と混ぜない)。
const COHORT_ROOT = DIR + '-cohort';
const MINE_DIR = COHORT_ROOT + '/primary';
const OTHER_DIR = COHORT_ROOT + '/junior';

const GPIO_MINE = [
  '@startuml', 'title GPIO 初期化シーケンス',
  'participant Gpio_Driver', 'participant Hw_Ctrl',
  'Gpio_Driver -> Hw_Ctrl : Gpio_Init', '@enduml',
].join('\n');
const GPIO_OTHER = [
  '@startuml', 'title GPIO 初期化シーケンス',
  'participant GpioDrv', 'participant Hw_Ctrl', 'participant Nvic',
  'GpioDrv -> Hw_Ctrl : Gpio_Init', '@enduml',
].join('\n');

async function openCohort(page) {
  await page.locator('#btn-tab-peek').click();
  await page.waitForSelector('#peek-modal');
  await page.locator('#peek-cohort-toggle').click();
  await page.waitForSelector('#peek-cohort .cohort-pair');
}

test('手順5.5 ドメインの食い違いは、突合の場で「統一する」と決めて自分の図に反映できる', async ({ page }) => {
  await S.bootWithSaveDir(page, MINE_DIR);
  await S.clearDir(page, MINE_DIR);
  await S.clearDir(page, OTHER_DIR);
  await S.putDoc(page, MINE_DIR, 'gpio_init_sequence', GPIO_MINE);
  await S.putDoc(page, OTHER_DIR, 'gpio_init_sequence', GPIO_OTHER);
  await page.reload();
  await page.waitForSelector('#btn-tab-peek');

  await openCohort(page);
  // 到達条件その1: 相手を探さなくても、食い違いが組として出る。
  const pair = page.locator('#peek-cohort .cohort-pair').first();
  await expect(pair).toHaveAttribute('data-cohort-matched', '0');
  await expect(pair.locator('.cohort-verdict-btn[data-verdict="shared"]')).toBeVisible();

  // 到達条件その2: 押すだけで自分の図の綴りが相手に揃い、その場で結果が読める。
  await pair.locator('.cohort-verdict-btn[data-verdict="shared"]').click();
  await page.waitForTimeout(2000);
  const saved = (await S.readDoc(page, MINE_DIR, 'gpio_init_sequence')) || '';
  expect(saved).toContain('participant GpioDrv');
  expect(saved).not.toContain('Gpio_Driver');
  // 到達条件その3: 決めたことがファイルに残り、次に突合したとき判断済みと分かる。
  expect(saved).toContain("' domain-verdict: shared gpio vs junior");
  expect(await S.readDoc(page, OTHER_DIR, 'gpio_init_sequence')).toBe(GPIO_OTHER);
});

test('手順5.5 「別物」と決めたときは title に明示され、部品名は動かない', async ({ page }) => {
  await S.bootWithSaveDir(page, MINE_DIR);
  await S.clearDir(page, MINE_DIR);
  await S.clearDir(page, OTHER_DIR);
  await S.putDoc(page, MINE_DIR, 'gpio_init_sequence', GPIO_MINE);
  await S.putDoc(page, OTHER_DIR, 'gpio_init_sequence', GPIO_OTHER);
  await page.reload();
  await page.waitForSelector('#btn-tab-peek');

  await openCohort(page);
  await page.locator('#peek-cohort .cohort-pair').first()
    .locator('.cohort-verdict-btn[data-verdict="separate"]').click();
  await page.waitForTimeout(2000);
  const saved = (await S.readDoc(page, MINE_DIR, 'gpio_init_sequence')) || '';
  expect(saved).toContain('title GPIO 初期化シーケンス (junior の gpio とは別のドメイン)');
  expect(saved).toContain('participant Gpio_Driver');
  expect(saved).toContain("' domain-verdict: separate gpio vs junior");
});

// BLK-primary-20260912-2206-wish: reviewer の最重要指摘 (driver_common_class /
// plantuml-class / diagram1 の 3 枚が雛形と完全一致) を反映する手順。
// 3 枚同時の事故を保存のその場で全部挙げ、過去版を探さずに 1 操作で戻せることを固定する。
const SWAP_DIR = './test-results/scn-primary-05b-swap';
const TEMPLATE_CLASS = ['@startuml', 'class Foo', '@enduml'].join('\n');
const TEMPLATE_SEQ = ['@startuml', 'A -> B : x', 'B -> A : y', '@enduml'].join('\n');
const FULL_CLASS = ['@startuml', 'title driver_common_class'].concat(
  ['Spi_Driver', 'Can_Driver', 'Gpio_Driver', 'Irq_Driver', 'Uart_Driver', 'Adc_Driver', 'Timer_Driver']
    .map((c) => 'class ' + c + ' {\n  +Init()\n  +DeInit()\n  +Read()\n}')
).concat(['@enduml']).join('\n');

test('手順5.5 中身が入れ替わった図は、一致した組を全部挙げて 1 操作で戻せる', async ({ page }) => {
  await S.bootWithSaveDir(page, SWAP_DIR);
  await S.clearDir(page, SWAP_DIR);
  // 事故の直前の保存フォルダ: 中身の詰まった図と、別名の雛形が並んでいる。
  await S.putDoc(page, SWAP_DIR, 'driver_common_class', FULL_CLASS);
  await S.putDoc(page, SWAP_DIR, 'plantuml-class', TEMPLATE_CLASS);
  await S.putDoc(page, SWAP_DIR, 'spi_dma_sequence', TEMPLATE_SEQ);
  await S.putDoc(page, SWAP_DIR, 'plantuml-sequence', TEMPLATE_SEQ);
  await S.openFolderItem(page, 'driver_common_class');
  await S.overwriteOpenedFile(page);

  // 上書きされる前の中身を控えに積む (server が _versions/ へ退避する)。
  await S.typeDsl(page, FULL_CLASS);
  await page.locator('#btn-save').dispatchEvent('click');
  await page.waitForTimeout(1800);

  // 事故: 開いたまま雛形で上書きしてしまった。
  await S.typeDsl(page, TEMPLATE_CLASS);
  await page.locator('#btn-save').dispatchEvent('click');
  await page.waitForTimeout(2500);

  // 到達条件その1: 保存したその場で、フォルダの一致した組が全部並ぶ。
  // 保存していない spi_dma_sequence の組も出る (起動時の既定図が diagram1 を取るので名前を替えている) (reviewer の突合を待たずに 3 枚目に気付ける)。
  const twins = page.locator('#ssw-twins');
  await expect(twins).toBeVisible();
  await expect(twins).toContainText('driver_common_class と plantuml-class');
  await expect(twins).toContainText('plantuml-sequence と spi_dma_sequence');

  // 到達条件その2: 巻き込まれた図に「戻す」が出て、どの版に戻るのかが押す前に読める。
  const restore = page.locator('#btn-ssw-restore');
  await expect(restore).toBeVisible();
  await expect(restore).toContainText('行）');

  // 到達条件その3: 1 回押すだけで、エディタも保存フォルダのファイルも元の中身に戻る
  // (_versions/ の過去版を 1 枚ずつ探して打ち直す作業が要らない)。
  await restore.click();
  await page.waitForTimeout(2500);
  expect(await page.locator('#editor').inputValue()).toContain('class Timer_Driver');
  const saved = (await S.readDoc(page, SWAP_DIR, 'driver_common_class')) || '';
  expect(saved).toContain('class Timer_Driver');
  expect(saved).not.toBe(TEMPLATE_CLASS);
});

// BLK-primary-20260913-0306: 一括置換も改名も使わず、📂一覧→打ち直し→Ctrl+S を
// 続けただけで、一度も開いていない plantuml-class.puml / plantuml-sequence.puml が
// 打ち直した図と同じ中身に入れ替わった。自動保存がディスクへ写す先を「図の名前」では
// なく「図種 (plantuml-class 等)」にしていたため、打鍵のたびに図種名のファイルが
// 目の前の図で上書きされていた。普通の保存だけで入れ替わらない、を到達条件にする。
const TYPE_DIR = DIR + '-typekey';

test('手順5.5 打ち直して保存しても、開いていない図種名のファイルは作られない', async ({ page }) => {
  await S.bootWithSaveDir(page, TYPE_DIR);
  await S.clearDir(page, TYPE_DIR);
  await S.putDoc(page, TYPE_DIR, 'driver_common_class', S.docFor('driver_common_class'));
  await page.reload();
  await page.waitForTimeout(800);

  await S.openFolderItem(page, 'driver_common_class');
  await S.overwriteOpenedFile(page);
  await S.typeDsl(page, S.docFor('driver_common_class', 'Spi_Ctrl'));
  await page.waitForTimeout(2000);

  // 到達条件その1: 打ち直した中身は、その図の名前のファイルに入っている。
  expect(await S.readDoc(page, TYPE_DIR, 'driver_common_class')).toContain('Spi_Ctrl');

  // 到達条件その2: 開いてもいない図種名のファイルは、保存フォルダに現れない。
  const files = await S.listDir(page, TYPE_DIR);
  expect(files).not.toContain('plantuml-class');
  expect(files).not.toContain('plantuml-sequence');
});

// BLK-primary-20260913-0306-friction: 指摘を反映した図の中身が別の図で塗り潰される
// 事故が続いており、復元は「壊れた図を全文選択して打ち直す」しかなかった
// (driver_common_class は 59 行・約 1000 字を 1 手順で打ち直している)。
// server は上書きの手前で前の中身を `_versions/` へ控えているので、その版を
// 打鍵ではなく 1 クリックで今の図に流し込めることを到達条件にする。
test('手順5.5 塗り潰された図を、打ち直さずに直前の版へ 1 クリックで戻せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);

  const FULL = ['@startuml', 'title Driver_Common_Class',
    'class Driver_Common {', '  + Init() : void', '  + DeInit() : void', '}',
    'class Spi_Driver', 'class Can_Driver', 'class Gpio_Driver', '@enduml'].join('\n');
  const STUB = ['@startuml', 'title Sample Class', 'class Foo', '@enduml'].join('\n');

  // 正しい中身を保存したあと、別の図の中身で塗り潰される (事故)。
  await S.putDoc(page, DIR, 'driver_common_class', FULL);
  await S.putDoc(page, DIR, 'driver_common_class', STUB);
  expect(await S.readDoc(page, DIR, 'driver_common_class')).toContain('class Foo');

  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open');
  // 到達条件 1: 壊れた図の行から、控えてある版に辿り着ける。
  await page.locator('[data-versions-name="driver_common_class"]').click();
  const restore = page.locator('[data-version-restore][data-version-of="driver_common_class"]').first();
  await restore.waitFor({ timeout: 10000 });

  // 到達条件 2: 1 クリックで、打ち直し無しに中身が戻る。
  await restore.click();
  await page.waitForTimeout(1200);
  const lock = page.locator('#source-lock-modal');
  if (await lock.isVisible().catch(() => false)) {
    await page.locator('#source-lock-overwrite').click();
    await page.waitForTimeout(800);
  }
  const editor = await page.locator('#editor').inputValue();
  expect(editor).toContain('class Driver_Common {');
  expect(editor).not.toContain('class Foo');

  // 到達条件 3: 保存フォルダの実体も戻っている (画面だけが直った状態にしない)。
  await page.waitForTimeout(1200);
  expect(await S.readDoc(page, DIR, 'driver_common_class')).toContain('class Driver_Common {');

  await S.clearDir(page, DIR);
});

// BLK-primary-20260914-1006-wish: 同じ手順5.5 で、指摘.md の 1 件を読んでから
// 「これは ⇄一括置換 か、再出力か、別ドメイン宣言か」を毎回自分で決め、対応する
// 画面を探して開いていた。手段は指摘文に書いてあるので、指摘ごとに対象図と提案
// アクションが並び、[適用] を押すだけで当たることを到達条件にする。
const fs = require('fs');
const nodePath = require('path');

const ACT_ROOT = DIR + '-actions';
const ACT_MINE = ACT_ROOT + '/primary';
const ACT_REVIEWER = ACT_ROOT + '/reviewer';

function absOf(rel) {
  return nodePath.join(__dirname, '..', '..', '..', rel.replace(/^\.\//, ''));
}

// reviewer が実際に書いている形 (自由文、見出しに【】、手段は本文に混ざる)。
const ACT_NOTE = [
  '# primary への指摘',
  '',
  '## 【最優先】gpio_state.svg が実データと食い違ったまま',
  'render 結果と保存済みが非ヘッダ部で不一致。再エクスポートが必要。',
  '',
  '## 【継続】spi_init_sequence の部品名が不統一',
  '`SpiDrv` を `Spi_Driver` に統一すること。',
  '',
  '## 【新規】timer_state.puml の遷移ラベルに対応するクラスメソッドが無い',
  '`driver_common_class.puml` の `Timer_Driver` は `Timer_Init()` しか宣言していないが、',
  '`timer_state.puml` は `Timer_Start`/`Timer_Stop` の遷移ラベルを使っている。',
  'クラス図にメソッドを足すか、遷移ラベルを実在する操作名に揃える必要がある。',
  '',
  '## 【継続】インフラ系クラスがクラス図に不在',
  '`ClockCtrl` / `NVIC` が 1 つも定義されていない。',
  '',
  '## 【任意】can の「編集中」ファイルの整理',
  '編集中のまま残っている図があります。残すか消すかを決めてください。',
].join('\n');

const SPI_SEQ = ['@startuml', 'title SPI 初期化シーケンス',
  'participant SpiDrv', 'participant Hw_Ctrl',
  'SpiDrv -> Hw_Ctrl : Spi_Init', '@enduml'].join('\n');

// 指摘が名指しする 2 枚。クラス図は Timer_Init だけを宣言している。
const ACT_CLASS = ['@startuml', 'title ドライバ共通クラス図',
  'class Timer_Driver {', '  + Timer_Init() : void', '}',
  'class Gpio_Driver', '@enduml'].join('\n');
const ACT_TIMER_STATE = ['@startuml', 'title TIMER 状態遷移',
  '[*] --> Uninit', 'Uninit --> Ready : Timer_Init',
  'Ready --> Busy : Timer_Start', 'Busy --> Ready : Timer_Stop', '@enduml'].join('\n');

test.describe('手順5.5 指摘.md を貼る → 提案一覧 → [適用]', () => {
  test.beforeEach(async ({ page }) => {
    await S.bootWithSaveDir(page, ACT_MINE);
    await S.clearDir(page, ACT_MINE);
    await S.putDoc(page, ACT_MINE, 'spi_init_sequence', SPI_SEQ);
    await S.putDoc(page, ACT_MINE, 'gpio_state', S.GPIO_STATE);
    await S.putDoc(page, ACT_MINE, 'driver_common_class', ACT_CLASS);
    await S.putDoc(page, ACT_MINE, 'timer_state', ACT_TIMER_STATE);
    // 指摘.md は図ではないので GUI からは置けない (reviewer が置くファイル)。
    fs.mkdirSync(absOf(ACT_REVIEWER), { recursive: true });
    fs.writeFileSync(nodePath.join(absOf(ACT_REVIEWER), '指摘.md'), ACT_NOTE, 'utf-8');
    await page.reload();
    await page.waitForSelector('#btn-tab-peek');
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.locator('#peek-note-toggle').click();
    await page.waitForSelector('#peek-note .note-action-row');
  });

  test('指摘ごとに対象図と提案アクションが出て、当てられない件は理由が出る', async ({ page }) => {
    // 到達条件その1: 指摘文を読まなくても、件ごとに手段と対象図が並ぶ。
    const rows = page.locator('#peek-note .note-action-row');
    await expect(rows.nth(0)).toHaveAttribute('data-note-action', 'reexport');
    await expect(rows.nth(0)).toContainText('再出力: gpio_state');
    await expect(rows.nth(1)).toHaveAttribute('data-note-action', 'rename');
    await expect(rows.nth(1)).toContainText('SpiDrv → Spi_Driver');
    await expect(rows.nth(1)).toContainText('spi_init_sequence');

    // BLK-primary-20260914-1106-wish: 「このクラスにこのメソッドを足す」「このクラスが
    // クラス図に無い」も定型なので、読んで決める側から [適用] 側へ移る。
    await expect(rows.nth(2)).toHaveAttribute('data-note-action', 'addmethod');
    await expect(rows.nth(2)).toContainText('メソッド追加');
    await expect(rows.nth(3)).toHaveAttribute('data-note-action', 'addclass');
    await expect(rows.nth(3)).toContainText('ClockCtrl');

    // 到達条件その2: 手段が書かれていない指摘は当てず、押せない理由がその場に出る。
    await expect(rows.nth(4)).toHaveAttribute('data-note-action', 'manual');
    await expect(rows.nth(4)).toHaveAttribute('data-note-action-ready', '0');
    await expect(rows.nth(4).locator('.note-apply')).toBeDisabled();

    // 到達条件その3: 今日 [適用] だけで済む件数が、読む前に分かる。
    await expect(page.locator('#note-apply-summary')).toContainText('4 件は [適用]');
  });

  test('メソッド不在の指摘は [適用] だけで、クラス図に遷移ラベルの操作が足される', async ({ page }) => {
    const row = page.locator('#peek-note .note-action-row[data-note-action="addmethod"]');
    await row.locator('.note-apply').click();
    // 到達条件その1: 何を何処に足したかが 1 行で読める。
    await expect(page.locator('#note-summary'))
      .toContainText('driver_common_class に足しました', { timeout: 20000 });

    // 到達条件その2: ⇄突合の画面を開かなくても、保存フォルダのクラス図が直っている。
    const saved = (await S.readDoc(page, ACT_MINE, 'driver_common_class')) || '';
    expect(saved).toContain('+Timer_Start()');
    expect(saved).toContain('+Timer_Stop()');
    // 到達条件その3: 指摘が名指ししていない図の欠落までは足さない。
    expect(saved).not.toContain('Gpio_Write');
  });

  test('クラス不在の指摘は [適用] だけで、クラス図に宣言が足される', async ({ page }) => {
    const row = page.locator('#peek-note .note-action-row[data-note-action="addclass"]');
    await row.locator('.note-apply').click();
    await expect(page.locator('#note-summary'))
      .toContainText('宣言しました', { timeout: 20000 });
    const saved = (await S.readDoc(page, ACT_MINE, 'driver_common_class')) || '';
    expect(saved).toContain('class ClockCtrl');
    expect(saved).toContain('class NVIC');
    // 想像でメンバまで足さない (指摘はクラスの不在しか言っていない)。
    expect(saved).not.toContain('class ClockCtrl {');
  });

  test('部品名の指摘は [適用] だけで、対象図のファイルに当たる', async ({ page }) => {
    const row = page.locator('#peek-note .note-action-row[data-note-action="rename"]');
    await row.locator('.note-apply').click();
    // 到達条件その1: 当てた結果が 1 行で読める (どこを見に行くかを考えずに済む)。
    await expect(page.locator('#note-summary'))
      .toContainText('SpiDrv → Spi_Driver', { timeout: 15000 });
    await expect(page.locator('#note-summary')).toContainText('spi_init_sequence');

    // 到達条件その2: 画面だけでなく保存フォルダの実体が直っている。
    const saved = (await S.readDoc(page, ACT_MINE, 'spi_init_sequence')) || '';
    expect(saved).toContain('participant Spi_Driver');
    expect(saved).not.toContain('SpiDrv');
    // 到達条件その3: 指摘が名指ししていない図は動かない (全図適用にしない)。
    expect(await S.readDoc(page, ACT_MINE, 'gpio_state')).toBe(S.GPIO_STATE);
  });

  test('再出力の指摘は [適用] だけで、保存フォルダの SVG が出し直される', async ({ page }) => {
    const row = page.locator('#peek-note .note-action-row[data-note-action="reexport"]');
    await row.locator('.note-apply').click();
    await expect(page.locator('#note-summary'))
      .toContainText('gpio_state の SVG を出し直しました', { timeout: 60000 });
    // 保存フォルダに実体が出来ている (画面上の報告だけにしない)。
    const svg = nodePath.join(absOf(ACT_MINE), 'gpio_state.svg');
    expect(fs.existsSync(svg)).toBe(true);
    expect(fs.readFileSync(svg, 'utf-8')).toContain('<svg');
  });
});

// BLK-primary-20260914-1306-wish: 指摘.md は毎回「can_init_sequence-編集中 /
// spi_init_sequence-編集中 が本体と byte 単位で同一のまま」の整理を求めるのに、
// 📂一覧には開く・名前を変えるしか無く、片付けるには保存フォルダを直接触るしか
// なかった (体験の規律で禁止)。重複を一覧の側で名指しし、1 押しで統合できることを
// 到達条件にする。
test('手順5.5 本体と中身が同じ「-編集中」を、📂一覧から 1 押しで統合できる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);

  const CAN = S.docFor('can_init_sequence');
  const SPI = S.docFor('spi_init_sequence');
  await S.putDoc(page, DIR, 'can_init_sequence', CAN);
  await S.putDoc(page, DIR, 'can_init_sequence-編集中', CAN);
  await S.putDoc(page, DIR, 'spi_init_sequence', SPI);
  await S.putDoc(page, DIR, 'spi_init_sequence-編集中', SPI);
  await S.putDoc(page, DIR, 'driver_common_class', S.docFor('driver_common_class'));

  await S.openFolder(page);
  // 到達条件 1: 一覧が「中身が同じ図」を自分で数えて名指しする。
  const sum = page.locator('#folder-dupe-summary');
  await sum.waitFor({ timeout: 10000 });
  expect(await sum.textContent()).toContain('2 組');
  // 行の印で、どちらが本体でどちらが消せる写しかが分かる。
  expect(await page.locator('[data-dupe-of="can_init_sequence-編集中"]').getAttribute('data-dupe-kind'))
    .toBe('copy');
  expect(await page.locator('[data-dupe-of="can_init_sequence"]').getAttribute('data-dupe-kind'))
    .toBe('keep');
  // 重複していない図には印を出さない (全行に印が付くと印でなくなる)。
  expect(await page.locator('[data-dupe-of="driver_common_class"]').count()).toBe(0);

  // 到達条件 2: 1 押しで写しだけが消え、本体は残る。
  await page.locator('[data-dupe-keep="can_init_sequence"]').click();
  await page.waitForTimeout(1500);
  let names = await S.listDir(page, DIR);
  expect(names).not.toContain('can_init_sequence-編集中');
  expect(names).toContain('can_init_sequence');
  expect(names).toContain('spi_init_sequence-編集中');

  // 到達条件 3: 残りも同じ 1 押しで片付き、重複の行そのものが消える。
  await page.locator('[data-dupe-keep="spi_init_sequence"]').click();
  await page.waitForTimeout(1500);
  names = await S.listDir(page, DIR);
  expect(names).not.toContain('spi_init_sequence-編集中');
  expect(names).toContain('spi_init_sequence');
  expect(await page.locator('#folder-dupe-summary').count()).toBe(0);

  // 到達条件 4: 重複していない図も、一覧から 1 枚だけ消せる (⚙設定の全削除しか
  // 無かったので、1 枚を消すには保存フォルダを直接触るしかなかった)。
  const del = page.locator('[data-delete-name="driver_common_class"]');
  await del.click();           // 1 回目は身構えるだけ
  await page.waitForTimeout(400);
  await page.locator('[data-delete-name="driver_common_class"]').click();
  await page.waitForTimeout(1500);
  expect(await S.listDir(page, DIR)).not.toContain('driver_common_class');

  await S.clearDir(page, DIR);
});
