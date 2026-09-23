// @ts-check
// junior 台本 手順7: 書き出した画像が保存先に保存されたことを確認する。
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);
const ABS = S.absDirFor(__filename);

test('手順7 書き出した画像が保存先に置かれたことを確かめられる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.typeDsl(page, S.GPIO_STATE);
  await S.renameActive(page, 'gpio_state_doc');

  const download = await (await S.exportVia(page, 'exp-svg'));
  expect(download).not.toBeNull();
  fs.mkdirSync(ABS, { recursive: true });
  const out = path.join(ABS, 'gpio_state_doc.svg');
  await download.saveAs(out);

  // 到達条件: 保存先にファイルが実在し、中身が自分の図である。
  expect(fs.existsSync(out)).toBe(true);
  const svg = fs.readFileSync(out, 'utf8');
  expect(svg).toContain('<svg');
  expect(svg).toContain('Ready');
});

// BLK-junior-20260915-0106: 手順7 が求めるのは「指摘の内容が反映されているか」で、
// 置けたこと (BLK-junior-20260915-0007) だけでは足りない。資料化したその場で
// 保存先の本文を読み直して出し、モーダルを閉じて📂一覧 → フィルタ入力 → 行クリック、
// という同じ確認をもう一度たどらずに済ませる。
test('手順7 資料化した本文を、モーダルを閉じずに保存先から読み直して確かめられる', async ({ page }) => {
  const NOTE = '指摘2 への回答: ClockCtrl は意図的に割愛';
  const DSL = [
    '@startuml',
    'title GPIOドライバ状態遷移',
    '[*] --> Uninit',
    'Uninit --> Ready : Gpio_Init',
    'note "' + NOTE + '" as N1',
    '@enduml',
  ].join('\n');

  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'GPIOドライバ状態遷移', DSL);
  await page.reload();
  await page.waitForTimeout(800);

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-docset').click();
  await page.waitForSelector('#docset-scope', { state: 'visible' });
  await page.locator('#dsc-one').click();
  await page.waitForSelector('#mexp-modal', { state: 'visible' });
  await page.waitForTimeout(600);

  await page.locator('#mexp-component').selectOption('GPIOドライバ');
  await page.locator('#mexp-kind').selectOption('状態遷移図');
  await page.waitForTimeout(200);

  const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await page.locator('#mexp-run').click();
  await dl;

  // 到達条件: モーダルは開いたまま、保存先から読み直した本文がその場に出る。
  await expect(page.locator('#mexp-readback')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#mexp-modal')).toBeVisible();
  await expect(page.locator('#mexp-readback-text')).toContainText('読み直しました');
  await expect(page.locator('#mexp-readback-text')).toContainText('同じです');

  // 指摘の内容 (note) が、開き直さずにそのまま読める。
  const body = await page.locator('#mexp-readback-body').textContent();
  expect(body).toContain(NOTE);
  expect(body).toContain('(資料用)');

  // 探している言葉は打ち込めば当たる (長い本文でも目で追わなくてよい)。
  await page.locator('#mexp-readback-find').fill('note');
  await page.waitForTimeout(200);
  await expect(page.locator('#mexp-readback-body .mexp-rb-hit')).toHaveCount(1);
});

// BLK-junior-20260915-0206-wish: 手順6・7 が求めるのは「6 図種とも揃っているか」で、
// 1 枚ぶんの確かめ (置けたか・本文が同じか) では答えられない。部品を選んで
// サマリカードを開けば、図種ごとの絵と保存日時が 1 画面に並ぶ ——
// 一覧を部品名でフィルタして 1 枚ずつ開き直す確認が要らなくなる。
test('手順6 部品サマリカードで、図種が揃っているかを 1 画面で見返せる', async ({ page }) => {
  const SEQ = [
    '@startuml', 'title TIMERドライバ初期化シーケンス',
    'participant Timer_Driver', 'Timer_Driver -> Timer_Driver : Timer_Init', '@enduml',
  ].join('\n');
  const STATE = [
    '@startuml', 'title TIMERドライバ状態遷移',
    '[*] --> Uninit', 'Uninit --> Ready : Timer_Init', '@enduml',
  ].join('\n');

  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // 状態遷移図だけ資料化済み (資料用あり)、シーケンス図はまだ資料用が無い。
  await S.putDoc(page, DIR, 'TIMERドライバ初期化シーケンス', SEQ);
  await S.putDoc(page, DIR, 'TIMERドライバ状態遷移', STATE);
  await S.putDoc(page, DIR, 'TIMERドライバ状態遷移(資料用)', STATE);
  await page.reload();
  await page.waitForTimeout(800);

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-docset').click();
  await page.waitForSelector('#docset-scope', { state: 'visible' });
  await page.locator('#dsc-one').click();
  await page.waitForSelector('#mexp-modal', { state: 'visible' });
  await page.waitForTimeout(600);
  await page.locator('#mexp-component').selectOption('TIMERドライバ');
  await page.waitForTimeout(200);

  // 到達条件: 1 押しで、その部品の図種が絵と保存日時ごと並ぶ。
  await page.locator('#mexp-summary-toggle').click();
  await expect(page.locator('#mexp-summary')).toBeVisible();
  const cards = page.locator('#mexp-summary-cards figure.mexp-card');
  await expect(cards).toHaveCount(2);
  await expect(page.locator('#mexp-summary-text')).toContainText('2 図種中 1 図種が資料化済み');

  // 揃っていない図種は、カードを見比べる前に名指しされる。
  await expect(page.locator('#mexp-summary-missing')).toContainText('シーケンス図');
  await expect(page.locator('#mexp-summary-cards figure[data-kind="状態遷移図"]'))
    .toHaveAttribute('data-status', 'fresh');
  await expect(page.locator('#mexp-summary-cards figure[data-kind="シーケンス図"]'))
    .toHaveAttribute('data-status', 'none');

  // 保存日時がカードに出る (一覧を開いて日時を読みに行かない)。
  await expect(page.locator('#mexp-summary-cards figure[data-kind="状態遷移図"] .mexp-card-saved'))
    .toContainText('資料用 20');
  await expect(page.locator('#mexp-summary-cards figure[data-kind="シーケンス図"] .mexp-card-saved'))
    .toContainText('資料用なし');

  // 絵がその場で描かれる (どの図が抜けているかを名前だけで思い出さなくてよい)。
  await expect(page.locator('#mexp-summary-cards figure[data-kind="状態遷移図"] .mexp-thumb svg'))
    .toBeVisible({ timeout: 60000 });
  const svg = await page.locator('#mexp-summary-cards figure[data-kind="状態遷移図"] .mexp-thumb').innerHTML();
  expect(svg).toContain('<svg');
});
