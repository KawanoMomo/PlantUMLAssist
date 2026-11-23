// @ts-check
// junior 台本 手順2: 新規タブに先輩の図の構成を真似て一から入力し、
// タイトル・要素名が読める内容か確認する(読みにくければ先に GUI 上で直す)。
const { test, expect } = require('@playwright/test');
const { setDiagramTitle, getEditorText } = require('../helpers');
const S = require('./_scenario');

// 保存先の節は既定で開いている (design 10a)。開いていれば畳んでから開き直し、
// 一覧を今の中身で描き直す (直に押すと、開いていたときに畳んでしまう)。
async function openFolder(page) {
  // BLK-owner-20260924-0637-1: 旧 📂 一覧は保存先の右クリック「保存先の一覧を開く」で中央の枠に開く。
  await require('./_scenario').openFolder(page);
  await page.waitForSelector('#folder-panel.open');
}


const DIR = S.dirFor(__filename);

// 読み込み直した直後の画面は init (保存先の取り込み /prefs を最大 3 秒待って走る) の前の骨格で、
// 札やボタンは見えていても押しても何も起きない。全体実行 (--workers=4) で /prefs が遅い回に
// 手順が落ちていたので、reload の後は押せるようになった印を待つ。

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

  // 名前と本文だけの表は、まとめて足す入口 (種別チップの「まとめて」) の中にある。
  await page.locator('#seq-tail-kind-chip-bulk').click();
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

// BLK-human-20260923-1330: 自己メッセージ (`A -> A`) は PlantUML の正当な記法なのに、
// 「まとめて追加」が「From と To が同じです」で確定ボタンごと止めていた。
// 検証は「止める」ではなく「知らせる」: 警告は出るが追加はできる。
test('手順2 同じ参加者へのメッセージを含む構成も、警告は出たうえでまとめて追加できる', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#preview-svg', { timeout: 5000 });
  await page.locator('#diagram-type').selectOption('plantuml-sequence');
  await page.waitForTimeout(500);

  // 名前と本文だけの表は、まとめて足す入口 (種別チップの「まとめて」) の中にある。
  await page.locator('#seq-tail-kind-chip-bulk').click();
  await page.locator('#seq-scaffold-open').click();
  await expect(page.locator('#seq-sc-modal')).toBeVisible();

  await page.locator('#seq-sc-title').fill('TIMER内部処理');
  await page.locator('#seq-sc-ptype-0').selectOption('actor');
  await page.locator('#seq-sc-pname-0').fill('Dev');
  await page.locator('#seq-sc-ptype-1').selectOption('participant');
  await page.locator('#seq-sc-pname-1').fill('Timer');
  await page.waitForTimeout(200);

  // 1 本目は普通のメッセージ、2 本目を自己メッセージにする。
  await page.locator('#seq-sc-mfrom-0').selectOption('Dev');
  await page.locator('#seq-sc-mto-0').selectOption('Timer');
  await page.locator('#seq-sc-mtext-0').fill('Timer_Init()');
  await page.locator('#seq-sc-add-msg').click();
  await page.locator('#seq-sc-mfrom-1').selectOption('Timer');
  await page.locator('#seq-sc-mto-1').selectOption('Timer');
  await page.locator('#seq-sc-mtext-1').fill('内部処理');
  await page.waitForTimeout(300);

  // 到達条件その1: 警告は出る (何を確かめてほしいかが読める)。
  const notice = page.locator('#seq-sc-errors');
  await expect(notice).toContainText('From と To');
  await expect(notice.locator('.scaffold-warn')).toHaveCount(1);
  await expect(notice.locator('.scaffold-error')).toHaveCount(0);

  // 到達条件その2: 警告が出ていても「追加」は押せる (止められない)。
  const confirm = page.locator('#seq-sc-confirm');
  await expect(confirm).toBeEnabled();
  await expect(page.locator('#seq-sc-preview')).toContainText('Timer -> Timer : 内部処理');

  await confirm.click();
  await page.waitForTimeout(400);

  // 到達条件その3: 自己メッセージが矢印の形のまま DSL に入る。
  const t = await getEditorText(page);
  expect(t).toContain('Dev -> Timer : Timer_Init()');
  expect(t).toContain('Timer -> Timer : 内部処理');

  // 到達条件その4: プレビューに自己メッセージの矢印が描かれる。
  await page.waitForTimeout(2500);
  await expect(page.locator('#preview-svg svg')).toBeVisible();
  const selfMsg = await page.evaluate(() => {
    const svg = document.querySelector('#preview-svg svg');
    if (!svg) return null;
    const hit = Array.prototype.some.call(svg.querySelectorAll('text'),
      (n) => (n.textContent || '').indexOf('内部処理') >= 0);
    // 自己メッセージは往路と復路に分かれて描かれるので、本数ではなく
    // 「両方のラベルが図に出ている」ことで確かめる。
    const init = Array.prototype.some.call(svg.querySelectorAll('text'),
      (n) => (n.textContent || '').indexOf('Timer_Init()') >= 0);
    // PlantUML 1.2026.7 からメッセージは g.message に入らない。矢じり (<polygon>) の数で数える。
    return { drawn: hit, initDrawn: init, messages: svg.querySelectorAll('g.message').length || svg.querySelectorAll('polygon').length };
  });
  expect(selfMsg, 'プレビューが描かれている').not.toBeNull();
  expect(selfMsg.drawn, '自己メッセージのラベルが図に出る').toBe(true);
  expect(selfMsg.initDrawn, '通常のメッセージも並んで出る').toBe(true);
  expect(selfMsg.messages >= 2, '矢印が描かれている').toBe(true);
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

// BLK-owner-20260929-0351-1: 関係のフォームの上の欄 (From) は、どの種類でも図に描かれる矢の根元。
// 継承・実現では子 (実装クラス) が From。以前は「親 (From)」で、子を From に選ぶと継承が逆向きに入った。
const DRV_CLASS = [
  '@startuml',
  'interface IDrv',
  'abstract class BaseDrv',
  'class SpiDrv',
  '@enduml',
].join('\n');

test('手順2 継承・実現は子 (実装クラス) を From に選べば、その向きのまま入り、選び直しても同じ順で出る', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR + '-from-root');
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(400);
  await S.typeDsl(page, DRV_CLASS);
  await page.waitForTimeout(1500);

  // 継承: 上の欄は 子 (From)、下の欄は 親 (To)。子の SpiDrv を From に選ぶ。
  await page.locator('#cl-tail-kind-chip-relation').click();
  await page.locator('.cl-tail-rkind-card[data-value="inheritance"]').click();
  await expect(page.locator('#cl-tail-from-label')).toHaveText('子 (From)');
  await expect(page.locator('#cl-tail-to-label')).toHaveText('親 (To)');
  await page.locator('#cl-tail-from').selectOption('SpiDrv');
  await page.locator('#cl-tail-to').selectOption('BaseDrv');
  await expect(page.locator('#cl-tail-rpreview')).toContainText('BaseDrv <|-- SpiDrv');
  await expect(page.locator('#cl-tail-rpreview')).toContainText('子: SpiDrv / 親: BaseDrv');
  await page.locator('#cl-tail-add').click();
  await page.waitForTimeout(800);
  let t = await getEditorText(page);
  expect(t).toContain('BaseDrv <|-- SpiDrv');
  expect(t).not.toContain('SpiDrv <|-- BaseDrv');

  // 実現: 実装クラス (From) / インターフェース (To)。
  if (!(await page.locator('#cl-tail-rkind').count())) await page.locator('#cl-tail-kind-chip-relation').click();
  await page.locator('.cl-tail-rkind-card[data-value="implementation"]').click();
  await expect(page.locator('#cl-tail-from-label')).toHaveText('実装クラス (From)');
  await expect(page.locator('#cl-tail-to-label')).toHaveText('インターフェース (To)');
  await page.locator('#cl-tail-from').selectOption('SpiDrv');
  await page.locator('#cl-tail-to').selectOption('IDrv');
  await page.locator('#cl-tail-add').click();
  await page.waitForTimeout(1500);
  t = await getEditorText(page);
  expect(t).toContain('IDrv <|.. SpiDrv');
  expect(t).not.toContain('SpiDrv <|.. IDrv');

  // 図で継承の線を押すと、編集パネルも 子 (From) = SpiDrv / 親 (To) = BaseDrv の順で出る。
  const line = t.split('\n').findIndex((l) => l === 'BaseDrv <|-- SpiDrv') + 1;
  const rel = page.locator('#overlay-layer [data-type="relation"][data-line="' + line + '"]').first();
  await expect(rel).toBeAttached({ timeout: 10000 });
  const rb = await rel.boundingBox();
  await page.mouse.click(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await page.waitForTimeout(400);
  await expect(page.locator('#cl-rel-from')).toHaveValue('SpiDrv');
  await expect(page.locator('#cl-rel-to')).toHaveValue('BaseDrv');
  await expect(page.locator('#props-content')).toContainText('子 (From)');
  await expect(page.locator('#props-content')).toContainText('親 (To)');
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
  await openFolder(page);
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

// BLK-owner-20260924-2232-2: 台本の成長規則 (コンポーネント図 → ユースケース図) で、白紙から
// 境界を先に置いて中身を足す順でも起こせる。境界だけの本文 (`package "Mcal" {` / `}`) は
// PlantUML がクラス図として描くので、以前は右パネルがクラスの追加フォームに替わり、
// レールを押し直しても戻らず、部品もユースケースも 1 つも足せなかった。
for (const c of [
  { rail: 'plantuml-component', pre: 'co', name: 'コンポーネント', boundary: 'Mcal', kind: 'component', elem: 'Dio' },
  { rail: 'plantuml-usecase', pre: 'uc', name: 'ユースケース', boundary: 'ECU', kind: 'usecase', elem: 'Init' },
]) {
  test('手順2 白紙の' + c.name + '図に境界を先に置き、同じ図種のまま中へ要素を足せる', async ({ page }) => {
    await S.bootWithSaveDir(page, DIR + '-boundary-first');
    await page.locator('#btn-tab-new').click();
    await page.waitForTimeout(400);
    await page.locator('#rail-types .rail-btn[data-type="' + c.rail + '"]').click();
    await page.waitForTimeout(800);

    await page.locator('#' + c.pre + '-tail-kind-chip-package').click();
    await page.locator('#' + c.pre + '-tail-label').fill(c.boundary);
    await page.locator('#' + c.pre + '-tail-add').click();
    await page.waitForTimeout(1500);   // 描画 (SVG の図種の照合) まで待つ
    expect(await getEditorText(page)).toMatch(new RegExp('\\{\\n\\}'));

    // 境界しか無くても、図種も右パネルも選んだ図種のまま (クラスの追加フォームに替わらない)。
    await expect(page.locator('#diagram-type')).toHaveValue(c.rail);
    await expect(page.locator('[id^="cl-tail-kind-chip-"]')).toHaveCount(0);
    await expect(page.locator('#' + c.pre + '-tail-add')).toBeVisible();
    // レールの同じ図種を押し直しても本文は入れ替わらない。
    await page.locator('#rail-types .rail-btn[data-type="' + c.rail + '"]').click();
    await page.waitForTimeout(400);
    expect(await getEditorText(page)).toContain('"' + c.boundary + '" {');
    await expect(page.locator('#' + c.pre + '-tail-add')).toBeVisible();

    // 次の要素の「追加する位置」は今置いた境界の中で、足すとその `{ }` に入る。
    await page.locator('#' + c.pre + '-tail-kind-chip-' + c.kind).click();
    await expect(page.locator('#' + c.pre + '-tail-place option:checked')).toHaveText('境界『' + c.boundary + '』の中');
    await page.locator('#' + c.pre + '-tail-alias').fill(c.elem);
    await page.locator('#' + c.pre + '-tail-add').click();
    await page.waitForTimeout(1200);
    expect(await getEditorText(page)).toMatch(new RegExp('"' + c.boundary + '" \\{\\n\\s+' + c.kind + ' ' + c.elem + '\\n\\}'));
    await expect(page.locator('#diagram-type')).toHaveValue(c.rail);
    // 描き直した図でも、境界の中の要素を押して選べる。
    await expect(page.locator('#overlay-layer .selectable[data-id="' + c.elem + '"]').first())
      .toBeAttached({ timeout: 10000 });
  });
}
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

// BLK-junior-20260915-0406-wish: 先輩の図を手本に SPI の状態遷移図を打ち直すとき、
// 遷移ラベル (Spi_Init / Spi_Transmit / TransferComplete …) は先輩のシーケンス図に
// も出てくるはずだが、GUI は図ごとに独立していて名前の対応を教えてくれない。
// 合っているかは先輩の図を別に開いて目で見比べるしかなかった。
// 図をまたぐ名前の候補 (部品の名前帳) は TICKET-owner-20261115-2140-prune で外した。
// 遷移ラベルは欄に打って足せることと、先輩の図に書かないことを確かめる。
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

test('手順2 遷移ラベルを欄に打って足せる (名前帳のチップは出ない)', async ({ page }) => {
  await S.bootWithSaveDir(page, MINE_DIR);
  await S.clearDir(page, MINE_DIR);
  await S.clearDir(page, SENIOR_DIR);
  await S.putDoc(page, SENIOR_DIR, 'spi_init_sequence', SENIOR_SPI_SEQ);
  await page.reload();
  await page.waitForSelector('html[data-app-ready="1"]');
  await page.locator('#diagram-type').selectOption('plantuml-state');
  await page.waitForTimeout(400);
  await S.renameActive(page, 'spi_state');
  await S.typeDsl(page, MY_SPI_STATE);
  await page.waitForTimeout(1200);

  await page.locator('#st-tail-kind').selectOption('transition');
  await page.waitForSelector('#st-tail-trig');

  // TICKET-owner-20261115-2140-prune: 部品の名前帳 (別の図の名前を欄の下に並べるチップ) は外した。
  // 遷移ラベルは欄に打って足す。欄の下に名前帳は出ない。
  await expect(page.locator('#st-tail-trig-vocab')).toHaveCount(0);

  await page.locator('#st-tail-trig').fill('Spi_Transmit');
  await page.locator('#st-tail-from').selectOption('Idle');
  await page.locator('#st-tail-to').selectOption('Busy');
  await page.locator('#st-tail-add').click();
  await page.waitForTimeout(400);
  expect(await getEditorText(page)).toContain('Idle --> Busy : Spi_Transmit');

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


// BLK-junior-20260915-0606: SPI の活動図 (手順2) を打ち直すのに、実在メソッド名
// (Spi_Init / Spi_Reset / Spi_Transmit / Notify) を知る手段が先輩の相乗りクラス図
// (driver_common_class、8 部品が 1 枚) しか無かった。図をまたいで名前を拾う候補は
// TICKET-owner-20261115-2140-prune で外した (先輩の図は ⇔ 先輩の図 で横に置いて読む)。
// ここでは活動図の本文欄に打って、位置を選んで足せることを確かめる。
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

test('手順2 活動図の本文を欄に打って、位置を選んで足せる', async ({ page }) => {
  await S.bootWithSaveDir(page, MINE_DIR);
  await S.clearDir(page, MINE_DIR);
  await S.clearDir(page, SENIOR_DIR);
  await S.putDoc(page, SENIOR_DIR, 'driver_common_class', SENIOR_COMMON_CLASS);
  await page.reload();
  await page.waitForSelector('html[data-app-ready="1"]');
  await page.locator('#diagram-type').selectOption('plantuml-activity');
  await page.waitForTimeout(400);
  await S.renameActive(page, 'spi_activity');
  await S.typeDsl(page, MY_SPI_ACT);
  await page.waitForTimeout(1200);

  // 活動図タブを開いたまま。右ペインの「末尾に追加 / Action」の本文欄に打つ。
  // 部品の名前帳 (欄の下のチップ) は TICKET-owner-20261115-2140-prune で外した。
  await page.locator('#ac-tail-kind').selectOption('action');
  await page.waitForSelector('#ac-tail-text');
  await expect(page.locator('#ac-tail-text-vocab')).toHaveCount(0);

  await page.locator('#ac-tail-text').fill('Spi_Init()');
  // BLK-owner-20260925-0312-4: 処理欄も他の図種と同じく Enter で確定 (改行は Shift+Enter)。
  await page.locator('#ac-tail-text').press('Enter');
  await expect.poll(async () => getEditorText(page)).toContain(':Spi_Init();');
  await page.waitForTimeout(400);
  await page.locator('#ac-tail-text').click();
  await page.keyboard.type('Clk_A');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Clk_B');
  await expect(page.locator('#ac-tail-text')).toHaveValue('Clk_A\nClk_B');
  expect(await getEditorText(page)).not.toContain('Clk_A');
  await page.locator('#ac-tail-text').fill('');

  // 到達条件その5 (BLK-owner-20260924-2259-prune): 追加のフォームは 1 つ。途中に入れるときも同じフォームの
  // 「追加する位置」で選ぶ (「＋ この位置に挿入」の 2 つ目のフォームは無い)。確定は 6 図種で同じ「+ 追加」。
  await expect(page.locator('#ac-ins-point')).toHaveCount(0);
  await expect(page.locator('#ac-tail-add')).toHaveText('+ 追加');
  const places = await page.locator('#ac-tail-where option').allTextContents();
  expect(places[0]).toBe('図の末尾');
  const afterInit = places.findIndex((t) => t.includes('Spi_Init()') && t.includes('の後'));
  expect(afterInit).toBeGreaterThan(0);
  await page.locator('#ac-tail-where').selectOption({ index: afterInit });
  await page.locator('#ac-tail-kind-chip-if').click();
  await page.locator('#ac-tail-cond').fill('送信バッファ空?');
  await page.locator('#ac-tail-add').click();
  await page.waitForTimeout(400);
  const acLines = (await getEditorText(page)).split('\n').map((l) => l.trim());
  const initAt = acLines.indexOf(':Spi_Init();');
  expect(acLines[initAt + 1]).toBe('if (送信バッファ空?) then (yes)');
  expect(acLines.indexOf('endif')).toBeLessThan(acLines.indexOf('stop'));
  // BLK-owner-20260927-0745-1: 枠は空の枝で入り、頼んでいない空のアクション `:;` を書かない。
  // 枝のはじめは中身が無くても「追加する位置」で選べ、足した処理はその枝の中に入る。
  expect(acLines).not.toContain(':;');
  const placesIf = await page.locator('#ac-tail-where option').allTextContents();
  const noHead = placesIf.findIndex((t) => t.includes('送信バッファ空?') && t.includes('no 側のはじめ'));
  expect(noHead).toBeGreaterThan(0);
  await page.locator('#ac-tail-kind-chip-action').click();
  await page.locator('#ac-tail-where').selectOption({ index: noHead });
  await page.locator('#ac-tail-text').fill('エラー通知');
  await page.locator('#ac-tail-text').press('Enter');
  await expect.poll(async () => getEditorText(page)).toContain(':エラー通知;');
  const acLinesNo = (await getEditorText(page)).split('\n').map((l) => l.trim());
  expect(acLinesNo[acLinesNo.indexOf('else (no)') + 1]).toBe(':エラー通知;');
  expect(acLinesNo[acLinesNo.indexOf('else (no)') + 2]).toBe('endif');
  expect(acLinesNo).not.toContain(':;');

  // BLK-owner-20260925-0312-4: 「start の直後」はフローの先頭として選べ、処理を打って Enter で start の次の行に入る。
  const places2 = await page.locator('#ac-tail-where option').allTextContents();
  expect(places2.join('|')).not.toContain('フローのはじめ');
  const afterStart = places2.findIndex((t) => t.trim().startsWith('start の直後'));
  expect(afterStart).toBeGreaterThan(0);
  await page.locator('#ac-tail-kind-chip-action').click();
  await page.locator('#ac-tail-where').selectOption({ index: afterStart });
  await expect(page.locator('#ac-tail-add')).toBeEnabled();
  await expect(page.locator('#ac-tail-where-note')).toBeHidden();
  await page.locator('#ac-tail-text').fill('クロック有効化');
  await page.locator('#ac-tail-text').press('Enter');
  await expect.poll(async () => getEditorText(page)).toContain(':クロック有効化;');
  const acLines2 = (await getEditorText(page)).split('\n').map((l) => l.trim());
  expect(acLines2[acLines2.indexOf('start') + 1]).toBe(':クロック有効化;');

  // 先輩のファイルは読むだけ (書き換えない)。
  expect(await S.readDoc(page, SENIOR_DIR, 'driver_common_class')).toBe(SENIOR_COMMON_CLASS);
});

// BLK-builder-20260924-1252-4 (design 4a): 先輩の構成を真似てクラス図を起こすとき、属性の名前・可視性は
// 右パネルの 1 行 1 レコードで直す。閉じた行は「記号・シグネチャ・編集」だけで、図の属性を押すと同じ行が
// その場で開き、入力に合わせて「組み立てられる行」が変わる。並べ替えと削除は開いた行の中にある。
test('手順2 クラスの属性は図で押した行がその場で開き、組み立てられる行を見てから直せる', async ({ page }) => {
  await S.bootPlain(page);
  await S.typeDsl(page, ['@startuml', 'class SpiDrv {', '  - rxbuf : int', '  + Spi_Init() : void', '}', '@enduml'].join('\n'));
  await page.waitForSelector('#overlay-layer rect[data-type="member"]');
  // 到達条件その1: クラスを選ぶと、属性・メソッドは閉じた 1 行で、右端に「編集」。消すボタンは閉じた行に無い。
  const cls = page.locator('#preview-svg text', { hasText: 'SpiDrv' }).first();
  const cb = await cls.boundingBox();
  await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2);
  const row = page.locator('.cl-member-row[data-member-kind="attribute"]').first();
  await expect(row.locator('.cl-mem-sig')).toHaveText('rxbuf : int');
  await expect(row.locator('.cl-mem-vis')).toHaveText('−');
  await expect(row.locator('.cl-mem-edit')).toHaveText('編集');
  await expect(page.locator('[id^="cl-mem-del-"]')).toHaveCount(0);
  // 到達条件その2: 図の属性を押すと同じ行が開く (「編集」を押したのと同じ)。
  const mem = page.locator('#preview-svg text', { hasText: 'rxbuf' }).first();
  const mb = await mem.boundingBox();
  await page.mouse.click(mb.x + mb.width / 2, mb.y + mb.height / 2);
  await expect(page.locator('#cl-mem-preview-0')).toHaveText('- rxbuf : int');
  // 到達条件その3: 名前と可視性を変えると、押す前に入る行が読める。更新で本文に入る。
  await page.locator('#cl-mem-name-0').fill('rxBuffer');
  await page.locator('.cl-vis-btn[data-vis-for="cl-mem-vis-0"][data-vis="#"]').click();
  await expect(page.locator('#cl-mem-preview-0')).toHaveText('# rxBuffer : int');
  await page.locator('#cl-mem-update-0').click();
  await expect.poll(() => getEditorText(page)).toContain('# rxBuffer : int');
  // 到達条件その4: 更新の後も同じ行が開いたまま。開いた行の「削除」でその行だけ消える。
  await expect(page.locator('#cl-mem-preview-0')).toHaveText('# rxBuffer : int');
  await page.locator('#cl-mem-del-0').click();
  await expect.poll(() => getEditorText(page)).not.toContain('rxBuffer');
  expect(await getEditorText(page)).toContain('Spi_Init() : void');
});

// BLK-owner-20260925-0312-1 / BLK-human-20260925-0351: フォームだけで起こした図は、タブを替えるまで
// タブの本文にも自動保存にも届かず、そのままリロードすると `@startuml / @enduml` に戻って消えた。
// フォームで足した行も、本文欄で打ったときと同じ時に同じ経路でタブ・保存フォルダ・タブの印に届く。
test('手順2 フォームだけで足した直後にリロードしても本文が残り、保存フォルダにも書かれている', async ({ page }) => {
  const dir = DIR + '-form-autosave';
  await S.bootWithSaveDir(page, dir);
  await S.clearDir(page, dir);
  await page.reload();
  await page.waitForSelector('html[data-app-ready="1"]');

  // ＋ で白紙のタブを開き、レールで状態遷移図にして、本文欄に触らず右パネルの追加だけで起こす。
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(400);
  await page.locator('#rail-types .rail-btn[data-type="plantuml-state"]').click();
  await page.waitForTimeout(800);
  const name = await page.evaluate(() => window.MA.workspace.getActive().name);
  for (const id of ['Idle', 'Running']) {
    await page.locator('#st-tail-kind').selectOption('state');
    await page.locator('#st-tail-id').fill(id);
    await page.locator('#st-tail-add').click();
    await page.waitForTimeout(400);
  }
  await page.locator('#st-tail-kind').selectOption('transition');
  await page.waitForSelector('#st-tail-trig');
  await page.locator('#st-tail-from').selectOption('Idle');
  await page.locator('#st-tail-to').selectOption('Running');
  await page.locator('#st-tail-trig').fill('Start');
  await page.locator('#st-tail-add').click();
  await page.waitForTimeout(400);
  expect(await getEditorText(page)).toContain('Idle --> Running : Start');

  // 到達条件その1: タブを替えなくても、タブの本文 (リロードで戻る先) に入っている。
  const ws = await page.evaluate(() => window.localStorage.getItem('plantuml-workspace') || '');
  expect(ws).toContain('Idle --> Running : Start');

  // 到達条件その2: 1 回の確定は 1 回の Ctrl+Z で戻り、Ctrl+Y で戻せる (保存の経路と取り違えない)。
  // 追加の後はフォームの欄に入力の続きが残るので、欄から出てから押す (欄の中の Ctrl+Z は欄の文字を戻す)。
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  expect(await getEditorText(page)).not.toContain('Idle --> Running : Start');
  expect(await getEditorText(page)).toContain('state Running');
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(300);
  expect(await getEditorText(page)).toContain('Idle --> Running : Start');

  // 到達条件その3: 自動保存 (保存先 = ファイル) の debounce のあと、ディスクにも書かれている。
  await expect.poll(async () => (await S.readDoc(page, dir, name)) || '', { timeout: 5000 })
    .toContain('Idle --> Running : Start');
  // 下端の「HH:MM に自動保存」もこの図の名前で進み、タブの印は保存した本文と照らした状態になる
  // (書けた後に ●/○ が残らない。本文欄で打ったときと同じ)。
  await expect(page.locator('#status-autosave')).toContainText(name + '.puml');
  await expect(page.locator('#tab-bar .tab.active .tab-dot')).toHaveCount(0);

  // 到達条件その4: そのままリロードしても、フォームで足した行が消えない。
  await S.reopenApp(page);
  await page.waitForTimeout(600);
  const back = await page.evaluate(() => window.MA.workspace.getActive().dsl);
  expect(back).toContain('state Idle');
  expect(back).toContain('Idle --> Running : Start');
  expect(await getEditorText(page)).toContain('Idle --> Running : Start');

  // BLK-owner-20260930-0311-2: 注釈の本文欄も、他の欄と同じく Enter で確定 (Shift+Enter は改行)。6 図種で同じ。
  await page.locator('#st-tail-kind').selectOption('note');
  await page.waitForSelector('#st-tail-ntext');
  await page.locator('#st-tail-target').selectOption('Running');
  await page.locator('#st-tail-ntext').click();
  await page.keyboard.type('起動済み');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('停止で戻る');
  await expect(page.locator('#st-tail-ntext')).toHaveValue('起動済み\n停止で戻る');
  expect(await getEditorText(page)).not.toContain('起動済み');
  await page.keyboard.press('Enter');
  await expect.poll(async () => getEditorText(page)).toContain('起動済み');
  expect(await getEditorText(page)).toContain('停止で戻る');

  // BLK-owner-20260926-0550-1: 確定した後もキャレットは名前欄に残り、名前を打って Enter を続けるだけで
  // 次の 1 件が入る (欄を押し直さない)。参加者の種類 (actor) も確定後に保つ。
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(400);
  await page.locator('#rail-types .rail-btn[data-type="plantuml-sequence"]').click();
  await page.waitForTimeout(800);
  await page.locator('#seq-tail-kind-chip-participant').click();
  await page.locator('#seq-tail-ptype').selectOption('actor');
  await page.locator('#seq-tail-alias').click();
  for (const who of ['Dev', 'Ops']) {
    await page.keyboard.type(who);
    await page.keyboard.press('Enter');
    await expect.poll(async () => getEditorText(page)).toContain('actor ' + who);
    // 右パネルが描き直されて名前欄が空に戻り、キャレットはその欄にある (押し直さずに次を打てる)。
    await expect(page.locator('#seq-tail-alias')).toHaveValue('');
    await expect(page.locator('#seq-tail-alias')).toBeFocused();
    await expect(page.locator('#seq-tail-ptype')).toHaveValue('actor');
  }

  // クラス図: 名前欄も Enter で続けて 2 つ。関係の To は From と同じ要素を既定にせず (自分への線を黙って書かない)、
  // 確定後は関係の種類と From を保って To だけ空に戻る。
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(400);
  await page.locator('#rail-types .rail-btn[data-type="plantuml-class"]').click();
  await page.waitForTimeout(800);
  await page.locator('#cl-tail-kind-chip-class').click();
  await page.locator('#cl-tail-alias').click();
  for (const cls of ['Spi_Driver', 'Driver_Base', 'Can_Driver']) {
    await page.keyboard.type(cls);
    await page.keyboard.press('Enter');
    await expect.poll(async () => getEditorText(page)).toContain('class ' + cls);
    await expect(page.locator('#cl-tail-alias')).toHaveValue('');
    await expect(page.locator('#cl-tail-alias')).toBeFocused();
  }
  await page.locator('#cl-tail-kind-chip-relation').click();
  await page.locator('#cl-tail-rkind-cards [data-value="inheritance"]').click();
  await expect(page.locator('#cl-tail-to')).toHaveValue('');
  const beforeRel = await getEditorText(page);
  await page.locator('#cl-tail-add').click();
  // To の知らせは 5 図種で同じ共通部 (欄の見出しの語。TICKET-owner-20261123-2322-2)。
  await expect(page.locator('#cl-tail-rpreview')).toContainText(/「[^」]*\(To\)」を選んでください \(一覧で選ぶ\)/);
  await expect(page.locator('#cl-tail-to')).toBeFocused();
  expect(await getEditorText(page)).toBe(beforeRel);
  await page.locator('#cl-tail-from').selectOption('Spi_Driver');
  await page.locator('#cl-tail-to').selectOption('Driver_Base');
  await page.locator('#cl-tail-add').click();
  await expect.poll(async () => getEditorText(page)).toMatch(/Driver_Base <\|-- Spi_Driver/);
  await expect(page.locator('#cl-tail-rkind')).toHaveValue('inheritance');
  await expect(page.locator('#cl-tail-from')).toHaveValue('Spi_Driver');
  await expect(page.locator('#cl-tail-to')).toHaveValue('');
  // 2 本目は To を選ぶだけ (種類・From は選び直さない)。
  await page.locator('#cl-tail-from').selectOption('Can_Driver');
  await page.locator('#cl-tail-to').selectOption('Driver_Base');
  await page.locator('#cl-tail-add').click();
  await expect.poll(async () => getEditorText(page)).toMatch(/Driver_Base <\|-- Can_Driver/);
  expect(await getEditorText(page)).not.toMatch(/Spi_Driver -- Spi_Driver/);
});

// BLK-human-20260925-0352 / BLK-owner-20260925-0312-2: 左レールの図種を押すと、書きかけの図の本文が
// 別の図種の見本に差し替わり (ファイル名はそのまま)、Ctrl+S で保存済みの図を潰していた。
// ＋ で開いただけのタブも空の .puml として書かれ、図種を替えると `{名前}_{図種}.puml` が増えていた。
test('手順2 図種を替えても前の図のファイルの中身と名前が変わらず、保存フォルダに別名ファイルが増えない', async ({ page }) => {
  const D = DIR + '-rail';
  await S.bootWithSaveDir(page, D);
  await S.clearDir(page, D);
  const rail = (t) => page.locator('#rail-types .rail-btn[data-type="plantuml-' + t + '"]');
  const active = () => page.evaluate(() => window.MA.workspace.getActive());
  const tabs = () => page.evaluate(() => window.MA.workspace.list().map((d) => ({ name: d.name, type: d.diagramType, dsl: d.dsl })));

  await S.typeDsl(page, S.GPIO_SEQ);
  const seqName = (await active()).name;
  await expect.poll(() => S.readDoc(page, D, seqName)).toContain('participant Gpio_Driver');
  const seqOnDisk = await S.readDoc(page, D, seqName);

  // 到達条件その1: 利用者の行があるタブでレールの ST を押すと、そのタブは替わらず、状態遷移の新しいタブが開く。
  await rail('state').click();
  await expect(page.locator('#diagram-type')).toHaveValue('plantuml-state');
  let all = await tabs();
  expect(all.length).toBe(2);
  expect(all[0]).toEqual({ name: seqName, type: 'plantuml-sequence', dsl: S.GPIO_SEQ });
  const stName = (await active()).name;
  expect(stName).not.toBe(seqName);
  expect(await getEditorText(page)).not.toContain('Gpio_Driver');
  // 到達条件その2: 見本のままのタブはディスクへ書かない。前の図のファイルは中身も名前もそのまま。
  await page.waitForTimeout(800);
  expect(await S.listDir(page, D)).toEqual([seqName]);
  expect(await S.readDoc(page, D, seqName)).toBe(seqOnDisk);

  // 到達条件その3: 見本のままのタブでレールを押すと、そのタブの図種だけが替わる (名前もタブの数も同じ)。
  await rail('component').click();
  await expect(page.locator('#diagram-type')).toHaveValue('plantuml-component');
  all = await tabs();
  expect(all.length).toBe(2);
  expect((await active()).name).toBe(stName);
  expect((await active()).diagramType).toBe('plantuml-component');

  // 到達条件その4: ＋ で開いてレールを押しただけのタブは、保存フォルダに何も書かない。
  await page.locator('#btn-tab-new').click();
  await rail('activity').click();
  await rail('class').click();
  await page.waitForTimeout(800);
  expect(await S.listDir(page, D)).toEqual([seqName]);
  const clsName = (await active()).name;

  // 到達条件その5: 行を足した時点で、そのタブの名前のまま 1 枚だけ書かれる (`_{図種}` の別名は作らない)。
  await S.typeDsl(page, ['@startuml', 'class GpioDriver', '@enduml'].join('\n'));
  await expect.poll(() => S.listDir(page, D)).toEqual(expect.arrayContaining([seqName, clsName]));
  await page.waitForTimeout(600);
  const files = await S.listDir(page, D);
  expect(files.sort()).toEqual([seqName, clsName].sort());
  expect(files.some((n) => /_(class|component|activity|state|sequence|usecase)$/.test(n))).toBe(false);

  // 到達条件その6: 中身のある図からレールで CMP を押すと、見本のままの CMP タブがあればそこへ移る (タブを増やさない)。
  await rail('component').click();
  expect((await active()).name).toBe(stName);
  expect((await tabs()).length).toBe(3);

  // 到達条件その7: 元の図に戻って Ctrl+S を押しても、シーケンス図のまま保存される。
  await page.locator('#tab-bar .tab[data-doc-name="' + seqName + '"]').click();
  await expect(page.locator('#diagram-type')).toHaveValue('plantuml-sequence');
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(600);
  expect(await S.readDoc(page, D, seqName)).toContain('participant Gpio_Driver');
  expect((await S.listDir(page, D)).sort()).toEqual([seqName, clsName].sort());
});
