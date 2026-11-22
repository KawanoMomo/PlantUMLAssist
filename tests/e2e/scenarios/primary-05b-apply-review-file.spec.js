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
// 置換が当たった図だけを書き、見比べのために開いただけの図は書かない、を到達条件にする
// (「元のまま保つ」の窓は TICKET-owner-20261115-1829-prune で外した)。
const LOCK_DIR = DIR + '-lock';

test('手順5.5 見比べのために開いただけの図は、一括置換の後始末でも書き換わらない', async ({ page }) => {
  await S.bootWithSaveDir(page, LOCK_DIR);
  await S.clearDir(page, LOCK_DIR);
  await S.putDoc(page, LOCK_DIR, 'driver_common_class', S.docFor('driver_common_class'));
  await S.putDoc(page, LOCK_DIR, 'can_init_sequence', S.docFor('can_init_sequence'));
  await reloadReady(page);
  await page.waitForSelector('#editor');
  await page.waitForTimeout(600);

  // 見比べ目的で開くだけ (手を入れない)。
  await S.openFolderItem(page, 'driver_common_class');
  const opened = await S.readDoc(page, LOCK_DIR, 'driver_common_class');
  await page.waitForTimeout(1200);
  await expect(page.locator('#source-lock-modal')).toHaveCount(0);

  // 置換が当たる図も開いておく (当たらないと後始末まで進まない)。
  await S.openFolderItem(page, 'can_init_sequence');
  await S.overwriteOpenedFile(page);

  await S.runCommand(page, '一括置換');
  const allDocs = page.locator('#rename-all-docs');
  if (await allDocs.count() && !(await allDocs.isChecked())) await allDocs.check();
  // 置換するのは can_init_sequence にだけある語 (共通クラス図には無い)。窓を外した後は、置換が当たった図は
  // 開いた図でもそのまま書くので、「当たっていない図を書かない」をこの語で見る。
  await page.locator('#rename-from').fill('Hw_Ctrl');
  await page.locator('#rename-to').fill('Hw_Reg');
  await page.waitForTimeout(1200);
  await expect(page.locator('#btn-rename-apply')).toBeEnabled();
  await page.locator('#btn-rename-apply').click();
  await page.waitForTimeout(1800);

  // 到達条件その1: 置換が当たった図には反映される。
  expect(await S.readDoc(page, LOCK_DIR, 'can_init_sequence')).toContain('Hw_Reg');
  // 到達条件その2: 開いただけで置換が当たらなかった図は、後始末でも書き換わらない (中身は置いたときのまま)。
  const kept = await S.readDoc(page, LOCK_DIR, 'driver_common_class');
  expect(kept).toBe(opened);
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
  // 一覧の「一覧を取り直す」(直近の更新の欄) は TICKET-owner-20261116-0241-prune で外した。
  // 裏で一覧が描き直されても版の一覧が閉じないことは、ウィンドウにフォーカスが戻った知らせで確かめる。
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(800);
  await restore.waitFor({ timeout: 10000 });

  // 到達条件 2: 1 クリックで、打ち直し無しに中身が戻る。
  await restore.click();
  await page.waitForTimeout(1200);
  const editor = await page.locator('#editor').inputValue();
  expect(editor).toContain('class Driver_Common {');
  expect(editor).not.toContain('class Foo');

  // 到達条件 3: 保存フォルダの実体も戻っている (画面だけが直った状態にしない)。
  await page.waitForTimeout(1200);
  expect(await S.readDoc(page, DIR, 'driver_common_class')).toContain('class Driver_Common {');

  await S.clearDir(page, DIR);
});

// 保存先の節は既定で開いている (design 10a)。開いていれば畳んでから開き直し、
// 一覧を今の中身で描き直す (直に押すと、開いていたときに畳んでしまう)。
async function openFolder(page) {
  // BLK-owner-20260924-0637-1: 旧 📂 一覧は保存先の右クリック「保存先の一覧を開く」で中央の枠に開く。
  await require('./_scenario').openFolder(page);
  await page.waitForSelector('#folder-panel.open');
}

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
  expect(await page.locator('#editor').inputValue()).toContain('domain-verdict');
  // 画面に出ている保存は上部バーの [💾 保存] (#btn-save はツールを畳むと隠れる)。
  await page.locator('#top-save').click();
  await page.waitForTimeout(1500);
  expect(await S.readDoc(page, DIR, 'diagram1')).toContain('domain-verdict');
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
