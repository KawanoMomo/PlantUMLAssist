// @ts-check
// primary 台本 手順5.5: persona-data\reviewer\指摘.md を読み、そこにある指摘を全部反映する。
// 参加者名だけの変更は「⇄一括置換」の #rename-all-docs を外して対象図だけに絞る。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

// 読み込み直した直後の画面は init (保存先の取り込み /prefs を最大 3 秒待って走る) の前の骨格で、
// ボタンは見えていても押しても何も起きない。全体実行 (--workers=4) で /prefs が遅い回に
// 👀 を押しても #peek-modal が開かず落ちていたので、reload の後は押せるようになった印を待つ。
async function reloadReady(page) {
  await page.reload();
  await page.waitForSelector('html[data-app-ready="1"]', { state: 'attached' });
}

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
  await reloadReady(page);
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
  await reloadReady(page);
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
  await reloadReady(page);
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

// BLK-reviewer-20260914-1706-wish: 突合の画面は「primary だけ / junior だけ」の 2 列までで、
// IRQCtrl と Irq_Ctrl が同じ部品の別表記であることは読む側が目で結び直していた
// (reviewer は CLI で件数を得た後、どの名前がどの名前かを grep で探していた)。
// 揺れている組が対応表の 1 行として出ることを到達条件にする。
const IRQ_MINE = ['@startuml', 'title IRQ 初期化シーケンス',
  'participant IRQCtrl', 'participant ClockCtrl', 'participant Hw_Ctrl',
  'IRQCtrl -> ClockCtrl : Irq_Init', '@enduml'].join('\n');
const IRQ_OTHER = ['@startuml', 'title IRQ 初期化シーケンス',
  'participant Irq_Ctrl', 'participant Clock_Ctrl', 'participant Hw_Ctrl',
  'Irq_Ctrl -> Clock_Ctrl : Irq_Init', '@enduml'].join('\n');

test('手順5.5 表記揺れの部品名が、どちらの綴りと対応するかまで 1 つの表で読める', async ({ page }) => {
  await S.bootWithSaveDir(page, MINE_DIR);
  await S.clearDir(page, MINE_DIR);
  await S.clearDir(page, OTHER_DIR);
  await S.putDoc(page, MINE_DIR, 'irq_init_sequence', IRQ_MINE);
  await S.putDoc(page, OTHER_DIR, 'irq_init_sequence', IRQ_OTHER);
  await reloadReady(page);
  await page.waitForSelector('#btn-tab-peek');

  await openCohort(page);
  const pair = page.locator('#peek-cohort .cohort-pair').first();
  // 到達条件 1: 揺れている組が、探さずに 1 行として出る。
  const rows = pair.locator('.cohort-pair-row[data-pair-kind="variant"]');
  await expect(rows).toHaveCount(2);
  // 組は「どちらのフォルダが左か」に依らず、2 つの綴りが 1 行に並ぶ。
  const pairs = await rows.evaluateAll((els) => els.map(
    (e) => [e.getAttribute('data-pair-a'), e.getAttribute('data-pair-b')].sort().join('⇔')).sort());
  expect(pairs).toEqual(['ClockCtrl⇔Clock_Ctrl', 'IRQCtrl⇔Irq_Ctrl']);
  // 到達条件 2: 何を見ての件数かが 1 行で出る (一致している部品も母数に入る)。
  await expect(pair.locator('.cohort-pairs-head')).toContainText('表記揺れ 2');
  await expect(pair.locator('.cohort-pairs-head')).toContainText('一致 1');
  // 到達条件 3: 表記揺れと「似ているだけ」を取り違えない。
  await expect(rows.first()).toContainText('表記揺れ');
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
  await reloadReady(page);
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

  await openFolder(page);
  await page.waitForSelector('#folder-panel.open');
  // 到達条件 1: 壊れた図の行から、控えてある版に辿り着ける。
  await page.locator('[data-versions-name="driver_common_class"]').click();
  const restore = page.locator('[data-version-restore][data-version-of="driver_common_class"]').first();
  await restore.waitFor({ timeout: 10000 });
  // 一覧は庫・札・保存の確かめが届くたびに描き直される (全体実行で遅い回は、押した後に届く)。
  // 描き直しても開いた版の一覧は閉じない (閉じると、押したのに何も出ないように見える)。
  // 保存したばかりの図なので「一覧を取り直す」が出ている。それで描き直させる。
  // 版の一覧は「この図の履歴」(#vt-modal) に開くので、一覧はその裏にあって人の手では押せない。
  // ここで要るのは利用者の操作ではなく「裏で届いた確かめによる描き直し」なので、
  // 描き直しの入口をマウスを介さずに呼ぶ (押すのは [戻す] で、それは実マウスで押す)。
  const again = page.locator('#folder-panel .folder-write-refresh').first();
  await again.waitFor({ state: 'attached' });
  await again.evaluate((b) => /** @type {HTMLButtonElement} */ (b).click());
  await page.waitForTimeout(800);
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

// 保存先の節は既定で開いている (design 10a)。開いていれば畳んでから開き直し、
// 一覧を今の中身で描き直す (直に押すと、開いていたときに畳んでしまう)。
async function openFolder(page) {
  // BLK-owner-20260924-0637-1: 旧 📂 一覧は保存先の右クリック「保存先の一覧を開く」で中央の枠に開く。
  await require('./_scenario').openFolder(page);
  await page.waitForSelector('#folder-panel.open');
}

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
    await reloadReady(page);
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
    // 書き戻しは画面の 1 行より後に着くことがあるので、ファイルが追いつくまで読み直す
    // (即読みだと「当たったのに古い本文を読んだ」だけで赤になる)。
    await expect.poll(async () => (await S.readDoc(page, ACT_MINE, 'spi_init_sequence')) || '',
      { timeout: 15000 }).toContain('participant Spi_Driver');
    const saved = (await S.readDoc(page, ACT_MINE, 'spi_init_sequence')) || '';
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

// BLK-primary-20260914-1706-wish: reviewer の 指摘.md は、直す図のある指摘に混じって
// 「前提: …」「突合サマリ」「primary への依頼(優先順)」を `##` 見出しで並べる。
// どれも [適用] が出ない前置きなのに一覧には同じ形で並ぶので、手順 5.5 は毎回
// 「これは本物の指摘か、ただの前置きか」を 1 件ずつ読んで決めることから始まっていた
// (今回は 9 件中 3 件が前置き)。実物だけが最初から並び、前置きは件数だけ言って
// 出し直せることを到達条件にする。
const PRE_ROOT = DIR + '-preamble';
const PRE_MINE = PRE_ROOT + '/primary';
const PRE_REVIEWER = PRE_ROOT + '/reviewer';

const PRE_NOTE = [
  '# primary への指摘',
  '',
  '## 前提: DSL 無変化',
  '前回控えから DSL に差はありません。',
  '',
  '## 突合サマリ',
  '9 件中 6 件が要対応です。',
  '',
  '## 【継続】spi_init_sequence の部品名が不統一',
  '`SpiDrv` を `Spi_Driver` に統一すること。',
  '',
  '## 【新規】timer_state.puml の遷移ラベルに対応するクラスメソッドが無い',
  '`driver_common_class.puml` の `Timer_Driver` は `Timer_Init()` しか宣言していないが、',
  '`timer_state.puml` は `Timer_Start`/`Timer_Stop` の遷移ラベルを使っている。',
  '',
  '## primary への依頼(優先順)',
  '上から順にお願いします。',
].join('\n');

test.describe('手順5.5 指摘.md の前置きを一覧の外に出す', () => {
  test.beforeEach(async ({ page }) => {
    await S.bootWithSaveDir(page, PRE_MINE);
    await S.clearDir(page, PRE_MINE);
    await S.putDoc(page, PRE_MINE, 'spi_init_sequence', SPI_SEQ);
    await S.putDoc(page, PRE_MINE, 'driver_common_class', ACT_CLASS);
    await S.putDoc(page, PRE_MINE, 'timer_state', ACT_TIMER_STATE);
    fs.mkdirSync(absOf(PRE_REVIEWER), { recursive: true });
    fs.writeFileSync(nodePath.join(absOf(PRE_REVIEWER), '指摘.md'), PRE_NOTE, 'utf-8');
    await reloadReady(page);
    await page.waitForSelector('#btn-tab-peek');
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.locator('#peek-note-toggle').click();
    await page.waitForSelector('#peek-note .note-finding');
  });

  test('並ぶのは実物の指摘だけで、見出しが「前置きは一覧の外」と言う', async ({ page }) => {
    // 到達条件その1: 5 見出しのうち、押す対象は 2 件だけ。
    await expect(page.locator('#peek-note .note-finding')).toHaveCount(2);
    await expect(page.locator('#note-summary'))
      .toContainText('指摘 2 件 (前置き 3 件は一覧の外)');
    // 到達条件その2: 何件が前置きかを、指摘.md を数え直さずに読める。
    await expect(page.locator('#note-preamble-toggle')).toHaveText('前置き 3 件も出す');
  });

  test('前置きは消えていない (1 クリックで書いた順のまま出し直せる)', async ({ page }) => {
    await page.locator('#note-preamble-toggle').click();
    await expect(page.locator('#peek-note .note-finding')).toHaveCount(5);
    await expect(page.locator('#peek-note .note-finding').first()).toContainText('前提');
    await expect(page.locator('#note-summary')).toContainText('指摘 5 件');
    await expect(page.locator('#note-summary')).not.toContainText('一覧の外');

    await page.locator('#note-preamble-toggle').click();
    await expect(page.locator('#peek-note .note-finding')).toHaveCount(2);
  });

  test('残った 2 件はどちらも [適用] まで届く (前置きを読まずに手が動く)', async ({ page }) => {
    await expect(page.locator('#peek-note .note-action-row')).toHaveCount(2);
    await expect(page.locator('#note-apply-summary')).toContainText('[適用]');
    const row = page.locator('#peek-note .note-action-row[data-note-action="addmethod"]');
    await row.locator('.note-apply').click();
    await expect(page.locator('#note-summary'))
      .toContainText('driver_common_class に足しました', { timeout: 20000 });
    const saved = (await S.readDoc(page, PRE_MINE, 'driver_common_class')) || '';
    expect(saved).toContain('+Timer_Start()');
  });
});

// BLK-reviewer-20260914-2006: 同じ手順5.5 の入口。指摘.md に書かれた依頼が何件・
// 最長何 tick 継続しているかは、直す側 (primary) の画面のどこにも出ていなかった。
// 継続 tick 数を読めるのは reviewer 側の CLI (`npm run requests`) だけで、primary は
// 手順を始める前に指摘.md を GUI の外で開いて読むしかなく、読み忘れた回はそのまま
// 1 tick 放置になる。下端の帯に常時出ていること、指摘.md が書き替わったら継続 tick が
// 積まれること、押せば指摘の一覧まで 1 手で届くことを到達条件にする。
const RQ_ROOT = DIR + '-requests';
const RQ_MINE = RQ_ROOT + '/primary';
const RQ_REVIEWER = RQ_ROOT + '/reviewer';

const RQ_NOTE_1 = [
  '# primary への指摘 (reviewer runs/20260914-1906 時点)',
  '',
  '## primary への依頼(優先順)',
  '1. (最優先・継続)`plantuml-usecase-編集中.puml` の内容を `plantuml-usecase.puml` 本体に',
  '   差し替え、`-編集中` ファイルを削除する。',
  '2. (継続)`diagram1.puml` に `\' domain-verdict` のコメント行を復元する。',
  '',
].join('\n');

// 次の tick。扱いの括弧だけが変わり、依頼の中身は同じ (= 2 tick 目の継続)。
const RQ_NOTE_2 = RQ_NOTE_1
  .replace('runs/20260914-1906', 'runs/20260914-2006')
  .replace('(最優先・継続)', '(最優先・2 tick 継続)');

test.describe('primary 手順5.5: 未着手の依頼が何件・何 tick 続いているかが画面に出る', () => {
  test.beforeEach(async ({ page }) => {
    fs.mkdirSync(absOf(RQ_REVIEWER), { recursive: true });
    fs.writeFileSync(nodePath.join(absOf(RQ_REVIEWER), '指摘.md'), RQ_NOTE_1, 'utf-8');
    await S.bootWithSaveDir(page, RQ_MINE);
    await S.clearDir(page, RQ_MINE);
    await S.putDoc(page, RQ_MINE, 'plantuml-usecase', S.docFor('can_init_sequence'));
    await S.putDoc(page, RQ_MINE, 'diagram1', S.docFor('can_state'));
    await reloadReady(page);
    await page.waitForSelector('#status-requests');
  });

  test('指摘.md を開かなくても、未解消の依頼の件数と最長継続 tick 数が下端に出る', async ({ page }) => {
    const badge = page.locator('#status-requests');
    // 到達条件その1: 指摘.md を GUI の外で開かずに、件数と継続 tick 数が読める。
    // design 9c (BLK-human-20260923-1602): 下端の札は「● 名前 N」の 1 種類に揃えた。
    // 継続 tick 数は title に移った (札ごとに長さが違う形を作らない)。
    await expect(badge).toHaveText('● 継続依頼 2', { timeout: 20000 });
    expect(await badge.getAttribute('title')).toContain('最長 1 tick');
    await expect(badge).toHaveAttribute('data-open', '2');
    // 到達条件その2: 未解消がある回は目を引く色になる (見落として 1 tick 放置しない)。
    // 初出の回は「未着手」とはまだ言えないので、色は 1 段弱いほうで出す。
    await expect(badge).toHaveClass(/has-open/);
    await expect(badge).toHaveAttribute('data-tone', 'working');
    // 到達条件その3: どの依頼が何 tick 放置かまで、押す前に読める。
    const tip = (await badge.getAttribute('title')) || '';
    expect(tip).toContain('未解消 2 件');
    expect(tip).toContain('plantuml-usecase');
    expect(tip).toContain('連続 1 tick');
  });

  test('指摘.md が次の版に書き替わると、同じ依頼は 2 tick 目として数えられる', async ({ page }) => {
    const badge = page.locator('#status-requests');
    // design 9c (BLK-human-20260923-1602): 下端の札は「● 名前 N」の 1 種類に揃えた。
    // 継続 tick 数は title に移った (札ごとに長さが違う形を作らない)。
    await expect(badge).toHaveText('● 継続依頼 2', { timeout: 20000 });
    expect(await badge.getAttribute('title')).toContain('最長 1 tick');

    // reviewer が次の run で指摘.md を上書きする。扱いの括弧しか変わっていないので
    // 依頼としては同じ 2 件で、放置が 1 tick 伸びる。
    fs.writeFileSync(nodePath.join(absOf(RQ_REVIEWER), '指摘.md'), RQ_NOTE_2, 'utf-8');
    await S.openFolderItem(page, 'diagram1');
    await expect(badge).toHaveText('● 継続依頼 2', { timeout: 20000 });
    expect(await badge.getAttribute('title')).toContain('最長 2 tick');
    await expect(badge).toHaveAttribute('data-worst', '2');
    // 2 tick 目に入っても図が動いていない依頼は「未着手」。ここで色が 1 段上がる。
    await expect(badge).toHaveAttribute('data-tone', 'stalled');
    expect((await badge.getAttribute('title')) || '').toContain('[未着手]');

    // 同じ版をもう一度読み直しても、継続 tick 数は伸びない (画面を触った回数ではなく
    // 指摘.md の版の数で放置を測る)。
    await S.openFolderItem(page, 'plantuml-usecase');
    await page.waitForTimeout(1200);
    await expect(badge).toHaveText('● 継続依頼 2');
  });

  test('押せば、その場で依頼の一覧まで届く', async ({ page }) => {
    await expect(page.locator('#status-requests')).toHaveText('● 継続依頼 2', { timeout: 20000 });
    await page.locator('#status-requests').click();
    // 到達条件: 押した先が指摘.md の一覧 (どの reviewer の、どのファイルかまで出る)。
    await page.waitForSelector('#peek-note .note-finding', { timeout: 20000 });
    await expect(page.locator('#peek-note')).toContainText('指摘.md');
    await expect(page.locator('#peek-note')).toContainText('primary への依頼');
  });
});

// BLK-primary-20260914-2106: 起動すると既定のタブ (diagram1) が図種の見本で作られる。
// 画面のバッジは数を出すために saveActiveDoc() を通るので、利用者が 1 文字も
// 打っていないのに見本が diagram1.puml としてディスクへ書かれ、同じ名前で保存して
// あった本物の図 (domain-verdict 宣言行つき) が見本で潰れていた。開き直すたびに
// 再発するので、GUI 経由での SVG 再生成 (stale 解消) ができなくなる。
const VERDICT_DOC = [
  '@startuml',
  "' domain-verdict: reviewed 2026-09-14",
  'title diagram1',
  'participant App',
  'participant Drv',
  'App -> Drv : Init()',
  '@enduml',
].join('\n');

test('手順5.5 保存フォルダの diagram1 は、起動しただけでは見本で潰れない', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'diagram1', VERDICT_DOC);

  // 開き直す = 既定のタブ名 diagram1 でこの画面が立ち上がる場面そのもの。
  await reloadReady(page);
  await page.waitForTimeout(1800);

  // 到達条件その1: 同じ名前の図が保存フォルダにあるなら、タブの中身はその図。
  const shown = await page.locator('#editor').inputValue();
  expect(shown).toContain('domain-verdict');

  // 到達条件その2: 起動しただけで保存フォルダの本体が書き換わらない。
  const onDisk = await S.readDoc(page, DIR, 'diagram1');
  expect(onDisk).toContain('domain-verdict');
  expect(onDisk).not.toContain('Sample Sequence');

  // 到達条件その3: 一覧から開き直しても同じで、そのまま保存しても宣言行は残る
  // (= GUI から SVG を作り直せる)。
  await S.openFolderItem(page, 'diagram1');
  await page.waitForTimeout(600);
  const lock = page.locator('#source-lock-modal');
  if (await lock.isVisible().catch(() => false)) {
    await page.locator('#source-lock-overwrite').click();
    await page.waitForTimeout(600);
  }
  expect(await page.locator('#editor').inputValue()).toContain('domain-verdict');
  // 画面に出ている保存は上部バーの [💾 保存] (#btn-save はツールを畳むと隠れる)。
  await page.locator('#top-save').click();
  await page.waitForTimeout(1500);
  expect(await S.readDoc(page, DIR, 'diagram1')).toContain('domain-verdict');
});

// BLK-primary-20260915-0007-friction: 依頼2 は「クラス図への追加、または意図的省略
// である旨の明記」という二択で来る。前者だけが [適用] だったため、後者を選んだ
// primary は driver_common_class を開き、#editor の末尾へ
// `note top of ClockCtrl : ...(reviewer依頼2への回答)` を全文タイプしていた
// (実測 keys=124、1 手順でキー入力 50 超)。二択のもう一方も押すだけで当たることを
// 到達条件にする。
const INT_ROOT = './test-results/primary-05b-intent';
const INT_MINE = INT_ROOT + '/primary';
const INT_REVIEWER = INT_ROOT + '/reviewer';

const INT_NOTE = [
  '# primary への指摘',
  '',
  '## 【継続・3 tick目】依頼2: メソッド呼び出し先のクラス図欠落',
  '- `ClockCtrl.EnableClock()`(各 init_sequence)',
  '- `NVIC.EnableVector()` `NVIC.SetPriority()`(irq_init_sequence)',
  '- `DmaCtrl.Can_Write()`(can.puml)',
  '対応するクラス図にメソッド宣言がない。クラス図への追加、または',
  '`irq_init_sequence.puml` の note のように意図的省略である旨を明記してほしい。',
].join('\n');

// ClockCtrl / NVIC は宣言済み (note を向けられる)。DmaCtrl は未宣言。
const INT_CLASS = ['@startuml', 'title ドライバ共通クラス図',
  'class ClockCtrl', 'class NVIC',
  'class Timer_Driver {', '  + Timer_Init() : void', '}', '@enduml'].join('\n');

test.describe('手順5.5 二択の指摘は、明記する側も [適用] で当たる', () => {
  test.beforeEach(async ({ page }) => {
    await S.bootWithSaveDir(page, INT_MINE);
    await S.clearDir(page, INT_MINE);
    await S.putDoc(page, INT_MINE, 'driver_common_class', INT_CLASS);
    fs.mkdirSync(absOf(INT_REVIEWER), { recursive: true });
    fs.writeFileSync(nodePath.join(absOf(INT_REVIEWER), '指摘.md'), INT_NOTE, 'utf-8');
    await reloadReady(page);
    await page.waitForSelector('#btn-tab-peek');
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.locator('#peek-note-toggle').click();
    await page.waitForSelector('#peek-note .note-action-row');
  });

  test('二択の指摘の行に、本手と並んで [意図を明記] が出る', async ({ page }) => {
    const row = page.locator('#peek-note .note-action-row[data-note-alt="noteintent"]');
    // 到達条件その1: 二択だと分かる 2 つ目の押し所が、本手を隠さずに並ぶ。
    await expect(row).toHaveAttribute('data-note-alt-ready', '1');
    await expect(row.locator('.note-apply').first()).toBeEnabled();
    const alt = row.locator('.note-apply-alt');
    await expect(alt).toHaveText('意図を明記');
    // 到達条件その2: 押す前に、どのクラスに何が書かれるかが読める。
    await expect(alt).toHaveAttribute('title', /意図を明記: ClockCtrl・NVIC/);
  });

  test('[意図を明記] 1 押しで、note が自分のクラス図のファイルに入る', async ({ page }) => {
    const alt = page.locator('#peek-note .note-action-row[data-note-alt="noteintent"] .note-apply-alt');
    await alt.click();
    // 到達条件その1: 何をどこに書いたかが 1 行で読める。
    await expect(page.locator('#note-summary'))
      .toContainText('意図的省略の note を driver_common_class へ書きました', { timeout: 20000 });

    // 到達条件その2: 画面だけでなく保存フォルダの実体に入っている。
    await expect.poll(async () => (await S.readDoc(page, INT_MINE, 'driver_common_class')) || '',
      { timeout: 15000 }).toContain('note top of ClockCtrl');
    const saved = (await S.readDoc(page, INT_MINE, 'driver_common_class')) || '';
    expect(saved).toContain('EnableClock() の呼び先はクラス図に置かず、意図して省略しています');
    expect(saved).toContain('note top of NVIC : EnableVector()・SetPriority()');
    // 到達条件その3: 宣言の無いクラスには向けない (向けると描画ごと落ちる)。
    expect(saved).not.toContain('note top of DmaCtrl');
    // @enduml の後ろやクラス本体の内側に落ちない。
    expect(saved.trim().endsWith('@enduml')).toBe(true);
  });
});

// BLK-primary-20260916-0100: 指摘の反映で driver_common_class / diagram1 が空洞化し、
// 📂一覧の[版]→[この版に戻す]で直そうとしたが、一覧の版は 20 行とも同じ見た目で並び、
// 新しい方はもう空洞化した後の中身だった。「戻しても直らない」で反映が手詰まりになる。
// どの版に戻せば直るかは行数で分かるので、一覧が戻す先を名指しする。
test.describe('手順5.5 空洞化した図を、戻す先を探さずに戻す', () => {
  const VDIR = S.dirFor(__filename) + '-shrink';
  const NAME = 'driver_common_class';
  const FULL = ['@startuml', 'class Spi_Driver', 'class Can_Driver', 'class DmaCtrl',
    'class ClockCtrl', 'class NVIC', 'Spi_Driver --> DmaCtrl', 'Can_Driver --> DmaCtrl',
    'Spi_Driver --> ClockCtrl', 'Can_Driver --> NVIC', '@enduml'].join('\n');
  const HOLLOW = ['@startuml', 'class Spi_Driver', '@enduml'].join('\n');

  test('[版] の先頭が、いまの行数と戻す先の版を名指しして 1 クリックで戻せる', async ({ page }) => {
    await S.bootWithSaveDir(page, VDIR);
    await S.clearDir(page, VDIR);
    // 充実した版 → 空洞化、の順に保存する (server が上書きの手前で控えを取る)。
    await S.putDoc(page, VDIR, NAME, FULL);
    await S.putDoc(page, VDIR, NAME, HOLLOW);
    await reloadReady(page);
    await page.waitForSelector('#preview-svg');

    await S.openFolder(page);
    const vbtn = page.locator('.folder-versions[data-versions-name="' + NAME + '"]');
    await expect(vbtn).toHaveCount(1);
    await vbtn.click();

    // 到達条件その1: 戻す先が名指しで先頭に出る (20 行の中から当てさせない)。
    const notice = page.locator('.folder-version-shrink[data-version-shrink="' + NAME + '"]');
    await expect(notice).toBeVisible({ timeout: 10000 });
    await expect(notice).toContainText('3 行');   // いまの中身
    await expect(notice).toContainText('11 行');  // 戻す先の版

    // 到達条件その1b (差し戻し 1 回目): その 1 行が画面の中にある。
    // 一覧の行は横に長く、パネルは横にもスクロールする。[履歴] は行の右端にあるので
    // 押すとパネルが右へスクロールし、左端から始まる一覧は画面の外 (実測 x=-62) に出て
    // いた。「名指しが出ない」と差し戻された正体がこれなので、位置で押さえる。
    // BLK-owner-20260923-2312-prune: 版の一覧は保存先一覧の中ではなく「この図の履歴」に出るので、
    // その画面の枠の中にあることを見る。
    const where = await page.evaluate((n) => {
      const panel = document.querySelector('#vt-modal-content');
      const el = document.querySelector('.folder-version-shrink[data-version-shrink="' + n + '"]');
      if (!panel || !el) return null;
      const p = panel.getBoundingClientRect();
      const e = el.getBoundingClientRect();
      return { panelLeft: p.left, left: e.left, right: e.right, panelRight: p.right };
    }, NAME);
    expect(where).not.toBeNull();
    expect(where.left).toBeGreaterThanOrEqual(where.panelLeft - 1);
    expect(where.right).toBeLessThanOrEqual(where.panelRight + 1);

    // 到達条件その2: その 1 クリックで、保存フォルダの実体が充実した版に戻る。
    await notice.locator('.folder-version-shrink-restore').click();
    await page.waitForTimeout(1200);
    // 開いた図への書き戻しなので、一覧から開いたファイルの錠が一度だけ聞く。
    const lock = page.locator('#source-lock-modal');
    if (await lock.isVisible().catch(() => false)) {
      await page.locator('#source-lock-overwrite').click();
      await page.waitForTimeout(800);
    }
    await expect.poll(async () => (await S.readDoc(page, VDIR, NAME)) || '',
      { timeout: 15000 }).toContain('class NVIC');
    const saved = (await S.readDoc(page, VDIR, NAME)) || '';
    expect(saved).toContain('Can_Driver --> DmaCtrl');
    expect(saved).toContain('class ClockCtrl');
  });

  test('空洞化していない図には、戻す先の名指しを出さない', async ({ page }) => {
    const OK = 'adc_ok_class';
    await S.bootWithSaveDir(page, VDIR);
    await S.clearDir(page, VDIR);
    // 1 行だけ足した保存。編集の揺れであって空洞化ではない。
    await S.putDoc(page, VDIR, OK, FULL);
    await S.putDoc(page, VDIR, OK, FULL + '\n');
    await reloadReady(page);
    await page.waitForSelector('#preview-svg');

    await S.openFolder(page);
    const vbtn = page.locator('.folder-versions[data-versions-name="' + OK + '"]');
    await expect(vbtn).toHaveCount(1);
    await vbtn.click();
    await page.waitForSelector('.folder-version-list[data-version-list="' + OK + '"] .folder-version');
    await expect(page.locator('.folder-version-shrink[data-version-shrink="' + OK + '"]')).toHaveCount(0);

    // 差し戻し 1 回目: 名指しが無いだけだと「減っていない」と「機能が動いていない」が
    // 同じ見た目になる (既に戻した後の図で開いて、動いていないと判断された)。
    // 減っていないなら減っていないと言う。
    const status = page.locator('.folder-version-status[data-version-status="' + OK + '"]');
    await expect(status).toBeVisible({ timeout: 10000 });
    await expect(status).toContainText('減っていません');
  });
});

// BLK-primary-20260916-0526-wish: 指摘.md 2番の ClockCtrl ⇔ Clock_Ctrl のような
// 「隣の persona との表記違い」は、reviewer が audit を通しで走らせて指摘.md に
// 書くまで分からなかった (継続 3 tick 目)。📂一覧の「他personaと突合」は押さないと
// 動かないので日常の保存に乗らない。保存したその場で言い切れれば、5.5 は
// 「保存する → 衝突が無いと分かって次へ進む」の 1 画面で閉じる。
test.describe('手順5.5 保存したその場で、隣の persona との部品名衝突が分かる', () => {
  const ROOT = S.dirFor(__filename) + '/clash';
  const MINE = ROOT + '/primary';
  const THEIRS = ROOT + '/junior';

  const seq = (names) => ['@startuml', ...names.map((n) => 'participant ' + n),
    names[0] + ' -> ' + names[0] + ' : Init()', '@enduml'].join('\n');

  // junior 側は Clock_Ctrl を 2 枚で使う (多数派 = 揃える先が相手の綴りになる)。
  async function setup(page, mineDsl) {
    await S.bootWithSaveDir(page, THEIRS);
    await S.clearDir(page, THEIRS);
    await S.putDoc(page, THEIRS, 'clock_state', seq(['Clock_Ctrl']));
    await S.putDoc(page, THEIRS, 'clock_sequence', seq(['Clock_Ctrl']));

    await S.bootWithSaveDir(page, MINE);
    await S.clearDir(page, MINE);
    await S.putDoc(page, MINE, 'spi_init_sequence', mineDsl);
    await S.bootWithSaveDir(page, MINE);
    await page.waitForSelector('#preview-svg');
    await S.openFolderItem(page, 'spi_init_sequence');
    const lock = page.locator('#source-lock-modal');
    if (await lock.isVisible().catch(() => false)) {
      await page.locator('#source-lock-overwrite').click();
      await page.waitForTimeout(800);
    }
  }

  test('保存すると、突合を押さなくても相手と相手の図を名指しする', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await setup(page, seq(['ClockCtrl', 'SpiDrv']));

    // 到達条件その1: 保存しただけで帯が出る (📂一覧の突合ボタンは押していない)。
    await page.locator('#btn-save').dispatchEvent('click');
    const band = page.locator('#save-clash-overlay');
    await expect(band).toBeVisible({ timeout: 60000 });
    await expect(page.locator('#scl-summary')).toContainText('junior');
    await expect(page.locator('#scl-summary')).toContainText('ClockCtrl');

    // 到達条件その2: 相手側の図まで名指しするので、1 枚ずつ開かずに誰に断るかが決まる。
    await expect(page.locator('#scl-list')).toContainText('Clock_Ctrl');
    await expect(page.locator('#scl-list')).toContainText('junior/clock_state');

    // 到達条件その3: その場で揃えられる。対象は開いている図だけ (台本 5.5 の絞り込み)。
    const fix = page.locator('#btn-scl-fix');
    await expect(fix).toBeVisible();
    await expect(fix).toContainText('Clock_Ctrl');
    await fix.click();
    await page.waitForTimeout(800);
    expect(await page.locator('#editor').inputValue()).toContain('Clock_Ctrl');
    expect(await page.locator('#editor').inputValue()).not.toContain('participant ClockCtrl');
    // 相手の図は書き換えない (断りのない変更を作らない)。
    expect(await S.readDoc(page, THEIRS, 'clock_state')).toContain('Clock_Ctrl');

    // 到達条件その4: 揃えて保存し直せば帯が消え、次へ進んでよいと分かる。
    await page.locator('#btn-save').dispatchEvent('click');
    await expect(band).toBeHidden({ timeout: 60000 });
  });

  test('衝突が無ければ帯を出さず、何枚と照合したかを保存の後ろに出す', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await setup(page, seq(['Clock_Ctrl', 'SpiDrv']));

    await page.locator('#btn-save').dispatchEvent('click');
    await expect(page.locator('#status-save-result')).toContainText('照合', { timeout: 60000 });
    await expect(page.locator('#status-save-result')).toContainText('衝突なし');
    await expect(page.locator('#save-clash-overlay')).toBeHidden();
  });
});
