// @ts-check
// junior 台本 手順 1「persona-data\junior の自分の GPIO 図(前周までの最新版)を開く」。
//
// BLK-junior-20260908-2003-wish: 資料化の周は「前周に作った状態遷移図を開く」から
// 始まるのに、その図が実データに残っていないことがある。一覧はファイル名を並べる
// だけなので「GPIO の 8 図種のうち状態遷移だけ無い」は名前を読み比べないと言えず、
// 手順 1 で初めて詰まっていた。棚卸しが、開く前に欠けを名指しすることを確かめる。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor, getEditorText } = require('../helpers');

const DIR = saveDirFor(__filename);
const DSL = '@startuml\nstart\n:初期化する;\nstop\n@enduml';

// junior の保存フォルダの並び。状態遷移図と配置図が無いのが今回の詰まり。
const GPIO = [
  'GPIOドライバユースケース',
  'GPIOドライバコンポーネント構成',
  'GPIOドライバ派生クラス',
  'GPIOドライバ設定オブジェクト',
  'GPIOドライバ初期化シーケンス',
  'GPIOドライバ初期化アクティビティ',
];
const OTHER = ['CANドライバ状態遷移', 'diagram1'];

async function bootWithDir(page) {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page);
}

async function putFile(page, name) {
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl: DSL, dir: DIR });
}

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

async function openFolder(page) {
  // 保存先は既定で開いている (design 10a)。開いていれば畳んでから開き直し、一覧を今の中身で描き直す。
  // BLK-owner-20260924-0637-1: 旧 📂 一覧は保存先の右クリック「保存先の一覧を開く」で中央の枠に開く。
  await require('./_scenario').openFolder(page);
  await page.waitForSelector('#folder-panel.open');
}

test.describe('junior 手順 1: 前周までの最新版を開く', () => {
  test.beforeEach(async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    for (const n of GPIO.concat(OTHER)) await putFile(page, n);
    await page.waitForTimeout(400);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
  });

  // BLK-owner-20260918-0049-prune: 部品 × 6 図種の済/未の表は一覧に出さない。
  // 🧩 部品ビューとその導線は TICKET-owner-20261115-2141-prune で外した。
  test('一覧は棚卸しの表も部品ビューへの導線も持たない', async ({ page }) => {
    await openFolder(page);
    await expect(page.locator('#folder-inv-pick')).toHaveCount(0);
    await expect(page.locator('.folder-inv-row')).toHaveCount(0);
    await expect(page.locator('#folder-board-link')).toHaveCount(0);
  });

});

// BLK-junior-20260909-0303: 新規タブのサンプル (WebApp / IAuth) から書き起こすときの付け替え。
// 無選択の右ペインの「要素名をまとめて付け替え」表は TICKET-owner-20261116-0921-prune で外し、
// 名前を揃える入口は ⇄ 一括置換 (Ctrl+H) の 1 本にした。無選択の右ペインは「末尾に追加」だけになる。
test.describe('junior 手順 1: 実体が無くサンプルから起こす', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      ed.value = '@startuml\ncomponent WebApp\ninterface IAuth\nWebApp -() IAuth\n@enduml';
      ed.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(600);
  });

  test('無選択の右ペインは「末尾に追加」だけで、まとめて付け替えの表も依存チェックも無い', async ({ page }) => {
    await expect(page.locator('#co-tail-kind')).toBeVisible();
    for (const sel of ['#co-rename-list', '#co-rename-apply', '#co-deps-summary', '#co-deps-body']) {
      await expect(page.locator(sel), sel).toHaveCount(0);
    }
    const props = await page.locator('#props-content').innerText();
    expect(props).not.toContain('まとめて付け替え');
    expect(props).not.toContain('依存チェック');
    // 本文は触っていない。
    expect(await getEditorText(page)).toBe('@startuml\ncomponent WebApp\ninterface IAuth\nWebApp -() IAuth\n@enduml');
  });
});

// 以下の手順で使う自分 (junior) と先輩 (primary) の保存先と図。
// 指摘.md の 1 件から並べて見る手順は TICKET-owner-20261115-1840-prune で外した。
const S1 = require('./_scenario');

const NOTE_ROOT = DIR + '-note';
const NOTE_MINE = NOTE_ROOT + '/junior';
const NOTE_SENIOR = NOTE_ROOT + '/primary';
const MINE_SEQ = ['@startuml', 'title GPIO 初期化シーケンス',
  'participant Gpio', 'participant Hw_Ctrl',
  'Gpio -> Hw_Ctrl : Gpio_Init', '@enduml'].join('\n');
const SENIOR_SEQ = ['@startuml', 'title GPIO 初期化シーケンス',
  'participant Gpio_Driver', 'participant Hw_Ctrl', 'participant Nvic',
  'Gpio_Driver -> Hw_Ctrl : Gpio_Init',
  'Gpio_Driver -> Nvic : Gpio_EnableIrq', '@enduml'].join('\n');

// BLK-junior-20260914-0906: 一覧から自分の図を開き直すだけの手順 1 で、
// 「開いたファイルを上書きしますか」が毎回割り込んでいた (過去 run が残した
// -編集中 の控えがあるため錠が ask のまま、開いた直後の自動保存がその問いに当たる)。
// 読むだけの回は何も書かず、本文を変えたら聞かれずにそのファイルへ書く (TICKET-owner-20261115-1829-prune で
// 窓を外した)。残っている -編集中 の控えは普通の図として残し、書き先にしない。
const LOCK_DIR = DIR + '-lock';
const LOCK_DOC = 'GPIOドライバ状態遷移(資料用)';
const LOCK_DSL = ['@startuml', 'title GPIOドライバ状態遷移',
  '[*] --> Uninit', 'Uninit --> Ready : Gpio_Init', '@enduml'].join('\n');

test.describe('junior 手順 1: 開き直すだけの回は錠に止められない', () => {
  test.beforeEach(async ({ page }) => {
    await S1.bootWithSaveDir(page, LOCK_DIR);
    await S1.clearDir(page, LOCK_DIR);
    await S1.putDoc(page, LOCK_DIR, LOCK_DOC, LOCK_DSL);
    // 過去 run のツールが残した控え。これがあると錠は「聞く」のまま残る。
    await S1.putDoc(page, LOCK_DIR, LOCK_DOC + '-編集中', LOCK_DSL);
    await page.reload();
    await page.waitForSelector('#editor');
  });

  test('一覧から開いて眺めるだけなら、上書きの確認は出ない', async ({ page }) => {
    await S1.openFolderItem(page, LOCK_DOC);
    await page.waitForTimeout(1500);
    // 到達条件その1: 開いた本文が出ていて、確認は割り込まない。
    expect(await page.locator('#editor').inputValue()).toContain('Gpio_Init');
    await expect(page.locator('#source-lock-modal')).toHaveCount(0);
    // 到達条件その2: 読むだけの回はファイルを書かない (置いたときのまま)。
    expect(await S1.readDoc(page, LOCK_DIR, LOCK_DOC)).toBe(LOCK_DSL);
  });

  test('本文を変えたら、聞かれずにそのファイルへ書き、-編集中 の控えには書かない', async ({ page }) => {
    await S1.openFolderItem(page, LOCK_DOC);
    await page.waitForTimeout(1200);
    await expect(page.locator('#source-lock-modal')).toHaveCount(0);

    const opened = await page.locator('#editor').inputValue();
    await S1.typeDsl(page, opened.replace('Gpio_Init', 'Gpio_Init2'));
    await expect.poll(async () => (await S1.readDoc(page, LOCK_DIR, LOCK_DOC)) || '', { timeout: 10000 })
      .toContain('Gpio_Init2');
    await expect(page.locator('#source-lock-modal')).toHaveCount(0);
    // 過去の控えは消さず、中身も変えない。
    expect(await S1.readDoc(page, LOCK_DIR, LOCK_DOC + '-編集中')).toBe(LOCK_DSL);
  });
});

// BLK-junior-20260914-1006-wish: 手順 1 の「先輩の該当図を開いて先輩側の詳細を見る」で、
// 先輩は GPIO 単独のクラス図を持たず driver_common_class.puml (共通基底 + 6 ドライバ) に
// まとめている。並べて見る機能はファイル名で対をなすため、名前の違うこの組は自動で並ばず、
// 複合図を開いて Gpio_Driver を目で探すしかなかった (部品が増えるほど探索も増える)。
// 部品名を 1 つ押せば、その所だけが切り出されて自分の図の隣に出ることを到達条件にする。
const SLICE_ROOT = DIR + '-slice';
const SLICE_MINE = SLICE_ROOT + '/junior';
const SLICE_SENIOR = SLICE_ROOT + '/primary';

const SENIOR_COMPOSITE = [
  '@startuml', 'title Driver_Common_Class',
  'class Driver_Common {', '  + Init() : void', '  + DeInit() : void', '}',
  'class Spi_Driver {', '  + Spi_Init() : void', '  + Spi_TransmitDma() : void', '}',
  'class Can_Driver {', '  + Can_Init() : void', '}',
  'class Gpio_Driver {', '  + Gpio_Init() : void', '  + Gpio_Reset() : StatusType',
  '  + Gpio_SetHigh() : void', '  + Gpio_SetLow() : void', '}',
  'class Uart_Driver {', '  + Uart_Init() : void', '}',
  'class IRQCtrl {', '  + EnableIrq() : void', '  + Irq_Init() : void',
  '  + Spi_Ack() : void', '}',
  'Spi_Driver --|> Driver_Common', 'Can_Driver --|> Driver_Common',
  'Gpio_Driver --|> Driver_Common', 'Uart_Driver --|> Driver_Common',
  'Spi_Driver --> IRQCtrl', 'Gpio_Driver --> IRQCtrl', '@enduml',
].join('\n');

// junior 側は GPIO 単独。ファイル名は先輩と対をなさない。
const MINE_CLASS = [
  '@startuml', 'title GpioDrv派生クラス図(資料用)',
  'class Driver_Common {', '  + Init() : void', '  + DeInit() : void', '}',
  'class Gpio {', '  + Gpio_Init() : void', '  + Gpio_Reset() : StatusType', '}',
  'Gpio --|> Driver_Common', '@enduml',
].join('\n');

const SENIOR_SEQ2 = ['@startuml', 'participant Gpio_Driver', 'participant Hw_Ctrl',
  'Gpio_Driver -> Hw_Ctrl : Gpio_Init', '@enduml'].join('\n');


// BLK-junior-20260914-1306-wish: 9 周目の場面は「先輩の図の変更を自分の図に取り込む」。
// 手順 1〜2 で要るのは「先輩のどの 1 枚が前回保存から変わったか」だが、👀他フォルダは
// 名前・図種・SVG の印しか出さないので、複合図 (driver_common_class) を丸ごと開いて
// 目で差分を探し、変わっていない図まで開いて見比べていた。
// 一覧の行が ＋部品 −関係 を言い、変更のある図だけに絞れることを到達条件にする。
const CHG_ROOT = DIR + '-changes';
const CHG_MINE = CHG_ROOT + '/junior';
const CHG_SENIOR = CHG_ROOT + '/primary';

const COMP_V1 = [
  '@startuml', 'title Driver_Common_Class',
  'class Driver_Common {', '  + Init() : void', '}',
  'class Gpio_Driver {', '  + Gpio_Init() : void', '}',
  'class IRQCtrl {', '  + EnableIrq() : void', '}',
  'Gpio_Driver --|> Driver_Common', '@enduml',
].join('\n');
// 先輩が足したもの: 部品 Port_Drv 1 つと、関係 1 本。
const COMP_V2 = [
  '@startuml', 'title Driver_Common_Class',
  'class Driver_Common {', '  + Init() : void', '}',
  'class Gpio_Driver {', '  + Gpio_Init() : void', '}',
  'class IRQCtrl {', '  + EnableIrq() : void', '}',
  'class Port_Drv {', '  + Port_SetMode() : void', '}',
  'Gpio_Driver --|> Driver_Common', 'Gpio_Driver --> Port_Drv', '@enduml',
].join('\n');

const SEQ_V1 = ['@startuml', 'title gpio init',
  'participant Gpio_Driver', 'participant Hw_Ctrl',
  'Gpio_Driver -> Hw_Ctrl : Gpio_Init', '@enduml'].join('\n');
// 題を直しただけ。取り込む中身は無いので「変更あり」と名指ししてはいけない。
const SEQ_V2 = SEQ_V1.replace('title gpio init', 'title GPIO 初期化シーケンス');

// 一度しか保存されていない図。比べる前回が無い。
const STATE_ONLY = ['@startuml', 'title can state', '[*] --> Uninit',
  'Uninit --> Ready : Can_Init', '@enduml'].join('\n');


// BLK-junior-20260914-1806-wish: 手順 1〜2 の「対応要否の確認」は、図種を 1 つずつ担当する
// 進め方だと 6 周にまたがって 1 枚ずつになる (GPIO だけで 9 周目の今も 3 図種目)。
// 題材を選べば 6 図種ぶんの結論がその場で並び、残りの図種も周を待たずに分かる。
const MTX_ROOT = SLICE_ROOT + '-matrix';
const MTX_MINE = MTX_ROOT + '/junior';
const MTX_SENIOR = MTX_ROOT + '/primary';

const MTX_SEQ = ['@startuml', 'participant Gpio_Driver', 'participant Hw_Ctrl',
  'Gpio_Driver -> Hw_Ctrl : Gpio_Init', '@enduml'].join('\n');
const MTX_STATE = ['@startuml', '[*] --> Ready', 'Ready --> Busy : Gpio_Init', '@enduml'].join('\n');
const MTX_CLASS = ['@startuml', 'class Gpio_Driver {', '  + Gpio_Init() : void', '}', '@enduml'].join('\n');
const MTX_COMPONENT = ['@startuml', 'component Gpio_Driver', 'component Hw_Ctrl', '@enduml'].join('\n');


// BLK-junior-20260914-1406-wish: 手順1 は「先輩の該当図を開いて詳細を見る」から始まり、
// 手順2 の「自分の図に反映」との往復になる。👀 他フォルダはモーダルなので自分の図を
// 書く間は閉じることになり、保存先設定を行き来して開き直していた。
// TICKET-owner-20261115-2141-prune: 先輩のフォルダの図を右の枠に据え置いて図の切り替えに追従させる仕組み
// (相手の自動選び・共通図の抜き出し・自分の他部品の見本・部品ビューへの案内) を外したので、
// その手順 (先輩の図を横に置いたまま直す / 見本 / 共通図を部品で絞る) の test を外した。
// 隣のフォルダの図は FILES「読むだけ」節で押した 1 枚を右の枠で読む (junior-1-open-own-diagram)。
// ── BLK-junior-20260915-0307-wish ───────────────────────────────────────
// 16 周目の手順 2 は「下書きは汎用ひな形なので、中身を消して先輩の対応図を手本に
// 打ち直す」。SPI を起こすと 6 図種とも決まった汎用 DSL で埋まるが、先輩 (primary) は
// SPI のシーケンス図を既に持っていて、参加者も並びも汎用ひな形とは違う。
// 手本のある図種は、開いた時点で先輩の実図が入っていることを到達条件にする
// (手順 2 が「打ち直す」から「差分だけ直す」に変わる)。
const REF_ROOT = DIR + '-ref';
const REF_MINE = REF_ROOT + '/junior';
const REF_SENIOR = REF_ROOT + '/primary';

const SENIOR_SPI_SEQ = ['@startuml', 'title SPIREF ドライバ 初期化シーケンス',
  'participant "SPIREF_Driver" as Spi', 'participant "ClockCtrl" as Clk',
  'participant "IRQCtrl" as Irq',
  'Spi -> Clk : EnableClock()', 'Clk --> Spi : Ack',
  'Spi -> Irq : Register()', 'Irq --> Spi : Ack', '@enduml'].join('\n');

// BLK-junior-20260916-0546 (friction): 手順 1 で先輩の driver_common_class を
// 📂 一覧で探したが出てこない。一覧は保存先フォルダだけを見せるので「無い」としか
// 読めず、見るには「保存先」チップから保存先ごと先輩のフォルダに切り替えるしかない。
// だが保存先を動かすと次の「保存」が先輩のフォルダに書き込まれるので、上書き事故を
// 恐れて見るのを諦めていた。到達条件は「保存先を動かさずに、探しているその場から
// 先輩の 1 枚に届く」こと。
const PEEK_ROOT = DIR + '-peekentry';
const PEEK_MINE = PEEK_ROOT + '/junior';
const PEEK_SENIOR = PEEK_ROOT + '/primary';

const PE_MINE_CLASS = ['@startuml', 'class TimerDrv', '@enduml'].join('\n');
const PE_SENIOR_CLASS = [
  '@startuml', 'class Driver_Common', 'class Timer_Driver',
  'Timer_Driver --|> Driver_Common', '@enduml',
].join('\n');


// BLK-junior-20260916-2314: 📂 一覧の絞り込みは部分一致なので、フルネームを打っても同じ接頭辞の
// 「…(資料用)」が一緒に残り、並び次第で資料用を開いてしまう。到達条件は「フルネームを打つと
// 本体が完全一致の印付きで先頭に出て、そのまま押せば本体が開く」こと。
const EXACT_DIR = PEEK_ROOT + '/exact';
const EXACT_BODY = 'TIMERドライバ初期化アクティビティ図';
const EXACT_DOC = EXACT_BODY + '(資料用)';

test.describe('junior 手順 1: フルネームで絞ると本体が資料用より先に出る', () => {
  test.beforeEach(async ({ page }) => {
    await S1.bootWithSaveDir(page, EXACT_DIR);
    await S1.clearDir(page, EXACT_DIR);
    // 資料用を先に置く (名前順・更新順のどちらでも資料用が上に来うる状態)。
    await S1.putDoc(page, EXACT_DIR, EXACT_DOC, '@startuml\nstart\n:資料用;\nstop\n@enduml');
    await S1.putDoc(page, EXACT_DIR, EXACT_BODY, '@startuml\nstart\n:本体;\nstop\n@enduml');
    await page.reload();
    await page.waitForSelector('#btn-tab-folder');
  });

  test('フルネームを打つと完全一致の本体が先頭に印付きで出て、押すと本体が開く (クリック 10 以下・キー入力 50 以下)', async ({ page }) => {
    let clicks = 0;
    let keys = 0;
    await openFolder(page); clicks++;
    await page.waitForSelector('#folder-filter');
    await page.waitForSelector('#folder-panel [data-file-name]');
    await page.waitForTimeout(800);
    await page.locator('#folder-filter').fill(EXACT_BODY); keys += EXACT_BODY.length;
    await page.waitForTimeout(300);

    // 2 枚とも残る (部分一致の行は消さない) が、見えている先頭の行が本体で、完全一致の印が付く。
    const visible = await page.evaluate(() => Array.prototype.filter.call(
      document.querySelectorAll('#folder-panel .folder-item[data-file-name]'),
      (b) => b.offsetParent !== null
    ).map((b) => b.getAttribute('data-file-name')));
    expect(visible.length).toBe(2);
    expect(visible[0].replace(/\.puml$/, '')).toBe(EXACT_BODY);
    expect(visible[1].replace(/\.puml$/, '')).toBe(EXACT_DOC);
    await expect(page.locator('#folder-panel [data-exact="1"]')).toHaveCount(1);

    // 先頭の行を押すと本体が開く。
    await page.locator('#folder-panel [data-exact="1"] .folder-item, #folder-panel .folder-item[data-exact="1"]').first().click(); clicks++;
    await expect.poll(() => getEditorText(page)).toContain(':本体;');
    expect(clicks).toBeLessThanOrEqual(10);
    expect(keys).toBeLessThanOrEqual(50);

    // 絞り込みを外すと、元の並びに戻る (完全一致の印も消える)。
    await openFolder(page);
    await page.waitForSelector('#folder-filter');
    await page.locator('#folder-filter').fill('');
    await page.waitForTimeout(300);
    await expect(page.locator('#folder-panel [data-exact="1"]')).toHaveCount(0);
  });
});
