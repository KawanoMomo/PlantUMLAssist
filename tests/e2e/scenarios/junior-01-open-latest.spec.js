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

// BLK-junior-20260909-0303: 開こうとした図が実データにも先輩側にも無いときは、
// 新規タブのサンプル (WebApp / IAuth) から書き起こすことになる。その付け替えを
// 要素ごとに「選択 → Alias/Label → 変更を反映 → 関連に追従」で繰り返すと
// クリックが要素数に比例して増えていた (実測 14、基準 10 超)。
// 無選択の右ペインの表で全要素を一度に付け替えられることを確かめる。
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

  test('サンプルの 2 要素が表に並び、まとめて反映 1 回で関連ごと付け替わる', async ({ page }) => {
    const rows = page.locator('#co-rename-list .co-rename-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator('.co-rename-id')).toHaveValue('WebApp');
    await expect(rows.nth(1).locator('.co-rename-id')).toHaveValue('IAuth');

    // クリックは「まとめて反映」の 1 回だけ。欄の移動は Tab で済む。
    await rows.nth(0).locator('.co-rename-id').fill('GpioDrv');
    await rows.nth(0).locator('.co-rename-label').fill('GPIO ドライバ');
    await rows.nth(1).locator('.co-rename-id').fill('IGpio');
    await rows.nth(1).locator('.co-rename-label').fill('GPIO API');
    await page.locator('#co-rename-apply').click();
    await page.waitForTimeout(500);

    const dsl = await getEditorText(page);
    expect(dsl).toContain('component "GPIO ドライバ" as GpioDrv');
    expect(dsl).toContain('interface "GPIO API" as IGpio');
    // Alias 変更が関連 Relation にも追従している (別ボタンを押さなくてよい)。
    expect(dsl).toContain('GpioDrv -() IGpio');
    expect(dsl).not.toContain('WebApp');
  });

  test('付け替えたあとの表は新しい名前で並び直す', async ({ page }) => {
    const rows = page.locator('#co-rename-list .co-rename-row');
    await rows.nth(0).locator('.co-rename-id').fill('GpioDrv');
    await page.locator('#co-rename-apply').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#co-rename-list .co-rename-row').nth(0).locator('.co-rename-id'))
      .toHaveValue('GpioDrv');
  });
});

// BLK-junior-20260909-0403-wish: ユースケース図を起こす周。コンポーネント図には
// 「実際の呼び出し」候補が出るのに、ユースケース図の「末尾に追加」には候補が無く、
// 誰が使うか (アクター) も何をするか (ユースケース) も白紙から考えて一括入力欄に
// 打つしかなかった。同じ部品のシーケンス図から候補が出て、選ぶだけで
// アクター・ユースケース・関連が図に入ることを確かめる。
test.describe('junior 手順 1: シーケンス図からユースケース図を起こす', () => {
  const GPIO_SEQ = [
    '@startuml',
    'actor "開発者" as A1',
    'participant GpioDrv',
    'participant Port_Drv',
    'participant RTOS',
    'A1 -> GpioDrv : Gpio_Init(cfg)',
    'A1 -> GpioDrv : Gpio_WritePin(id, level)',
    'RTOS -> GpioDrv : Gpio_EnableIrq()',
    'GpioDrv -> Port_Drv : Port_SetMode()',
    '@enduml',
  ].join('\n');

  async function typeDsl(page, text) {
    await page.evaluate((t) => {
      const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
      ed.value = t;
      ed.dispatchEvent(new Event('input'));
    }, text);
    await page.waitForTimeout(500);
  }

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
    await gotoApp(page);
    // 先輩の gpio シーケンス図を 1 枚開いておく。
    await page.locator('#diagram-type').selectOption('plantuml-sequence');
    await page.waitForTimeout(500);
    await typeDsl(page, GPIO_SEQ);
    await page.evaluate(() => {
      const ws = window.MA.workspace;
      ws.rename(ws.getActiveId(), 'gpio_init_sequence');
    });
    // 白紙のユースケース図のタブへ。
    await page.locator('#btn-tab-new').click();
    await page.locator('#diagram-type').selectOption('plantuml-usecase');
    await page.waitForTimeout(500);
    await typeDsl(page, '@startuml\n@enduml');
  });

  test('シーケンス図から拾ったアクター・ユースケース候補が理由付きで並ぶ', async ({ page }) => {
    const summary = page.locator('#uc-src-summary');
    await expect(summary).toContainText('アクター候補');
    await expect(summary).toContainText('ユースケース候補');

    const actors = page.locator('#uc-src-actors .uc-src-row');
    await expect(actors.filter({ hasText: '開発者' })).toHaveCount(1);
    await expect(actors.filter({ hasText: 'RTOS' })).toHaveCount(1);
    // 部品自身はアクターにならない。
    await expect(actors.filter({ hasText: 'GpioDrv' })).toHaveCount(0);
    // どの図から来た候補かが出るので、先輩の図を開き直さずに確かめられる。
    await expect(actors.filter({ hasText: '開発者' })).toContainText('gpio_init_sequence');

    const ucs = page.locator('#uc-src-usecases .uc-src-row');
    await expect(ucs.filter({ hasText: 'Gpio_Init()' })).toHaveCount(1);
    await expect(ucs.filter({ hasText: 'Gpio_EnableIrq()' })).toHaveCount(1);
    // 公開 API が先。上から押していける。
    await expect(ucs.first()).toHaveAttribute('data-src-kind', 'usecase');
    await expect(ucs.filter({ hasText: 'Gpio_EnableIrq()' })).toContainText('RTOS');
  });

  test('選んだ候補がアクター・ユースケース・関連になって図に入る', async ({ page }) => {
    await page.locator('#uc-src-actors .uc-src-row').filter({ hasText: 'RTOS' })
      .locator('input').check();
    await page.locator('#uc-src-usecases .uc-src-row').filter({ hasText: 'Gpio_EnableIrq()' })
      .locator('input').check();
    await page.locator('#uc-src-add').click();

    await expect.poll(async () => await getEditorText(page)).toContain('actor RTOS');
    const dsl = await getEditorText(page);
    expect(dsl).toContain('Gpio_EnableIrq()');
    // 呼び出し元も一緒に選んだので関連の線まで引かれる (from/to を選び直さない)。
    expect(dsl).toMatch(/RTOS\s+-->\s+U\d/);

    // 足した分は候補から消える。
    await expect(page.locator('#uc-src-actors .uc-src-row').filter({ hasText: 'RTOS' }))
      .toHaveCount(0);
  });

  test('起点の部品を替えると候補も替わる', async ({ page }) => {
    await expect(page.locator('#uc-src-subject')).toHaveValue('gpio');
    const opts = await page.locator('#uc-src-subject option').allTextContents();
    expect(opts.some((t) => t.indexOf('gpio') >= 0)).toBe(true);
  });
});

// ── BLK-junior-20260913-0206-wish ───────────────────────────────────────
// 新部品を起こす周 (TIMER) の手順 1〜2 は、シーケンス → 状態遷移 → クラス →
// アクティビティ → コンポーネント → ユースケースの 6 図種を、その都度別のタブを
// 新規に開いて別々にやり直していた。下書きを作る機能が図種ごとに別々なので、
// 図種を移るたびにどの機能を使うかを思い出し、部品名を打ち直すことになる。
// 部品名を 1 回打てば 6 図種が同じ名前で揃って開くことを到達条件にする。
// 保存先は専用の親フォルダの下に置く。部品の下書きは保存先の「隣のフォルダ」を先輩の保存先として
// 読み、同じ部品名の実図があればそれを写す。DIR の隣は他の spec の保存先なので、全体実行で
// junior-02-readable が保存した timer_init_sequence (Timer_Driver) が手本として写り込んでいた
// (BLK-builder-20260924-0732-4-red)。隣に誰もいない所で「手本が無い部品」を起こす。
const PART_MINE = DIR + '-part/junior';

// BLK-owner-20260924-2337-prune: 部品を起こす は「既存の図や雛形から新しい図を起こす…」窓の「部品名だけ」。
// 入口は 1 つ (#btn-tab-template)。窓の上端で何から起こすかを選ぶ。
async function openPartStarter(page) {
  await page.locator('#btn-tab-template').click();
  await page.locator('#tpl-kinds .tpl-kind[data-kind="part"]').click();
  await expect(page.locator('#tpl-kinds .tpl-kind[data-kind="part"]')).toHaveAttribute('aria-pressed', 'true');
}

test.describe('junior 手順 1〜2: 手本の無い部品を 1 回の入力で起こす', () => {
  test.beforeEach(async ({ page }) => {
    await S1.bootWithSaveDir(page, PART_MINE);
    await S1.clearDir(page, PART_MINE);
  });

  test.afterEach(async ({ page }) => {
    await S1.clearDir(page, PART_MINE).catch(() => {});
  });

  test('部品名を 1 回打つと、6 図種の下書きが同じ名前で別タブに開く', async ({ page }) => {
    await openPartStarter(page);
    await page.waitForSelector('#part-subject');
    await page.fill('#part-subject', 'TIMER');

    // 到達条件 1: 押す前に、何が何の名前で開くかが 6 行で読める。
    const rows = page.locator('#part-sheets [data-part-row]');
    await expect(rows).toHaveCount(6);
    await expect(page.locator('#part-summary')).toContainText('TIMER_Driver');
    await expect(page.locator('#part-summary')).toContainText('6 図種');
    const names = await page.locator('#part-sheets [data-part-name]').allTextContents();
    expect(names).toEqual(['timer_sequence', 'timer_state', 'timer_class',
      'timer_activity', 'timer_component', 'timer_usecase']);

    // 到達条件 2: 1 回押すだけで 6 図種ぶんのタブが開く (図種ごとのやり直しが無い)。
    await page.locator('#btn-part-create').click();
    await page.waitForTimeout(900);
    const opened = await page.evaluate(() => window.MA.workspace.list()
      .map((d) => ({ name: d.name, type: d.diagramType, dsl: d.dsl })));
    const mine = opened.filter((d) => d.name.indexOf('timer_') === 0);
    expect(mine.map((d) => d.name)).toEqual(['timer_sequence', 'timer_state',
      'timer_class', 'timer_activity', 'timer_component', 'timer_usecase']);
    expect(mine.map((d) => d.type)).toEqual(['plantuml-sequence', 'plantuml-state',
      'plantuml-class', 'plantuml-activity', 'plantuml-component', 'plantuml-usecase']);

    // 到達条件 3: 図種を跨いだ綴りの食い違いが起きない (打ったのは 1 回だから)。
    for (const d of mine) {
      expect(d.dsl).toContain('TIMER');
      expect(d.dsl).not.toContain('Timer');
    }

    // 到達条件 4: どれも白紙ではなく、そのまま描ける DSL になっている。
    const codes = await page.evaluate(async (dsls) => {
      const out = [];
      for (const t of dsls) {
        const r = await fetch('/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: t, mode: 'local' }),
        });
        out.push(r.status);
      }
      return out;
    }, mine.map((d) => d.dsl));
    expect(codes).toEqual([200, 200, 200, 200, 200, 200]);
  });

  // 同じ部品の図を既に開いているタブがあれば、その図種は既定で外す
  // (押し間違えて書きかけを別タブで二重に持つと、どちらを直したか分からなくなる)。
  test('既に開いた図種は 2 度目には開かない側に寄り、選べば作り直せる', async ({ page }) => {
    await openPartStarter(page);
    await page.waitForSelector('#part-subject');
    await page.fill('#part-subject', 'TIMER');
    await page.locator('#btn-part-create').click();
    await page.waitForTimeout(900);

    // 2 度目。6 図種とも「既にあります」になり、何も開かない状態から始まる。
    await openPartStarter(page);
    await page.waitForSelector('#part-subject');
    await page.fill('#part-subject', 'TIMER');
    const had = page.locator('#part-sheets [data-part-had]');
    await expect(had.first()).toContainText('既にあります');
    const boxes = page.locator('#part-sheets input[data-part-kind]');
    expect(await boxes.count()).toBe(6);
    for (let i = 0; i < 6; i++) await expect(boxes.nth(i)).not.toBeChecked();
    await expect(page.locator('#part-summary')).toContainText('6 図種は既にある');
    await expect(page.locator('#btn-part-create')).toBeDisabled();

    // 作り直したければその場で選べる (勝手に外して終わりにしない)。
    await page.locator('#part-sheets [data-part-row="state"] input[data-part-kind]').check();
    await expect(page.locator('#btn-part-create')).toHaveText('1 図種の下書きを開く');
    await expect(page.locator('#btn-part-create')).toBeEnabled();
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
// ⇔ 先輩の図 は据え置きの 2 枠目で、図を切り替えると相手も自動で入れ替わる。
const SENIOR_DIR = DIR + '-senior';
// 先輩のクラス図は部品ごとに分かれておらず、全ドライバが 1 枚に載る
// (persona-data/primary/driver_common_class.puml と同じ形)。
const COMMON_CLASS = [
  '@startuml',
  'title Driver_Common_Class',
  'class Driver_Common {',
  '  + Init() : void',
  '}',
  'class Spi_Driver {',
  '  + Spi_Init() : void',
  '}',
  'class Timer_Driver {',
  '  + Timer_Init() : void',
  '  + Timer_Start() : void',
  '}',
  'class Uart_Driver {',
  '  + Uart_Init() : void',
  '}',
  'class IRQCtrl {',
  '  + EnableIrq() : void',
  '}',
  'Spi_Driver --|> Driver_Common',
  'Timer_Driver --|> Driver_Common',
  'Uart_Driver --|> Driver_Common',
  'Timer_Driver --> IRQCtrl',
  '@enduml',
].join(String.fromCharCode(10));
const SENIOR_BASE = SENIOR_DIR.slice(SENIOR_DIR.lastIndexOf('/') + 1).toLowerCase();

// 自分の図を開く。復元で同名のタブが既にあるならそれへ切り替える
// (rename にすると名前が `-2` に逃げ、同名判定の話にならない)。
async function openMine(page, name) {
  await page.evaluate((n) => {
    const ws = window.MA.workspace;
    const base = (s) => String(s || '').replace(/\.(puml|plantuml)$/i, '');
    const hit = ws.list().filter((d) => base(d.name) === n)[0];
    if (hit) switchToDoc(hit.id); else ws.rename(ws.getActiveId(), n);
    renderTabs();
  }, name);
  await page.waitForTimeout(300);
}

async function clearSenior(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, SENIOR_DIR);
  await page.waitForTimeout(200);
}

async function putIn(page, dir, name) {
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl: DSL, dir });
}

test.describe('junior 手順 1〜2: 先輩の図を横に置いたまま自分の図を直す', () => {
  test.beforeEach(async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await clearSenior(page);
    // 自分と先輩に、フォルダ違いの同名図を 1 枚ずつ置く。同名を「自分自身」と
    // みなして使えなかったのがこの形。前の test の置き土産が残っていると
    // 同じ名前が `-2` に逃げて同名判定が消えるので、先に空にする。
    // 自分側はタブの名前だけで足りる。同じ名前のファイルを自分の保存先にも
    // 置くと、タブの名前が `-2` に逃げて「フォルダ違いの同名」の話にならない。
    await putIn(page, SENIOR_DIR, 'gpio_init_sequence');
    await putIn(page, SENIOR_DIR, 'gpio_state');
    await page.waitForTimeout(400);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
    await clearSenior(page).catch(() => {});
  });

  async function openSenior(page) {
    // 入口はタブ列に出ている。ツールの折りたたみを開かずに 1 クリックで届く。
    await page.locator('#btn-tab-senior').click();
    await page.waitForSelector('#senior-pane:not([hidden])');
    // 並びに出るのは server が返す実パスなので、末尾で見つけて選ぶ。
    // フォルダの一覧は開いたあとに取りに行くので、並ぶまで待つ。
    await page.waitForFunction((base) => {
      const sel = document.getElementById('senior-dir');
      return !!sel && Array.prototype.slice.call(sel.options).some(function(o) {
        return o.value.toLowerCase().split(String.fromCharCode(92)).join('/').indexOf(base) >= 0;
      });
    }, SENIOR_BASE);
    const value = await seniorOptionValue(page);
    await page.selectOption('#senior-dir', value);
    await page.waitForTimeout(800);
    return value;
  }

  async function seniorOptionValue(page) {
    return page.evaluate((base) => {
      const sel = document.getElementById('senior-dir');
      const hit = Array.prototype.slice.call(sel.options).filter(function(o) {
        var v = o.value.toLowerCase().split(String.fromCharCode(92)).join('/');
        return v.indexOf(base) >= 0;
      })[0];
      return hit ? hit.value : '';
    }, SENIOR_BASE);
  }

  test('先輩のフォルダを選ぶと、いま開いている図の相手が横に出たままになる', async ({ page }) => {
    await openMine(page, 'gpio_init_sequence');
    await openSenior(page);

    // 同名でもフォルダが違えば自分自身ではない。
    await expect(page.locator('#senior-notice')).toContainText('gpio_init_sequence');
    await expect(page.locator('#senior-notice')).toContainText('読むだけ');
    // 自分の図は左でそのまま編集できる (モーダルで覆わない)。
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#senior-dsl')).not.toHaveText('');
  });

  test('自分の図を切り替えると、先輩側も同じ図に入れ替わる (保存先は動かさない)', async ({ page }) => {
    await openMine(page, 'gpio_init_sequence');
    await openSenior(page);

    const before = await page.locator('#senior-notice').textContent();
    expect(before).toContain('gpio_init_sequence');

    await openMine(page, 'gpio_state');
    await page.waitForTimeout(800);
    await expect(page.locator('#senior-notice')).toContainText('gpio_state');

    // 保存先は先輩を見ている間も自分のまま (ここが切り替わると手順3 が壊れる)。
    const dir = await page.evaluate(() => window.MA.autoSave.getConfig().fileDir);
    expect(dir).toBe(DIR);
  });

  test('相手のいない図では、先頭の 1 枚を黙って出さずに「無い」と言う', async ({ page }) => {
    await openMine(page, 'adc_state');
    await openSenior(page);
    await expect(page.locator('#senior-notice')).toContainText('当たる相手の図はありません');
    await expect(page.locator('#senior-dsl')).toHaveText('');
  });

  test('開いたままにした枠とフォルダは次に開いたときも残る', async ({ page }) => {
    await openMine(page, 'gpio_init_sequence');
    await openSenior(page);

    const chosen = await seniorOptionValue(page);
    await page.locator('#senior-close').click();
    await expect(page.locator('#senior-pane')).toHaveAttribute('hidden', '');

    // 開き直しても、フォルダを選ぶところからやり直さない。
    await page.locator('#btn-tab-senior').click();
    await page.waitForSelector('#senior-pane:not([hidden])');
    await page.waitForTimeout(800);
    await expect(page.locator('#senior-dir')).toHaveValue(chosen);
    await expect(page.locator('#senior-notice')).toContainText('gpio_init_sequence');
  });


  // BLK-junior-20260914-2206-wish: 手順1 で先輩の粒度に合わせたいのはクラス図も同じだが、
  // 先輩のクラス図は全ドライバ共通の 1 枚 (driver_common_class) で、部品名で 1:1 に
  // 引けないため「👀 先輩」は常に「−」だった。共通図から自分の部品の所だけを抜き出す。
  test('先輩の共通クラス図から、自分の部品の所だけが横に出る', async ({ page }) => {
    await page.evaluate(async (a) => {
      await fetch('/autosave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'driver_common_class', dir: a.dir, dsl: a.dsl }),
      });
    }, { dir: SENIOR_DIR, dsl: COMMON_CLASS });
    await page.waitForTimeout(300);

    await openMine(page, 'TimerDrv派生クラス図');
    await openSenior(page);

    // 到達条件その1: 「−」ではなく、共通図のどの部分が出るかが読める。
    await expect(page.locator('#senior-notice')).toContainText('driver_common_class');
    await expect(page.locator('#senior-notice')).toContainText('timer');

    // 到達条件その2: 自分の部品と、その親クラス・繋がる相手だけが出ている。
    const dsl = page.locator('#senior-dsl');
    await expect(dsl).toContainText('Timer_Driver');
    await expect(dsl).toContainText('Driver_Common');
    await expect(dsl).not.toContainText('Spi_Driver');
    await expect(dsl).not.toContainText('Uart_Driver');
    // 先輩のメソッドはそのまま残る (粒度・命名を合わせるのが手順1 の的)。
    await expect(dsl).toContainText('Timer_Start');

    // 到達条件その3: 部品名を打ち替えれば、その部品の所が浮かぶ。
    await page.fill('#senior-slice-key', 'spi');
    await page.waitForTimeout(800);
    await expect(dsl).toContainText('Spi_Driver');
    await expect(dsl).not.toContainText('Timer_Driver');

    // 到達条件その4: 共通図の全体にも戻せる (抜き出しで隠れた所を確かめられる)。
    await page.locator('#senior-slice-mode').click();
    await page.waitForTimeout(800);
    await expect(dsl).toContainText('Timer_Driver');
    await expect(dsl).toContainText('Uart_Driver');

    // 先輩のファイルは読むだけ (抜き出しても元は変わらない)。
    const raw = await page.evaluate(async (a) => {
      const r = await fetch('/autosave?dir=' + encodeURIComponent(a.dir)
        + '&type=' + encodeURIComponent('driver_common_class'));
      return await r.text();
    }, { dir: SENIOR_DIR });
    expect(raw).toContain('Uart_Driver');
  });
});


// BLK-junior-20260915-0007-wish: 先輩 (primary) が 1 枚も持たない図種がある
// (アクティビティ図)。先輩の枠は 4 段のどれにも当たらず「当たる先輩の図は
// ありません」で止まり、手順 1 の「粒度と命名の手本を見る」相手が絶えていた。
// junior 自身は GPIO/UART/CAN で同じ図種を作り終えているので、その 1 枚を
// 見本として代わりに横に出す。
test.describe('junior 手順 1: 先輩が持たない図種では自分の他部品を見本にする', () => {
  // 自分の保存フォルダ。他部品の完成形 (GPIO/CAN のアクティビティ図) が並ぶ。
  const MINE_ACT = 'TIMERドライバ初期化アクティビティ図';
  const PEERS = ['GPIOドライバ初期化アクティビティ図', 'CANドライバ初期化アクティビティ図'];
  // 写し (資料用) は見本に出さない。同じ図が 2 枚並ぶだけになる。
  const COPY = 'GPIOドライバ初期化アクティビティ図(資料用)';

  test.beforeEach(async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await clearSenior(page);
    // 先輩はシーケンスと状態遷移しか持たない (アクティビティ図が無い)。
    await putIn(page, SENIOR_DIR, 'gpio_init_sequence');
    await putIn(page, SENIOR_DIR, 'gpio_state');
    for (const n of PEERS) await putIn(page, DIR, n);
    await putIn(page, DIR, COPY);
    // 自分のフォルダの並びは開いた時点の物を使うので、置いてから開き直す。
    await page.reload();
    await page.waitForTimeout(600);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
    await clearSenior(page).catch(() => {});
  });

  // 先輩の枠を開いて先輩フォルダを選ぶ (上の describe と同じ手順)。
  async function pickSeniorValue(page) {
    return page.evaluate((base) => {
      const sel = document.getElementById('senior-dir');
      const hit = Array.prototype.slice.call(sel.options).filter(function(o) {
        var v = o.value.toLowerCase().split(String.fromCharCode(92)).join('/');
        return v.indexOf(base) >= 0;
      })[0];
      return hit ? hit.value : '';
    }, SENIOR_BASE);
  }

  async function openSenior(page) {
    await page.locator('#btn-tab-senior').click();
    await page.waitForSelector('#senior-pane:not([hidden])');
    await page.waitForFunction((base) => {
      const sel = document.getElementById('senior-dir');
      return !!sel && Array.prototype.slice.call(sel.options).some(function(o) {
        return o.value.toLowerCase().split(String.fromCharCode(92)).join('/').indexOf(base) >= 0;
      });
    }, SENIOR_BASE);
    await page.selectOption('#senior-dir', await pickSeniorValue(page));
    await page.waitForTimeout(800);
  }

  test('先輩にその図種が無ければ、自分の他部品の同じ図種が見本として横に出る', async ({ page }) => {
    await openMine(page, MINE_ACT);
    await openSenior(page);
    await page.waitForTimeout(600);

    const notice = page.locator('#senior-notice');
    // 先輩がいないことを隠さない (横の図を先輩の図と読み違えない)。
    await expect(notice).toContainText('当たる相手の図はありません');
    await expect(notice).toContainText('見本');
    await expect(notice).toContainText('読むだけ');
    // 出るのは自分の他部品 (TIMER ではない) の同じ図種。
    // 前半には自分の図の名前が出る (先輩がいない理由) ので、後半だけを見る。
    const shown = (await notice.textContent()).split('代わりに自分の')[1] || '';
    expect(shown).toContain('ドライバ初期化アクティビティ図');
    expect(shown).not.toContain('TIMER');
    // 本文が空のまま「見本」と言わない (読める中身が横に出ている)。
    await expect(page.locator('#senior-dsl')).not.toHaveText('');
    await expect(page.locator('#senior-dsl')).toContainText('@startuml');
  });

  test('写し (資料用) は見本にしない。部品ごとに 1 枚だけ候補に並ぶ', async ({ page }) => {
    await openMine(page, MINE_ACT);
    await openSenior(page);
    await page.waitForTimeout(600);

    const names = await page.evaluate(() => {
      return Array.prototype.slice.call(document.querySelectorAll('#senior-candidates button'))
        .map((b) => b.textContent);
    });
    expect(names.length).toBe(2);           // GPIO と CAN の 2 部品
    expect(names.join('|')).not.toContain('資料用');
  });


  test('見本では、共通図用の「部品」欄を出さない (押しても効かない欄になる)', async ({ page }) => {
    await openMine(page, MINE_ACT);
    await openSenior(page);
    await page.waitForTimeout(600);
    await expect(page.locator('#senior-slice')).toBeHidden();
  });

  test('先輩に相手がいる図種では、見本ではなく先輩の図を出す', async ({ page }) => {
    await openMine(page, 'gpio_state');
    await openSenior(page);
    await page.waitForTimeout(600);
    const notice = page.locator('#senior-notice');
    await expect(notice).toContainText('gpio_state');
    await expect(notice).not.toContainText('見本');
  });
});

// ── BLK-junior-20260924-0704-wish / BLK-junior-20260923-2012 ─────────────────
// ADC 一巡では、クラス図・コンポーネント図・アクティビティ図・ユースケース図の 4 図種で
// 「並べて比較」が先輩の図を出さず、そのたび 👀 他フォルダから共通図を開いて部品で絞る
// 迂回をしていた。同じ部品の別図種 (timer_init_sequence / timer_state) があると
// 共通図まで降りず、自分の見本図が相手の枠に出ていた。ここでは
//   - 同じ図種が部品名で引けなければ、共通図を部品で絞って出す (見本に差し替えない)
//   - 共通図も無ければ枚数つきで言い切り、その行から 🧩 部品ビューを同じ部品で開ける
//   - 部品ビューの先輩欄は、共通の図を部品で絞って出典を 1 行で言う
//   - Ctrl+K の「部品パック」でも部品ビューが開く
// を手順 1 の到達条件にする。
test.describe('junior 手順 1: 相手の図が無い図種は、共通図を部品で絞るか部品ビューへ案内する', () => {
  const NL = String.fromCharCode(10);
  const SEQ = ['@startuml', 'participant Timer_Driver', 'Timer_Driver -> IRQCtrl : Timer_Init()', '@enduml'].join(NL);
  const ST = ['@startuml', '[*] --> Idle', 'Idle --> Running : Timer_Start', '@enduml'].join(NL);
  const UC = ['@startuml', 'actor App', 'App --> (Spi を使う)', '@enduml'].join(NL);

  async function putDsl(page, dir, name, dsl) {
    await page.evaluate(async (a) => {
      await fetch('/autosave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
      });
    }, { name, dsl, dir });
  }

  test.beforeEach(async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await clearSenior(page);
    // 先輩は TIMER のシーケンス・状態遷移を部品名で持ち、クラス図は全ドライバ共通の 1 枚。
    // ユースケース図は SPI の 1 枚だけ (TIMER のものも共通のものも無い)。
    await putDsl(page, SENIOR_DIR, 'timer_init_sequence', SEQ);
    await putDsl(page, SENIOR_DIR, 'timer_state', ST);
    await putDsl(page, SENIOR_DIR, 'driver_common_class', COMMON_CLASS);
    await putDsl(page, SENIOR_DIR, 'spi_usecase', UC);
    // 自分には別部品のユースケース図がある (見本に差し替えられる材料を置いておく)。
    await putDsl(page, DIR, 'gpio_usecase', UC);
    await page.reload();
    await page.waitForTimeout(600);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
    await clearSenior(page).catch(() => {});
  });

  async function openSenior(page) {
    await page.locator('#btn-tab-senior').click();
    await page.waitForSelector('#senior-pane:not([hidden])');
    await page.waitForFunction((base) => {
      const sel = document.getElementById('senior-dir');
      return !!sel && Array.prototype.slice.call(sel.options).some(function(o) {
        return o.value.toLowerCase().split(String.fromCharCode(92)).join('/').indexOf(base) >= 0;
      });
    }, SENIOR_BASE);
    const v = await page.evaluate((base) => {
      const sel = document.getElementById('senior-dir');
      const hit = Array.prototype.slice.call(sel.options).filter(function(o) {
        return o.value.toLowerCase().split(String.fromCharCode(92)).join('/').indexOf(base) >= 0;
      })[0];
      return hit ? hit.value : '';
    }, SENIOR_BASE);
    await page.selectOption('#senior-dir', v);
    await page.waitForTimeout(800);
  }

  test('同じ部品の別図種しか無くても、クラス図は共通図を部品で絞って出し、自分の見本に差し替えない', async ({ page }) => {
    await openMine(page, 'timer_class');
    await openSenior(page);
    const notice = page.locator('#senior-notice');
    await expect(notice).toContainText('driver_common_class');
    await expect(notice).not.toContainText('見本');
    await expect(page.locator('#senior-dsl')).toContainText('Timer_Driver');
    await expect(page.locator('#senior-dsl')).not.toContainText('Uart_Driver');
  });


});

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

test.describe('junior 手順 2: 先輩の実図を手本に新部品を起こす', () => {
  test.beforeEach(async ({ page }) => {
    await S1.bootWithSaveDir(page, REF_MINE);
    await S1.clearDir(page, REF_MINE);
    await S1.clearDir(page, REF_SENIOR);
    await S1.putDoc(page, REF_SENIOR, 'spiref_init_sequence', SENIOR_SPI_SEQ);
    await page.reload();
    await page.waitForSelector('#btn-tab-template');
  });

  test.afterEach(async ({ page }) => {
    await S1.clearDir(page, REF_MINE).catch(() => {});
    await S1.clearDir(page, REF_SENIOR).catch(() => {});
  });

  test('先輩に同じ部品名の実図がある図種は、下書きがその実図で開く', async ({ page }) => {
    await openPartStarter(page);
    await page.waitForSelector('#part-subject');
    await page.fill('#part-subject', 'SPIREF');

    // 到達条件 1: 押す前に「どの図種が先輩の実図で、どれがひな形か」が読める。
    const srcSeq = page.locator('#part-sheets [data-part-src="sequence"]');
    await expect(srcSeq).toContainText('primary / spiref_init_sequence');
    await expect(page.locator('#part-summary')).toContainText('1 図種は先輩の実図を写します');
    await expect(page.locator('#part-sheets [data-part-src="state"]')).toHaveText('');

    // 到達条件 2: 開いた下書きの中身が先輩の実図そのもの (打ち直しが要らない)。
    await page.locator('#btn-part-create').click();
    await page.waitForTimeout(900);
    const opened = await page.evaluate(() => window.MA.workspace.list()
      .map((d) => ({ name: d.name, dsl: d.dsl })));
    const seq = opened.find((d) => d.name === 'spiref_sequence');
    expect(seq).toBeTruthy();
    expect(seq.dsl).toContain('ClockCtrl');
    expect(seq.dsl).toContain('IRQCtrl');
    expect(seq.dsl).toContain('Ack');
    // 汎用ひな形の並びは入っていない (消してから打ち直す工程が消える)。
    expect(seq.dsl).not.toContain('SPIREF_IrqNotify');

    // 到達条件 3: 手本の無い図種は今までどおりひな形で開く (欠けない)。
    const state = opened.find((d) => d.name === 'spiref_state');
    expect(state).toBeTruthy();
    expect(state.dsl).toContain('SPIREF_Init');

    // 名前は自分の名前のまま。先輩のファイル名にはならない。
    expect(opened.some((d) => d.name === 'spiref_init_sequence')).toBe(false);
  });
});

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
