// @ts-check
// junior 台本 手順2: 新規タブに先輩の図の構成を真似て一から入力し、
// タイトル・要素名が読める内容か確認する(読みにくければ先に GUI 上で直す)。
const { test, expect } = require('@playwright/test');
const { setDiagramTitle, getEditorText } = require('../helpers');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

// BLK-junior-20260909-0603-wish: 手本は `persona-data\primary` にあり、自分のタブに
// 無い。覗く画面は全面のモーダルなので、開くと書きかけが見えず、閉じると手本が
// 消える。手本と書きかけが同時に見えて、足りない状態・遷移が色で出ることを確かめる。
// 覗ける相手は「隣り合うフォルダ」なので、この 2 件だけが隣になる場所を使う。
const PEEK_ROOT = DIR + '-peek';
const MINE_DIR = PEEK_ROOT + '/junior';
const SENIOR_DIR = PEEK_ROOT + '/primary';

// 先輩の TIMER 状態遷移図 (手本)。自分の書きかけには Halted と 2 本の遷移が無い。
const SENIOR_STATE = [
  '@startuml',
  'title TIMERドライバ状態遷移',
  '[*] --> Uninit',
  'Uninit --> Ready : Timer_Init',
  'Ready --> Running : Timer_Start',
  'Running --> Ready : Timer_Stop',
  'Running --> Halted : Timer_Fault',
  'Halted --> Uninit : Timer_DeInit',
  '@enduml',
].join('\n');

const MINE_STATE = [
  '@startuml',
  'title TIMERドライバ状態遷移',
  '[*] --> Uninit',
  'Uninit --> Ready : Timer_Init',
  'Ready --> Running : Timer_Start',
  '@enduml',
].join('\n');

test('手順2 タイトルと要素名が読め、読みにくければ GUI で直せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, S.GPIO_STATE);
  await page.waitForTimeout(1500);

  // 到達条件その1: 描かれた図にタイトルと状態名が文字として出る。
  const svg = await page.locator('#preview-svg').innerHTML();
  expect(svg).toContain('Ready');

  // 到達条件その2: 読みにくいタイトルを GUI(図の設定)から直せる。
  await setDiagramTitle(page, 'GPIOドライバ 状態遷移');
  expect(await page.locator('#editor').inputValue()).toContain('title GPIOドライバ 状態遷移');
});

// BLK-junior-20260906-2143: 先輩の図を真似て白紙から起こす所で、参加者 5・
// メッセージ 6 を「末尾に追加」で作るとフォームを 11 回開くことになり、
// 逃げ道の「一括 (複数行)」は矢印構文ごと打たせるので DSL を直に打つのと
// 手数が変わらなかった。名前と本文だけを埋めれば宣言と矢印は自動で付く。
test('手順2 先輩の構成(参加者5・メッセージ6)を名前と本文だけで一から起こせる', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#preview-svg', { timeout: 5000 });
  await page.locator('#diagram-type').selectOption('plantuml-sequence');
  await page.waitForTimeout(500);

  await page.locator('#seq-scaffold-open').click();
  await expect(page.locator('#seq-sc-modal')).toBeVisible();

  await page.locator('#seq-sc-title').fill('TIMERドライバ初期化シーケンス');
  const parts = [
    ['actor', 'Dev'],
    ['participant', 'TIMERドライバ'],
    ['participant', 'Mcu_Clock'],
    ['participant', 'Timer_Hw'],
  ];
  for (let i = 0; i < parts.length; i++) {
    await page.locator('#seq-sc-ptype-' + i).selectOption(parts[i][0]);
    await page.locator('#seq-sc-pname-' + i).fill(parts[i][1]);
  }
  // 4 行では足りないので 1 行足す(先輩の図は参加者 5)。
  await page.locator('#seq-sc-add-row').click();
  await page.locator('#seq-sc-pname-4').fill('Det');

  const msgs = [
    ['Dev', 'sync', 'TIMERドライバ', 'Timer_Init(cfg)'],
    ['TIMERドライバ', 'sync', 'Mcu_Clock', 'Mcu_EnableClock()'],
    ['Mcu_Clock', 'reply', 'TIMERドライバ', 'E_OK'],
    ['TIMERドライバ', 'sync', 'Timer_Hw', 'setPrescaler()'],
  ];
  for (let j = 0; j < msgs.length; j++) {
    await page.locator('#seq-sc-mfrom-' + j).selectOption(msgs[j][0]);
    await page.locator('#seq-sc-marrow-' + j).selectOption(msgs[j][1]);
    await page.locator('#seq-sc-mto-' + j).selectOption(msgs[j][2]);
    await page.locator('#seq-sc-mtext-' + j).fill(msgs[j][3]);
  }
  await page.locator('#seq-sc-add-msg').click();
  await page.locator('#seq-sc-mfrom-4').selectOption('TIMERドライバ');
  await page.locator('#seq-sc-mto-4').selectOption('Det');
  await page.locator('#seq-sc-mtext-4').fill('Det_ReportError()');
  await page.locator('#seq-sc-add-msg').click();
  await page.locator('#seq-sc-mfrom-5').selectOption('TIMERドライバ');
  await page.locator('#seq-sc-marrow-5').selectOption('reply');
  await page.locator('#seq-sc-mto-5').selectOption('Dev');
  await page.locator('#seq-sc-mtext-5').fill('E_OK');

  // 到達条件その1: 確定前に「追加される行」で先輩の構成と見比べられる。
  const preview = await page.locator('#seq-sc-preview').textContent();
  expect(preview).toContain('Dev -> P1 : Timer_Init(cfg)');

  await page.locator('#seq-sc-confirm').click();
  await page.waitForTimeout(400);

  // 到達条件その2: 宣言 5 行と矢印 6 本が 1 回の確定で入り、構文は打っていない。
  const t = await getEditorText(page);
  expect(t).toContain('title TIMERドライバ初期化シーケンス');
  expect(t).toContain('actor Dev');
  expect(t).toContain('participant "TIMERドライバ" as P1');
  expect(t).toContain('participant Mcu_Clock');
  expect(t).toContain('participant Timer_Hw');
  expect(t).toContain('participant Det');
  expect(t).toContain('Dev -> P1 : Timer_Init(cfg)');
  expect(t).toContain('P1 -> Mcu_Clock : Mcu_EnableClock()');
  expect(t).toContain('Mcu_Clock --> P1 : E_OK');
  expect(t).toContain('P1 -> Timer_Hw : setPrescaler()');
  expect(t).toContain('P1 -> Det : Det_ReportError()');
  expect(t).toContain('P1 --> Dev : E_OK');
});

// BLK-junior-20260909-0603-wish: 手本を「見て → 閉じて → 記憶で打つ」の往復をなくす。
// 覗いたその 1 枚を閉じずに書きかけの右へ据え、足りない状態・遷移を色で出す。
test('手順2 先輩の図を手本として右に据えたまま、自分に無い状態・遷移が色で分かる', async ({ page }) => {
  await S.bootWithSaveDir(page, MINE_DIR);
  await S.clearDir(page, MINE_DIR);
  await S.clearDir(page, SENIOR_DIR);
  await S.putDoc(page, SENIOR_DIR, 'timer_state', SENIOR_STATE);
  await page.reload();
  await page.waitForSelector('#btn-tab-peek');

  // 書きかけ (手順 2 の途中。手本の 5 遷移のうち 2 本しか打てていない)。
  await S.typeDsl(page, MINE_STATE);

  // 手本を覗いて、そのまま右に据える。
  await page.locator('#btn-tab-peek').click();
  await page.waitForSelector('#peek-modal');
  await page.locator('.peek-file[data-file-name="timer_state"]').click();
  await expect(page.locator('#peek-compare')).toBeEnabled();
  await page.locator('#peek-compare').click();

  // 到達条件その1: 覗く画面は閉じ、書きかけを見たまま手本が右に並ぶ。
  await expect(page.locator('#peek-modal')).toBeHidden();
  await expect(page.locator('#compare-pane')).toBeVisible();
  await expect(page.locator('#compare-select option[data-peek="1"]')).toHaveText('primary / timer_state');
  expect(await page.locator('#compare-select').inputValue()).toBe('@peek');
  expect(await getEditorText(page)).toContain('Timer_Start');   // 自分の図はそのまま

  // 到達条件その2: 対応表が押さずに出ており、手本にしかない状態・遷移が
  // 「参照図だけ」として並ぶ (Halted / Timer_Fault / Timer_Stop / Timer_DeInit)。
  await expect(page.locator('#map-list')).toBeVisible();
  const refOnly = page.locator('#map-list .map-row[data-map-match="ref-only"]');
  await expect(refOnly.filter({ hasText: 'Halted' }).first()).toBeVisible();
  await expect(refOnly.filter({ hasText: 'Timer_Fault' }).first()).toBeVisible();
  // 両方にある遷移は「参照図だけ」に混ざらない。
  await expect(refOnly.filter({ hasText: 'Timer_Init' })).toHaveCount(0);

  // 到達条件その3: 据えたのは読むだけで、先輩のファイルも自分の保存先も動かない。
  expect(await S.readDoc(page, SENIOR_DIR, 'timer_state')).toBe(SENIOR_STATE);
  await expect(page.locator('#compare-status')).toHaveText(/手本 primary \(読むだけ\)/, { timeout: 30000 });
});

// BLK-junior-20260909-0703-wish: クラス図の手順 2。先輩の共通クラス図 (親 + 派生 +
// 周辺クラス) を手本に TimerDrv 派生クラス図を起こすとき、親の宣言・メンバ・
// IRQCtrl への関連を「見て覚えて打ち直す」しかなかった。親を選んだまま派生を
// 1 つ起こせて、親の関連も「同じ関連を引く」で選べることを確かめる。
const COMMON_CLASS = [
  '@startuml',
  'title ドライバ共通クラス図',
  'abstract class Driver_Common {',
  '  +Init() : void',
  '  +Write(d) : void',
  '  -state : int',
  '}',
  'class Spi_Driver {',
  '  +Transmit() : void',
  '}',
  'class IRQCtrl',
  'Driver_Common <|-- Spi_Driver',
  'Driver_Common --> IRQCtrl : uses',
  '@enduml',
].join('\n');

async function clickOverlay(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector('#overlay-layer ' + sel);
    if (!el) throw new Error(sel + ' が overlay に無い');
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, selector);
  await page.waitForTimeout(400);
}

test('手順2 手本の親から派生クラスを 1 つ起こし、親の関連も同じものを引ける', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(400);
  await S.typeDsl(page, COMMON_CLASS);
  await page.waitForTimeout(2000);

  // 手本の親を選ぶ → 「この親から派生を 1 つ作る」。
  await clickOverlay(page, 'rect[data-id="Driver_Common"]');
  await page.locator('#cl-derive-open').click();
  await expect(page.locator('#cl-sc-modal')).toBeVisible();

  // 到達条件その1: 親の宣言とメンバが引き継がれた状態で開く (打ち直さない)。
  await expect(page.locator('#cl-dv-parent')).toContainText('abstract class Driver_Common');
  expect(await page.locator('#cl-dv-members').inputValue())
    .toBe('+Init() : void\n+Write(d) : void\n-state : int');

  // 到達条件その2: 親が引いている関連が「同じ関連を引く」として出ている。
  await expect(page.locator('#cl-dv-rels')).toContainText('(派生) --> IRQCtrl : uses');
  await expect(page.locator('#cl-dv-rel-0')).toBeChecked();

  // 埋めるのは名前と固有メンバだけ。
  await page.locator('#cl-dv-name').fill('Timer_Driver');
  await page.locator('#cl-dv-members').fill('+Init() : void\n+Start(us) : void');
  await expect(page.locator('#cl-dv-preview')).toContainText('Driver_Common <|-- Timer_Driver');
  await page.locator('#cl-dv-confirm').click();
  await page.waitForTimeout(800);

  // 到達条件その3: 派生の宣言・メンバ・継承・同じ関連が 1 回の確定で入る。
  const t = await getEditorText(page);
  expect(t).toContain('class Timer_Driver {');
  expect(t).toContain('  +Start(us) : void');
  expect(t).toContain('Driver_Common <|-- Timer_Driver');
  // 手本の矢印の種類 (-->) がそのまま引き継がれる
  expect(t).toContain('Timer_Driver --> IRQCtrl : uses');
  // 手本の行は 1 つも書き換わらない
  expect(t).toContain('Driver_Common <|-- Spi_Driver');
  expect(t).toContain('  +Transmit() : void');
});

test('手順2 手本の矢印から、種類を選び直さずに同じ関連を引ける', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(400);
  await S.typeDsl(page, COMMON_CLASS);
  await page.waitForTimeout(2000);

  // 手本の `Driver_Common --> IRQCtrl : uses` を選ぶ。
  await clickOverlay(page, 'rect[data-type="relation"][data-line="13"]');
  await page.locator('#cl-rel-same').click();
  await expect(page.locator('#cl-sc-modal')).toBeVisible();

  // 到達条件その1: 種類はこの矢印のまま示され、選び直す欄が無い。
  await expect(page.locator('#cl-sr-kind')).toContainText('-->');

  // 元を派生側に差し替えるだけで、同じ関連がもう 1 本引ける。
  await page.locator('#cl-sr-from').selectOption('Spi_Driver');
  await expect(page.locator('#cl-sr-preview')).toContainText('Spi_Driver --> IRQCtrl : uses');
  await page.locator('#cl-sr-confirm').click();
  await page.waitForTimeout(800);

  // 到達条件その2: 矢印の記法もラベルも手本のままの行が 1 本増える。
  const t = await getEditorText(page);
  expect(t).toContain('Spi_Driver --> IRQCtrl : uses');
  expect(t).toContain('Driver_Common --> IRQCtrl : uses');
});

// BLK-junior-20260912-2103-wish: 手順 2 で先輩の図の構成をそのまま持ち込むと、
// `actor` を持ち、ラベルに括弧の付くシーケンスは本文判定でユースケースに倒れる。
// 保存した図種を控えておき、一覧の行に印として出し、そのまま開けることを守る。
const KIND_SEQ = [
  '@startuml',
  'title TIMERドライバ初期化シーケンス',
  'actor Dev',
  'participant Timer_Driver',
  'Dev -> Timer_Driver : Timer_Init(cfg)',
  'Timer_Driver --> Dev : E_OK',
  '@enduml',
].join('\n');

test('手順2 保存した図種の印が一覧に出て、押すとその図種のまま開く', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);

  // 先輩の構成を真似た「紛らわしい書き方」のシーケンスを、図種を選んで保存する。
  await page.locator('#diagram-type').selectOption('plantuml-sequence');
  await page.waitForTimeout(300);
  await S.typeDsl(page, KIND_SEQ);
  await S.renameActive(page, 'timer_init_sequence');
  await S.runCommand(page, 'ファイルを保存');
  await page.waitForTimeout(1200);

  // 守るのは「本文の判定がどう転んでも、保存した図種のまま開く」こと。
  // BLK-builder-20260912-2103 で本文判定自体が parserUtils に寄って、この書き方は
  // シーケンスと判定できるようになったので、判定結果を固定する書き方はやめる
  // (判定が良くなるたびにこの spec が赤くなる)。
  const guess = await page.evaluate((t) => window.MA.workspace.detectType(t), KIND_SEQ);
  expect(typeof guess).toBe('string');

  // 別の図種の図に移って、今の図種をシーケンス以外にしておく。
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(400);

  // 到達条件その1: 一覧の行に「前回保存した図種」の印が出る。
  await page.locator('#btn-tab-folder').click();
  await page.waitForTimeout(800);
  const badge = page.locator('#folder-panel .folder-kind[data-kind-of="timer_init_sequence"]');
  await expect(badge).toHaveAttribute('data-saved-kind', 'sequence');
  await expect(badge).toHaveText(/シーケンス/);

  // 到達条件その2: その印を押すと、本文判定に関係なくシーケンスのまま開く。
  await badge.click();
  await page.waitForTimeout(1200);
  expect(await page.locator('#diagram-type').inputValue()).toBe('plantuml-sequence');
  expect(await page.locator('#editor').inputValue()).toContain('Timer_Init(cfg)');
});

// BLK-junior-20260912-2206-wish: 手本のコンポーネント図が 1 枚も無い部品は、
// 「先輩のフォルダを 1 枚ずつ覗いて手本が無いことを確かめる」→「末尾に追加で本体を作る」
// →「依存チェックの起点を選び直して定石から足す」を部品が替わるたびに組み立て直すことになる。
// 部品名 1 語で、本体と依存の入った下書きが別タブに出ることを確かめる。
const TIMER_SEQ_FOR_DRAFT = [
  '@startuml',
  'title TIMERドライバ初期化シーケンス',
  'participant Timer_Driver',
  'participant Clock_Ctrl',
  'Timer_Driver -> Clock_Ctrl : 分周設定',
  'Clock_Ctrl --> Timer_Driver : E_OK',
  '@enduml',
].join('\n');

test('手順2 手本の無い部品のコンポーネント図を、部品名 1 語で下書きにできる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);

  // 手順1 で起こした、この部品のシーケンス図。依存の実績はここから拾われる。
  await page.locator('#diagram-type').selectOption('plantuml-sequence');
  await page.waitForTimeout(300);
  await S.typeDsl(page, TIMER_SEQ_FOR_DRAFT);
  await S.renameActive(page, 'timer_init_sequence');
  await page.waitForTimeout(600);

  // 白紙のコンポーネント図のタブに立つ (ここが「手本が無い」と気付く場所)。
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(400);
  await page.locator('#diagram-type').selectOption('plantuml-component');
  await page.waitForTimeout(800);

  // 到達条件その1: 部品名を打つと「この部品の図はまだ無い」と何件入るかが出る
  // (先輩のフォルダを 1 枚ずつ覗いて確かめ直さない)。
  await page.locator('#co-starter-subject').fill('TIMER');
  await page.waitForTimeout(300);
  await expect(page.locator('#co-starter-have')).toHaveAttribute('data-have', '0');
  await expect(page.locator('#co-starter-have')).toContainText('まだありません');
  // シーケンス図に出てくる相手 1 件が実績として入る。
  await expect(page.locator('#co-starter-hint')).toHaveAttribute('data-usage', '1');
  await expect(page.locator('#co-starter-hint')).toHaveAttribute('data-deps', '6');

  // 到達条件その2: 押すと本体 1 + 依存 6 の下書きが別タブで開く。
  await page.locator('#co-starter-add').click();
  await page.waitForTimeout(1200);
  const draft = await getEditorText(page);
  expect(draft).toContain('component TIMER_Driver');
  expect(draft).toContain('TIMER_Driver ..> Clock_Ctrl : クロック制御');
  expect(draft).toContain('TIMER_Driver ..> Power_Ctrl : 電源制御');
  expect(await page.locator('#diagram-type').inputValue()).toBe('plantuml-component');

  // 到達条件その3: 元のタブ (白紙のコンポーネント図) は下書きで置き換わっていない。
  const names = await page.evaluate(() => window.MA.workspace.list().map((d) => d.name));
  expect(names).toContain('timer_component');
  expect(names).toContain('timer_init_sequence');

  // 到達条件その4: 出来た下書きに対して依存チェックは「定石は全部ある」と言う
  // (足し忘れたまま先へ進まない)。
  await page.waitForTimeout(400);
  await expect(page.locator('#co-deps-summary')).toHaveAttribute('data-catalog-missing', '0');
});
