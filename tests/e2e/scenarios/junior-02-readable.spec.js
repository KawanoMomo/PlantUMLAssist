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

  // BLK-junior-20260912-2206: 覗き一覧は図名だけで図種の印が無く、「先輩に
  // コンポーネント図があるか」を 30 行の語尾 (_state / _sequence) から推測して
  // いた。自分の 📂 一覧と同じ内訳と印を、開いた時点で出す。
  await expect(page.locator('#peek-kinds')).toContainText('コンポーネント 0');
  await expect(page.locator('#peek-kinds')).toContainText('状態遷移 1');
  await expect(page.locator('.peek-file[data-file-name="timer_state"] .peek-kind'))
    .toContainText('状態遷移');

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
// BLK-human-20260912-2130: 手順 2 で junior が起こす 5 図種 (状態遷移・クラス・
// コンポーネント・ユースケース・アクティビティ) でも、シーケンスと同じく
// 「ホバーすると選択範囲が枠で見え、その枠内のどこを押しても同じ要素が選べる」こと。
// 仕様を知らなくても押す前に何が選ばれるか分かる、が守りたい性質。
const HOVER_CASES = [
  {
    kind: 'plantuml-state',
    name: '状態遷移',
    dsl: [
      '@startuml',
      'state Uninit',
      'state Ready',
      'state Busy',
      'Uninit --> Ready : Gpio_Init [cfg] / setup',
      'Ready --> Busy : Gpio_Write',
      '@enduml',
    ].join('\n'),
    elementType: 'state',
    relationType: 'transition',
  },
  {
    kind: 'plantuml-class',
    name: 'クラス',
    dsl: [
      '@startuml',
      'class Gpio_Driver',
      'class Port_Ctrl',
      'Gpio_Driver "1" --> "0..*" Port_Ctrl : controls',
      '@enduml',
    ].join('\n'),
    elementType: 'class',
    relationType: 'relation',
  },
  {
    kind: 'plantuml-component',
    name: 'コンポーネント',
    dsl: [
      '@startuml',
      'component Gpio_Driver',
      'component Port_Ctrl',
      'Gpio_Driver --> Port_Ctrl : writes',
      '@enduml',
    ].join('\n'),
    elementType: 'component',
    relationType: 'relation',
  },
  {
    kind: 'plantuml-usecase',
    name: 'ユースケース',
    dsl: [
      '@startuml',
      'actor Dev',
      'usecase Configure',
      'Dev --> Configure : performs',
      '@enduml',
    ].join('\n'),
    elementType: 'usecase',
    otherType: 'actor',   // ユースケースは 1 つなので、選択の逃がし先はアクター
    relationType: 'relation',
  },
  {
    kind: 'plantuml-activity',
    name: 'アクティビティ',
    dsl: [
      '@startuml',
      'start',
      ':Gpio_Init;',
      ':Gpio_Write;',
      'stop',
      '@enduml',
    ].join('\n'),
    elementType: 'action',
    relationType: null,   // アクティビティの矢印は要素を持たない (分岐ラベルが相当)
  },
];

// data-type と data-id で選んだ当たり判定の「画面上の箱」を全部返す。
async function hitBoxes(page, type, id) {
  return page.evaluate((a) => {
    const sel = '#overlay-layer rect.selectable[data-type="' + a.type + '"]'
      + (a.id ? '[data-id="' + a.id + '"]' : '');
    return Array.prototype.map.call(document.querySelectorAll(sel), (r) => {
      const b = r.getBoundingClientRect();
      return { id: r.getAttribute('data-id'), x: b.x, y: b.y, w: b.width, h: b.height };
    }).filter((b) => b.w > 2 && b.h > 2);
  }, { type, id });
}

// マウスを乗せた点にある当たり判定の枠 (hover の見た目) を読む。
async function frameAt(page, x, y) {
  await page.mouse.move(x, y);
  await page.waitForTimeout(120);
  return page.evaluate((p) => {
    const el = document.elementFromPoint(p.x, p.y);
    if (!el || !el.getAttribute || !el.getAttribute('data-type')) return null;
    const cs = window.getComputedStyle(el);
    return {
      type: el.getAttribute('data-type'),
      id: el.getAttribute('data-id'),
      stroke: cs.stroke,
      dash: cs.strokeDasharray,
      fill: cs.fill,
    };
  }, { x, y });
}

// 選ばれている要素。再描画で overlay は作り直されるので、見た目 (.selected) では
// なく選択そのものを読む。
// 図の空白を押して選択を解いた状態に戻す (当たり判定の無い所を探して押す)。
async function clearSelectionByBlankClick(page) {
  const pt = await page.evaluate(() => {
    const ov = document.getElementById('overlay-layer');
    const b = ov.getBoundingClientRect();
    for (let y = b.top + 4; y < b.bottom - 4; y += 6) {
      for (let x = b.left + 4; x < b.right - 4; x += 6) {
        const e = document.elementFromPoint(x, y);
        if (e && e.classList && e.classList.contains('overlay-background')) return { x, y };
      }
    }
    return null;
  });
  if (pt) {
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(200);
  }
}

async function selectedId(page) {
  return page.evaluate(() => {
    const sel = window.MA.selection.getSelected();
    if (sel && sel.length) return sel[0].id;
    const el = document.querySelector('#overlay-layer rect.selectable.selected');
    return el ? el.getAttribute('data-id') : null;
  });
}

// 対象の選択を確実に外す。同じ要素を続けて押すと選択が外れる (押し直しで解除) ので、
// 「別の要素を押す」→ それでも駄目なら「図の空白を押す」の順で選択を対象から離す。
// .selected が付いたままだと hover の枠も出ないので、枠を読む前にもこれを通す。
async function parkSelection(page, avoidId, otherBox) {
  if (otherBox) {
    await page.mouse.click(otherBox.x + otherBox.w / 2, otherBox.y + otherBox.h / 2);
    await page.waitForTimeout(200);
  }
  if (await selectedId(page) === avoidId) {
    await clearSelectionByBlankClick(page);
  }
  expect(await selectedId(page)).not.toBe(avoidId);
}

for (const c of HOVER_CASES) {
  test('手順2 ' + c.name + '図: ホバーで選択範囲が枠で出て、枠内の別の場所を押しても同じ要素が選ばれる', async ({ page }) => {
    await S.bootWithSaveDir(page, DIR);
    await page.locator('#diagram-type').selectOption(c.kind);
    await page.waitForTimeout(400);
    await S.typeDsl(page, c.dsl);
    await page.waitForTimeout(2500);

    // ── 要素 (状態・クラス・部品・ユースケース・アクション) ──
    const elBoxes = await hitBoxes(page, c.elementType, null);
    expect(elBoxes.length).toBeGreaterThan(0);
    const el = elBoxes[0];
    // 選択を逃がす先 (対象とは別の要素)。
    const others = c.otherType ? await hitBoxes(page, c.otherType, null) : elBoxes;
    const other = others.find((b) => b.id !== el.id);
    expect(other).toBeTruthy();

    // 到達条件その1: マウスを乗せると当たり判定の範囲が枠 (青の破線) で見える。
    const elFrame = await frameAt(page, el.x + el.w / 2, el.y + el.h / 2);
    expect(elFrame).not.toBeNull();
    expect(elFrame.id).toBe(el.id);
    expect(elFrame.dash).not.toBe('none');
    expect(elFrame.stroke).not.toBe('none');

    // 到達条件その2: 枠の中の別の場所 (左上寄り・右下寄り) を押しても同じ要素。
    for (const p of [[el.x + el.w * 0.2, el.y + el.h * 0.2],
                     [el.x + el.w * 0.8, el.y + el.h * 0.8]]) {
      await parkSelection(page, el.id, other);
      await page.mouse.click(p[0], p[1]);
      await page.waitForTimeout(200);
      expect(await selectedId(page)).toBe(el.id);
    }

    if (!c.relationType) return;

    // ── 関係 (遷移・関連・依存) ──
    // ラベル・ガード・多重度も含めて 1 つの当たり判定 (= 同じ data-id)。
    const anyRel = await hitBoxes(page, c.relationType, null);
    expect(anyRel.length).toBeGreaterThan(0);
    const relId = anyRel[0].id;
    const relBoxes = await hitBoxes(page, c.relationType, relId);
    // 矢印の範囲とラベルの範囲の 2 か所以上が同じ関係を指す。
    expect(relBoxes.length).toBeGreaterThan(1);

    let checked = 0;
    for (const b of relBoxes) {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      await parkSelection(page, relId, other);
      const f = await frameAt(page, cx, cy);
      // 別の要素が手前にある点は飛ばす (矢じりが図形の縁に接する所)。
      if (!f || f.type !== c.relationType) continue;
      // 到達条件その3: 関係のどの場所でも枠が出て、指す関係は同じ。
      expect(f.id).toBe(relId);
      expect(f.dash).not.toBe('none');
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(200);
      // 到達条件その4: 矢印を押してもラベルを押しても同じ関係が選ばれる。
      expect(await selectedId(page)).toBe(relId);
      checked++;
    }
    // 矢印の範囲とラベルの範囲の両方で確かめられたこと。
    expect(checked).toBeGreaterThan(1);
  });
}

// BLK-junior-20260914-1606: 9 周目「先輩の変更を取り込む」クラス図の回。
// クラスも関係も揃っていて、先輩の IRQCtrl にメソッドが 2 つ増えただけのとき、
// 対応表には行が 1 つも出ず、先輩の画面を見ながら `+ TransferComplete() : void` を
// 手で打ち直すしかなかった。1 文字違いで壊れる行を写す手を無くす。
const SENIOR_IRQ = [
  '@startuml',
  'title ドライバ共通クラス図',
  'class IRQCtrl {',
  '  +Enable() : void',
  '  +TransferComplete() : void',
  '  +Fault(code) : void',
  '}',
  '@enduml',
].join('\n');

const MINE_IRQ = [
  '@startuml',
  'title GPIOドライバクラス図',
  'class IRQCtrl {',
  '  +Enable() : void',
  '}',
  '@enduml',
].join('\n');

test('手順2 先輩が足したメソッドを、記法を打ち直さずに自分の図へ写せる', async ({ page }) => {
  await S.bootWithSaveDir(page, MINE_DIR);
  await S.clearDir(page, MINE_DIR);
  await S.clearDir(page, SENIOR_DIR);
  await S.putDoc(page, SENIOR_DIR, 'driver_common_class', SENIOR_IRQ);
  await page.reload();
  await page.waitForSelector('#btn-tab-peek');
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(400);
  await S.typeDsl(page, MINE_IRQ);

  // 手本を右に据える (ここまでは手順 2 のいつもの流れ)。
  await page.locator('#btn-tab-peek').click();
  await page.waitForSelector('#peek-modal');
  await page.locator('.peek-file[data-file-name="driver_common_class"]').click();
  await page.locator('#peek-compare').click();
  await expect(page.locator('#compare-pane')).toBeVisible();

  // 到達条件その1: クラスも関係も揃っているのに、増えたメソッドが行として出る。
  const rows = page.locator('#map-list .map-row[data-map-type="member"]');
  await expect(rows.filter({ hasText: 'TransferComplete' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'Fault' })).toHaveCount(1);
  // 揃っているメソッドは並ばない (差だけを読む)。
  await expect(rows.filter({ hasText: 'Enable' })).toHaveCount(0);
  await expect(page.locator('#map-summary')).toContainText('メンバー差 2');

  // 到達条件その2: その行の「＋この図にも足す」を押すだけで、記法どおりの 1 行が
  // 自分の IRQCtrl の中に入る (打ち直さない)。
  await rows.filter({ hasText: 'TransferComplete' }).locator('.map-take').click();
  await page.waitForTimeout(400);
  await rows.filter({ hasText: 'Fault' }).locator('.map-take').click();
  await page.waitForTimeout(400);

  const text = await getEditorText(page);
  expect(text).toContain('+ TransferComplete() : void');
  expect(text).toContain('+ Fault(code) : void');

  // 到達条件その3: 写し終われば行は消え、残りが 0 件だと画面が言う。
  await expect(page.locator('#map-list .map-row[data-map-type="member"]')).toHaveCount(0);
  // 先輩のファイルは読むだけ (書き換えない)。
  expect(await S.readDoc(page, SENIOR_DIR, 'driver_common_class')).toBe(SENIOR_IRQ);
});

// BLK-junior-20260915-0406-wish: 先輩の図を手本に SPI の状態遷移図を打ち直すとき、
// 遷移ラベル (Spi_Init / Spi_Transmit / TransferComplete …) は先輩のシーケンス図に
// も出てくるはずだが、GUI は図ごとに独立していて名前の対応を教えてくれない。
// 合っているかは先輩の図を別に開いて目で見比べるしかなかった。
// 同じ部品名の図を 1 冊の名前帳にまとめ、遷移ラベルの欄から選べることを確かめる。
const SENIOR_SPI_SEQ = [
  '@startuml',
  'title SPIドライバ初期化シーケンス',
  'participant Dev',
  'participant Spi_Driver',
  'Dev -> Spi_Driver : Spi_Init()',
  'Dev -> Spi_Driver : Spi_Transmit(buf, len)',
  'Spi_Driver --> Dev : TransferComplete',
  'Spi_Driver --> Dev : Fault',
  '@enduml',
].join('\n');

const MY_SPI_STATE = [
  '@startuml',
  'title SPIドライバ状態遷移',
  'state Uninit',
  'state Idle',
  'state Busy',
  '[*] --> Uninit',
  'Uninit --> Idle : Spi_Init',
  '@enduml',
].join('\n');

test('手順2 遷移ラベルを、先輩の図を開かずに部品の名前帳から選べる', async ({ page }) => {
  await S.bootWithSaveDir(page, MINE_DIR);
  await S.clearDir(page, MINE_DIR);
  await S.clearDir(page, SENIOR_DIR);
  await S.putDoc(page, SENIOR_DIR, 'spi_init_sequence', SENIOR_SPI_SEQ);
  await page.reload();
  await page.waitForSelector('#btn-tab-peek');
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(400);
  // 名前帳は「同じ部品名の図」で引くので、自分の図も部品名で名乗る。
  await S.renameActive(page, 'spi_state');
  await S.typeDsl(page, MY_SPI_STATE);
  await page.waitForTimeout(1200);

  await page.locator('#st-tail-kind').selectOption('transition');
  await page.waitForSelector('#st-tail-trig');

  // 到達条件その1: 先輩のシーケンスにしか出ていない名前が、遷移ラベルの欄の
  // 下に候補として並ぶ (先輩の図を開かない)。
  const picker = page.locator('#st-tail-trig-vocab');
  await expect(picker).toBeVisible();
  await expect(picker.locator('.vocab-head')).toContainText('SPI の名前帳');
  await expect(picker.locator('.vocab-chip[data-name="Spi_Transmit"]')).toHaveCount(1);
  await expect(picker.locator('.vocab-chip[data-name="TransferComplete"]')).toHaveCount(1);
  // 型 (participant) は遷移ラベルにならないので候補に出ない。
  await expect(picker.locator('.vocab-chip[data-name="Spi_Driver"]')).toHaveCount(0);

  // 到達条件その2: 押すだけで欄が埋まり、そのまま遷移を足せる (打ち直さない)。
  await picker.locator('.vocab-chip[data-name="Spi_Transmit"]').click();
  await expect(page.locator('#st-tail-trig')).toHaveValue('Spi_Transmit');
  await page.locator('#st-tail-from').selectOption('Idle');
  await page.locator('#st-tail-to').selectOption('Busy');
  await page.locator('#st-tail-add').click();
  await page.waitForTimeout(400);
  expect(await getEditorText(page)).toContain('Idle --> Busy : Spi_Transmit');

  // 到達条件その3: 手で打った綴りが先輩と揺れていれば、その場で相手の綴りが出る。
  await page.locator('#st-tail-kind').selectOption('transition');
  await page.waitForSelector('#st-tail-trig');
  await page.locator('#st-tail-trig').fill('SpiInit');
  await page.waitForTimeout(200);
  await expect(page.locator('#st-tail-trig-vocab .vocab-warn')).toContainText('Spi_Init');

  // 先輩のファイルは読むだけ (書き換えない)。
  expect(await S.readDoc(page, SENIOR_DIR, 'spi_init_sequence')).toBe(SENIOR_SPI_SEQ);
});

// BLK-junior-20260915-0606-wish: 図 (ファイル) ごとにタブを開く作りなので、1 部品の
// 6 図種を見比べるには毎回タブを行き来する。先輩のクラス図でメソッド名を確かめてから
// 自分の活動図に打ち直す手順は「タブ切替 2 + フィルタ 4 + 控え書き」に広がっていた
// (BLK-junior-20260915-0606)。部品を 1 つ選べば 6 図種が先輩・自分の 2 列で同時に出て、
// 手本の名前を押せば自分の欄に入り、その場で保存できることを確かめる。
const BOARD_ROOT = DIR + '-board';
const BOARD_MINE = BOARD_ROOT + '/junior';
const BOARD_SENIOR = BOARD_ROOT + '/primary';

// 先輩のクラス図は 3 部品相乗りの 1 枚 (spi_class という名前では無い)。
const BOARD_SENIOR_CLASS = [
  '@startuml', 'title ドライバ共通クラス図',
  'class Driver_Common',
  'class Spi_Driver {', '  + Spi_Init() : void', '  + Spi_Transmit() : void', '  + Spi_Reset() : void', '}',
  'class Can_Driver {', '  + Can_Init() : void', '}',
  'Driver_Common <|-- Spi_Driver',
  '@enduml',
].join('\n');
const BOARD_SENIOR_ACT = [
  '@startuml', 'title SPI 初期化アクティビティ',
  'start', ':Spi_Init();', ':Spi_Transmit();', 'stop', '@enduml',
].join('\n');
const BOARD_SENIOR_SEQ = [
  '@startuml', 'participant Spi_Driver', 'Spi_Driver -> IRQCtrl : Spi_Init()', '@enduml',
].join('\n');
// 自分の活動図は汎用ひな形のままで、メソッド名がまだ先輩と揃っていない。
const BOARD_MINE_ACT = [
  '@startuml', 'title SPI 初期化アクティビティ',
  'start', ':SPI_Init();', 'stop', '@enduml',
].join('\n');

test.describe('junior 手順2: 部品を選ぶと 6 図種が 2 列で並び、手本を見ながら打ち直せる', () => {
  test.beforeEach(async ({ page }) => {
    await S.bootWithSaveDir(page, BOARD_MINE);
    await S.clearDir(page, BOARD_MINE);
    await S.clearDir(page, BOARD_SENIOR);
    await S.putDoc(page, BOARD_MINE, 'spi_init_sequence', BOARD_SENIOR_SEQ);
    await S.putDoc(page, BOARD_MINE, 'spi_activity', BOARD_MINE_ACT);
    await S.putDoc(page, BOARD_SENIOR, 'spi_init_sequence', BOARD_SENIOR_SEQ);
    await S.putDoc(page, BOARD_SENIOR, 'spi_activity', BOARD_SENIOR_ACT);
    await S.putDoc(page, BOARD_SENIOR, 'driver_common_class', BOARD_SENIOR_CLASS);
    await page.reload();
    await page.waitForSelector('#btn-tab-peek');
  });

  test('部品ビューで活動図を打ち直し、同じ画面で保存できる', async ({ page }) => {
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.waitForSelector('#peek-files');

    // 部品ビューを開く (台本の「SPI を選ぶと」に当たる操作)。
    await page.locator('#peek-board-toggle').click();
    await page.waitForSelector('#peek-board .pb-row');
    await page.locator('#peek-board-part').selectOption('spi');
    await page.waitForTimeout(800);

    // 到達条件その1: 6 図種ぶんの行が同じ画面に並ぶ (タブを行き来しない)。
    expect(await page.locator('#peek-board .pb-row').count()).toBe(6);
    await expect(page.locator('#peek-board-summary')).toContainText('SPI: 6 図種のうち');

    // 到達条件その2: 部品名のファイルが無いクラス図も、相乗り図が手本として出る。
    const classRow = page.locator('#peek-board .pb-row[data-board-kind="class"]');
    await expect(classRow).toContainText('driver_common_class');
    await expect(classRow).toContainText('相乗り図');
    await expect(classRow.locator('[data-board-ref="class"]')).toContainText('Spi_Transmit');

    // 到達条件その3: 活動図の欄に、先輩のクラス図から拾った名前を押して入れられる
    // (クラス図タブへ切り替えて名前を控える往復が要らない)。
    const act = page.locator('#peek-board [data-board-edit="activity"]');
    await act.fill(['@startuml', 'title SPI 初期化アクティビティ', 'start', ':', 'stop', '@enduml'].join('\n'));
    // カーソルを ':' の直後へ置いてから、手本のメソッド名を押す。
    await page.evaluate(() => {
      const ta = document.querySelector('#peek-board [data-board-edit="activity"]');
      const at = ta.value.indexOf('\n:') + 2;
      ta.focus();
      ta.setSelectionRange(at, at);
    });
    await classRow.locator('.pb-name[data-board-name="Spi_Init"]').click();
    await expect(act).toHaveValue(/:Spi_Init/);

    // 到達条件その4: そのまま同じ画面で保存でき、保存先は自分のフォルダ。
    await page.locator('#peek-board [data-board-save="activity"]').click();
    await page.waitForTimeout(800);
    await expect(page.locator('#peek-board [data-board-msg="activity"]')).toContainText('保存しました');
    const saved = await S.readDoc(page, BOARD_MINE, 'spi_activity');
    expect(saved).toContain(':Spi_Init');

    // 先輩のファイルは読むだけ (書き換えない)。
    expect(await S.readDoc(page, BOARD_SENIOR, 'spi_activity')).toBe(BOARD_SENIOR_ACT);
    expect(await S.readDoc(page, BOARD_SENIOR, 'driver_common_class')).toBe(BOARD_SENIOR_CLASS);
  });

  test('まだ起こしていない図種も行として残り、手本の有無が分かる', async ({ page }) => {
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.locator('#peek-board-toggle').click();
    await page.waitForSelector('#peek-board .pb-row');
    await page.locator('#peek-board-part').selectOption('spi');
    await page.waitForTimeout(800);

    // クラス図は先輩の相乗り図があるが自分にはまだ無い。
    await expect(page.locator('#peek-board .pb-row[data-board-kind="class"]'))
      .toHaveAttribute('data-state', 'mine-missing');
    // 状態遷移図はどちらにも無い (行は消えない)。
    await expect(page.locator('#peek-board .pb-row[data-board-kind="state"]'))
      .toHaveAttribute('data-state', 'none');
    await expect(page.locator('#peek-board-summary')).toContainText('自分に無し');
  });

  // BLK-junior-20260915-2346-wish: 6 図種は 2 列で並ぶようになったが、並ぶのは本文
  // そのものなので「6 枚のうち何枚済んだか」「どの図がまだ先輩に合っていないか」は
  // 6 行を目で読み比べないと言えなかった。部品を選んだ時点でそれが 1 行に出て、
  // 直したあとはその場で数字が動くこと (手順7 の見返しが開き直しにならないこと) を見る。
  test('部品カードが 6 枚中の進捗と、先輩に合っていない図種を 1 行で出す', async ({ page }) => {
    await page.locator('#btn-tab-peek').click();
    await page.waitForSelector('#peek-modal');
    await page.locator('#peek-board-toggle').click();
    await page.waitForSelector('#peek-board .pb-row');
    await page.locator('#peek-board-part').selectOption('spi');
    await page.waitForTimeout(800);

    // 到達条件その1: 6 枚を母数にした進捗が出る (自分はシーケンスと活動図の 2 枚)。
    await expect(page.locator('#peek-card-progress')).toHaveText('6 図種中 2 枚');
    expect(await page.locator('#peek-card .pc-pip.on').count()).toBe(2);

    // 到達条件その2: 先輩に合っていない図種が名指しで出る。自分の活動図は
    // `SPI_Init` 1 つだけで、先輩の `Spi_Init` `Spi_Transmit` に届いていない。
    const gaps = page.locator('#peek-card-gaps');
    await expect(gaps).toContainText('要直し');
    await expect(gaps).toContainText('アクティビティ');
    // 打ち直した所が無いシーケンス図は一致として出る (要直しには出ない)。
    await expect(page.locator('#peek-board .pb-row[data-board-kind="sequence"]'))
      .toHaveAttribute('data-verdict', 'agree');
    await expect(page.locator('#peek-board .pb-row[data-board-kind="activity"]'))
      .toHaveAttribute('data-verdict', 'differ');

    // 到達条件その3: 要直しの図種を押すと、その図の自分の欄に入る (探し直さない)。
    await page.locator('#peek-card [data-card-gap="activity"]').click();
    await expect(page.locator('#peek-board [data-board-edit="activity"]')).toBeFocused();

    // 到達条件その4: 綴りを先輩に合わせて保存すると、その場で要直しが消える。
    await page.locator('#peek-board [data-board-edit="activity"]')
      .fill(['@startuml', 'title SPI 初期化アクティビティ', 'start', ':Spi_Init();', ':Spi_Transmit();', 'stop', '@enduml'].join('\n'));
    await page.locator('#peek-board [data-board-save="activity"]').click();
    await page.waitForTimeout(1200);
    await expect(page.locator('#peek-board .pb-row[data-board-kind="activity"]'))
      .toHaveAttribute('data-verdict', 'agree');
    await expect(page.locator('#peek-card-gaps')).not.toContainText('要直し');
    // 進捗の母数は動かない (まだ 4 図種を起こしていないことが画面から消えない)。
    await expect(page.locator('#peek-card-progress')).toHaveText('6 図種中 2 枚');
  });
});

// BLK-junior-20260915-0606: SPI の活動図 (手順2) を打ち直すのに、実在メソッド名
// (Spi_Init / Spi_Reset / Spi_Transmit / Notify) を知る手段が先輩の相乗りクラス図
// (driver_common_class、8 部品が 1 枚) しか無かった。名前帳はクラス図タブ・状態遷移図・
// シーケンスの欄にしか出ておらず、しかも名前帳は「ファイル名に部品名がある図」しか
// 読まないので、この 1 枚は名前帳の外に居た。結果、活動図タブを離れて別タブで
// クラス図を開き、絞り込み、名前を控えて戻る往復が図種をまたぐたびに要った。
const SENIOR_COMMON_CLASS = [
  '@startuml',
  'title ドライバ共通クラス図',
  'class Driver_Base {',
  '  +Init() : void',
  '}',
  'class Spi_Driver {',
  '  +Spi_Init() : void',
  '  +Spi_Reset() : void',
  '  +Spi_Transmit(buf, len) : void',
  '  +Notify() : void',
  '}',
  'class Uart_Driver {',
  '  +Uart_Send() : void',
  '}',
  'Spi_Driver --|> Driver_Base',
  'Uart_Driver --|> Driver_Base',
  '@enduml',
].join('\n');

const MY_SPI_ACT = [
  '@startuml',
  'title SPIドライバ初期化',
  'start',
  'stop',
  '@enduml',
].join('\n');

test('手順2 活動図の本文を、先輩のクラス図タブに行かずに名前帳から打てる', async ({ page }) => {
  await S.bootWithSaveDir(page, MINE_DIR);
  await S.clearDir(page, MINE_DIR);
  await S.clearDir(page, SENIOR_DIR);
  await S.putDoc(page, SENIOR_DIR, 'driver_common_class', SENIOR_COMMON_CLASS);
  await page.reload();
  await page.waitForSelector('#btn-tab-peek');
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await page.waitForTimeout(400);
  await S.renameActive(page, 'spi_activity');
  await S.typeDsl(page, MY_SPI_ACT);
  await page.waitForTimeout(1200);

  // 活動図タブを開いたまま。右ペインの「末尾に追加 / Action」の本文欄に名前帳が出る。
  await page.locator('#ac-tail-kind').selectOption('action');
  await page.waitForSelector('#ac-tail-text');

  // 到達条件その1: ファイル名に部品名の無い相乗り図の中からでも、
  // SPI のメソッドだけが候補に並ぶ (他部品の Uart_Send は混ざらない)。
  const picker = page.locator('#ac-tail-text-vocab');
  await expect(picker).toBeVisible();
  await expect(picker.locator('.vocab-head')).toContainText('SPI の名前帳');
  for (const m of ['Spi_Init', 'Spi_Reset', 'Spi_Transmit', 'Notify']) {
    await expect(picker.locator('.vocab-chip[data-name="' + m + '"]')).toHaveCount(1);
  }
  await expect(picker.locator('.vocab-chip[data-name="Uart_Send"]')).toHaveCount(0);

  // 到達条件その2: 押せば括弧まで入り、そのままアクションとして足せる。
  await picker.locator('.vocab-chip[data-name="Spi_Init"]').click();
  await expect(page.locator('#ac-tail-text')).toHaveValue('Spi_Init()');
  await page.locator('#ac-tail-add').click();
  await page.waitForTimeout(400);
  expect(await getEditorText(page)).toContain(':Spi_Init();');

  // 到達条件その3: 打ちかけの本文は消えない (カーソル位置に差し込む)。
  await page.locator('#ac-tail-kind').selectOption('action');
  await page.waitForSelector('#ac-tail-text');
  await page.locator('#ac-tail-text').fill('Spi_Reset()\n');
  await page.locator('#ac-tail-text').press('End');
  await page.locator('#ac-tail-text-vocab .vocab-chip[data-name="Spi_Transmit"]').click();
  await expect(page.locator('#ac-tail-text')).toHaveValue('Spi_Reset()\nSpi_Transmit()');

  // 到達条件その4: 揺れた綴りは、その行だけを見てその場で相手の綴りが出る。
  await page.locator('#ac-tail-text').fill('SpiTransmit');
  await page.waitForTimeout(200);
  await expect(page.locator('#ac-tail-text-vocab .vocab-warn')).toContainText('Spi_Transmit');

  // 先輩のファイルは読むだけ (書き換えない)。
  expect(await S.readDoc(page, SENIOR_DIR, 'driver_common_class')).toBe(SENIOR_COMMON_CLASS);
});

// BLK-junior-20260916-0046-wish: 17 周目の手順 2 は「指摘の表記揺れ 4 組を canonical に
// 揃える」。揃える先は reviewer が決めて登録簿 (_names.json) に置いてあるのに、GUI には
// 「どのファイルにその揺れが残っているか」が無いので、junior は 📂 一覧と登録簿を
// 見比べ、該当しそうな図を 1 枚ずつ開いて本文を読み、直して保存する、を 10 回繰り返した。
// 組を選べば在処が出て、チェックした分が保存まで 1 回で終わることを確かめる。
const UNIFY_ROOT = DIR + '-unify';
const UNIFY_DIR = UNIFY_ROOT + '/junior';

const U_GPIO = [
  '@startuml', 'title GPIOドライバ初期化シーケンス',
  'participant Gpio_Driver', 'participant IrqCtrl',
  'Gpio_Driver -> IrqCtrl : Gpio_Init()',
  '@enduml',
].join('\n');
const U_SPI = [
  '@startuml', 'title SPIドライバ初期化シーケンス',
  'participant Spi_Driver', 'participant Irq_Ctrl', 'participant ClockCtrl',
  'Spi_Driver -> Irq_Ctrl : Spi_Init()',
  'Spi_Driver -> ClockCtrl : 分周設定',
  '@enduml',
].join('\n');
// 既に揃っている図。対象に挙がってはいけない (直す必要が無い図を触らない)。
const U_OK = [
  '@startuml', 'title TIMERドライバ初期化シーケンス',
  'participant Timer_Driver', 'participant IRQCtrl',
  'Timer_Driver -> IRQCtrl : Timer_Init()',
  '@enduml',
].join('\n');

async function putRegistry(page, dir, entries) {
  return page.evaluate(async (a) => {
    const r = await fetch('/name-registry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir: a.dir, entries: a.entries }),
    });
    return r.ok;
  }, { dir, entries });
}

test('手順2 登録簿の組を選ぶだけで、揺れの残る図がまとめて正式表記に揃う', async ({ page }) => {
  await S.bootWithSaveDir(page, UNIFY_DIR);
  await S.clearDir(page, UNIFY_DIR);
  await S.putDoc(page, UNIFY_DIR, 'gpio_init_sequence', U_GPIO);
  await S.putDoc(page, UNIFY_DIR, 'spi_sequence', U_SPI);
  await S.putDoc(page, UNIFY_DIR, 'timer_init_sequence', U_OK);
  // 揃える先は reviewer が決めて置いた 1 冊 (保存フォルダの親)。
  await putRegistry(page, UNIFY_DIR, [
    { canonical: 'IRQCtrl', variants: ['IrqCtrl', 'Irq_Ctrl'] },
    { canonical: 'Clock_Ctrl', variants: ['ClockCtrl'] },
  ]);
  await page.reload();
  await page.waitForSelector('#btn-tab-unify');

  await page.locator('#btn-tab-unify').click();
  await expect(page.locator('#unify-panel')).toHaveClass(/open/);

  // 到達条件その1: 何組が揃っていないかが、ファイルを 1 枚も開かずに出る。
  await expect(page.locator('#unify-summary')).toHaveText('2 組 / 6 件が揃っていません', { timeout: 15000 });

  // 到達条件その2: 組を選ぶと、揺れの残る図だけが在処として並ぶ
  // (既に揃っている timer_init_sequence は出ない)。
  await page.locator('#unify-entry').selectOption('irqctrl');
  const files = page.locator('#unify-panel .unify-file');
  await expect(files).toHaveCount(2);
  await expect(files.filter({ hasText: 'gpio_init_sequence' })).toHaveCount(1);
  await expect(files.filter({ hasText: 'spi_sequence' })).toHaveCount(1);
  await expect(files.filter({ hasText: 'timer_init_sequence' })).toHaveCount(0);

  // 到達条件その3: チェックした分をまとめて当てると、保存まで終わっている
  // (開いて直して保存する往復が無い)。
  await page.locator('#btn-unify-apply').click();
  await expect(page.locator('#unify-result')).toHaveAttribute('data-applied-docs', '2', { timeout: 15000 });
  await expect(page.locator('#unify-result')).toContainText('IRQCtrl に 4 件 / 2 枚を揃えました');

  const gpio = await S.readDoc(page, UNIFY_DIR, 'gpio_init_sequence');
  expect(gpio).toContain('participant IRQCtrl');
  expect(gpio).not.toContain('IrqCtrl');
  const spi = await S.readDoc(page, UNIFY_DIR, 'spi_sequence');
  expect(spi).toContain('Spi_Driver -> IRQCtrl : Spi_Init()');
  expect(spi).not.toContain('Irq_Ctrl');
  // 揃っていた図は触られない。
  expect(await S.readDoc(page, UNIFY_DIR, 'timer_init_sequence')).toBe(U_OK);

  // 到達条件その4: 当て終わった組は一覧から消え、残りの組がそのまま次に選べる。
  await expect(page.locator('#unify-summary')).toHaveText('1 組 / 2 件が揃っていません', { timeout: 15000 });
  await expect(page.locator('#unify-entry option')).toHaveCount(1);
  await expect(page.locator('#unify-entry option').first()).toHaveText(/^Clock_Ctrl ← ClockCtrl/);
});

// BLK-junior-20260917-0223-wish: 場面3 (先輩の図の変更を自分の図に取り込む) の手順1〜2。
// 先輩側の増分は「相手だけ」の行として既に並ぶが、取り込みは 1 行ずつで、押すまで
// どこへ入るかが分からない。押すと一覧が出し直されカーソルも飛ぶので、増分が
// 何本もある回は次の 1 行を毎回探し直すことになる。入る位置を先に見せ、
// チェックした分をまとめて入れられることを確かめる。
const TAKE_SELF = [
  '@startuml',
  'title TIMERドライバ初期化シーケンス',
  'actor App',
  'participant Timer_Driver',
  'App -> Timer_Driver : Timer_Init()',
  '@enduml',
].join('\n');

// 先輩側で participant 1 つとメッセージ 2 本が増えた回。
const TAKE_SENIOR = [
  '@startuml',
  'title TIMERドライバ初期化シーケンス',
  'actor App',
  'participant Timer_Driver',
  'participant Driver_Common',
  'App -> Timer_Driver : Timer_Init()',
  'Timer_Driver -> Driver_Common : Common_Init()',
  'Timer_Driver -> Driver_Common : Common_Start()',
  '@enduml',
].join('\n');

test('手順1-2 先輩側の増分が入る位置つきで並び、チェックした分がまとめて入る', async ({ page }) => {
  await S.bootWithSaveDir(page, MINE_DIR);
  await S.clearDir(page, MINE_DIR);
  await S.clearDir(page, SENIOR_DIR);
  await S.putDoc(page, SENIOR_DIR, 'timer_init_sequence', TAKE_SENIOR);
  await page.reload();
  await page.waitForSelector('#btn-tab-compare');
  await S.typeDsl(page, TAKE_SELF);
  await S.renameActive(page, 'timer_init_sequence');

  // 手順1: 先輩のフォルダを相手にする (自分の保存先は変えない)。
  await page.locator('#btn-tab-compare').click();
  await page.locator('#xf-dir').fill(SENIOR_DIR);
  await page.locator('#btn-xf-load').click();
  await expect(page.locator('#xf-summary')).toBeVisible();

  // 到達条件その1: 増えた 3 要素が、それぞれ「どこへ入るか」つきで並ぶ。
  const rows = page.locator('#xf-list .xf-row.only-ref');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: 'participant Driver_Common' }).locator('.xf-where'))
    .toContainText('participant Timer_Driver');
  await expect(rows.filter({ hasText: 'Common_Init()' }).locator('.xf-where'))
    .toContainText('行目');

  // 到達条件その2: チェックした件数が押す前にボタンに出る。
  await page.locator('#xf-take-all').check();
  await expect(page.locator('#btn-xf-take-checked')).toHaveText('チェックした 3 件を取り込む');

  // 到達条件その3: 1 回押すだけで 3 件が自分の図に入る (1 行ずつ押さない)。
  await page.locator('#btn-xf-take-checked').click();
  await page.waitForTimeout(400);
  const text = await getEditorText(page);
  expect(text).toContain('participant Driver_Common');
  expect(text).toContain('Timer_Driver -> Driver_Common : Common_Init()');
  expect(text).toContain('Timer_Driver -> Driver_Common : Common_Start()');
  // 宣言は宣言の並びに、メッセージは @enduml の手前に入る。
  const lines = text.split('\n');
  expect(lines.indexOf('participant Driver_Common'))
    .toBeLessThan(lines.findIndex((l) => /Common_Init\(\)/.test(l)));
  await expect(page.locator('#xf-take-result')).toContainText('3 件を取り込みました');

  // 到達条件その4: 取り込んだ行は一覧から消え、取り込む対象が無くなる。
  await expect(page.locator('#xf-list .xf-row.only-ref')).toHaveCount(0);
  // 先輩のファイルは読むだけ (書き換えない)。
  expect(await S.readDoc(page, SENIOR_DIR, 'timer_init_sequence')).toBe(TAKE_SENIOR);
});

// BLK-junior-20260917-0323-wish: 同じ手順1〜2 の、状態遷移図 (TIMER) で
// 先輩が親状態の中に子状態を増やした回。子の増分がトップレベルの状態と
// 見分けられず、取り込むと親の外へ出て図の意味が変わっていた。
const NEST_SELF = [
  '@startuml',
  'title TIMERドライバ状態遷移',
  '[*] --> Uninit',
  'state Uninit',
  'state Configured',
  'Uninit --> Configured : Timer_Init()',
  'Configured --> Uninit : Timer_DeInit()',
  '@enduml',
].join('\n');

// 先輩側で Configured の中に子状態 2 つと、子の間の遷移 2 本が増えた回。
const NEST_SENIOR = [
  '@startuml',
  'title TIMERドライバ状態遷移',
  '[*] --> Uninit',
  'state Uninit',
  'state Configured {',
  '  state Idle',
  '  state Running',
  '  Idle --> Running : Timer_Start()',
  '  Running --> Idle : Timer_Stop()',
  '}',
  'Uninit --> Configured : Timer_Init()',
  'Configured --> Uninit : Timer_DeInit()',
  '@enduml',
].join('\n');

test('手順1-2 親状態の中に増えた子状態が入れ子のまま並び、入れ子のまま入る', async ({ page }) => {
  await S.bootWithSaveDir(page, MINE_DIR);
  await S.clearDir(page, MINE_DIR);
  await S.clearDir(page, SENIOR_DIR);
  await S.putDoc(page, SENIOR_DIR, 'timer_state', NEST_SENIOR);
  await page.reload();
  await page.waitForSelector('#btn-tab-compare');
  await S.typeDsl(page, NEST_SELF);
  await S.renameActive(page, 'timer_state');

  await page.locator('#btn-tab-compare').click();
  await page.locator('#xf-dir').fill(SENIOR_DIR);
  await page.locator('#btn-xf-load').click();
  await expect(page.locator('#xf-summary')).toBeVisible();

  // 到達条件その1: 子状態 2 つと子の遷移 2 本が、親の中の増分として並ぶ。
  // 親を手で開いて中を見比べる操作が要らない。
  const rows = page.locator('#xf-list .xf-row.only-ref');
  await expect(rows).toHaveCount(4);
  await expect(rows.filter({ hasText: 'state Idle' }).locator('.xf-nest'))
    .toHaveText('Configured の中');
  await expect(rows.filter({ hasText: 'Timer_Start()' }).locator('.xf-nest'))
    .toHaveText('Configured の中');
  await expect(page.locator('#xf-summary')).toContainText('4 件は親の中');

  // 到達条件その2: 入る位置も親の中だと先に分かる。
  await expect(rows.filter({ hasText: 'state Idle' }).locator('.xf-where'))
    .toContainText('「Configured」に { } を開いて');

  // 到達条件その3: まとめて取り込むと、子は親の { } の中に入る。
  await page.locator('#xf-take-all').check();
  await page.locator('#btn-xf-take-checked').click();
  await page.waitForTimeout(400);
  const text = await getEditorText(page);
  const lines = text.split('\n');
  const open = lines.indexOf('state Configured {');
  const close = lines.indexOf('}');
  expect(open).toBeGreaterThan(-1);
  expect(close).toBeGreaterThan(open);
  ['state Idle', 'state Running', 'Idle --> Running : Timer_Start()'].forEach((want) => {
    const at = lines.findIndex((l) => l.trim() === want);
    expect(at).toBeGreaterThan(open);
    expect(at).toBeLessThan(close);
  });

  // 到達条件その4: 取り込む対象が無くなり、先輩の図と同じ形になる。
  await expect(page.locator('#xf-list .xf-row.only-ref')).toHaveCount(0);
  await expect(page.locator('#xf-list .xf-row.only-self')).toHaveCount(0);
  expect(await S.readDoc(page, SENIOR_DIR, 'timer_state')).toBe(NEST_SENIOR);
});

// BLK-junior-20260917-0423: 場面3 のクラス図の周で、先輩のフォルダには TIMER の
// シーケンス図と状態遷移図しか無く、TimerDrv のクラス図が無かった。相手選びは
// 名前の近さだけを見て、近い名前が 1 つも無ければ黙って一覧の先頭を相手にしていたので、
// クラス図に対してシーケンス図を突き合わせた結果が出る。全要素が「片方にしかない」に
// なるため、junior はそれを「先輩が全部書き換えた」と区別できず、フォルダを目で
// 走査して「無い」を確かめ直すところで手順 1 が止まった。
// 相手にその図種が 1 枚も無いことは、手順 1 の答えとして画面が言う。
const CLS_SELF = [
  '@startuml', 'class TimerDrv', 'class DriverBase', 'DriverBase <|-- TimerDrv', '@enduml',
].join('\n');
const CLS_SENIOR_SEQ = [
  '@startuml', 'participant TimerDrv', 'TimerDrv -> HW : Timer_Init()', '@enduml',
].join('\n');
const CLS_SENIOR_STATE = [
  '@startuml', 'state Uninit', 'Uninit --> Ready : Timer_Init', '@enduml',
].join('\n');

test('手順1 先輩に同じ図種が無いことが、突き合わせの答えとして出る', async ({ page }) => {
  await S.bootWithSaveDir(page, MINE_DIR);
  await S.clearDir(page, MINE_DIR);
  await S.clearDir(page, SENIOR_DIR);
  // 先輩のフォルダは TIMER のシーケンス図と状態遷移図だけ (クラス図は無い)。
  await S.putDoc(page, SENIOR_DIR, 'timer_init_sequence', CLS_SENIOR_SEQ);
  await S.putDoc(page, SENIOR_DIR, 'timer_state', CLS_SENIOR_STATE);
  await page.reload();
  await page.waitForSelector('#btn-tab-compare');
  await S.typeDsl(page, CLS_SELF);
  await S.renameActive(page, 'TimerDrv派生クラス図');

  await page.locator('#btn-tab-compare').click();
  await page.locator('#xf-dir').fill(SENIOR_DIR);
  await page.locator('#btn-xf-load').click();
  const summary = page.locator('#xf-summary');
  await expect(summary).toBeVisible();

  // 到達条件その1: 「クラス図が 0 枚」と枚数で言い切る (目で走査しなくてよい)。
  await expect(summary).toContainText('クラス図がありません');
  await expect(summary).toContainText('2 枚中 0 枚');

  // 到達条件その2: それは異常ではなく手順 1 の答えなので、先へ進めると言う。
  await expect(summary).toContainText('先へ進めます');
  await expect(summary).toHaveClass(/clean/);

  // 到達条件その3: 図種の違う図を相手にした差分を出さない
  // (出すと「先輩が全部書き換えた」と見分けが付かない)。
  await expect(page.locator('#xf-list')).toBeHidden();

  // 到達条件その4: それでも中身を見たいときのために、候補は図種つきで選べる。
  const opts = page.locator('#xf-file option');
  await expect(opts).toHaveCount(2);
  await expect(opts.filter({ hasText: 'timer_init_sequence' }))
    .toContainText('シーケンス図。図種が違います');
  await expect(opts.filter({ hasText: 'timer_state' }))
    .toContainText('状態遷移図。図種が違います');
});
