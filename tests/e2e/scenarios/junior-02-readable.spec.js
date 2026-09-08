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
