// @ts-check
// junior 台本 手順2: 新規タブに先輩の図の構成を真似て一から入力し、
// タイトル・要素名が読める内容か確認する(読みにくければ先に GUI 上で直す)。
const { test, expect } = require('@playwright/test');
const { setDiagramTitle, getEditorText } = require('../helpers');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

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
