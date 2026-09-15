// @ts-check
// junior 台本 手順8: 保存した .puml を一覧から見つけて開き直す。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);
const NAME = 'GPIO状態遷移(資料用)';

test('手順8 保存した .puml を一覧から見つけて開き直せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, NAME, S.GPIO_STATE);

  await S.openFolder(page);
  const filter = page.locator('#folder-filter');
  if (await filter.count()) { await filter.fill('資料用'); await page.waitForTimeout(400); }
  // 到達条件その1: 名前で見つかる。
  await expect(page.locator('#folder-panel .folder-item[data-file-name="' + NAME + '"]')).toBeVisible();

  await S.openFolderItem(page, NAME);
  // 到達条件その2: 開き直した本文が保存した内容と一致し、編集中の本文で上書きされていない。
  expect(await page.locator('#editor').inputValue()).toContain('GPIOドライバ状態遷移');
  expect(await S.readDoc(page, DIR, NAME)).toContain('GPIOドライバ状態遷移');
});

// BLK-junior-20260912-2103: 開き直した図の図種が本文と合っていないと、その図種でしか
// 使えない機能 (「シーケンス図からアクティビティ図を起こす」) が使えない。
// `Timer_Init()` のようにメッセージ名に丸括弧が付くシーケンス図が、フォルダから
// 開いたときに UseCase と判定されていた。
const SEQ_NAME = 'TIMERドライバ初期化シーケンス';
const SEQ_WITH_PARENS = [
  '@startuml',
  'title TIMERドライバ初期化シーケンス',
  'actor Dev',
  'participant Timer_Driver',
  'participant Mcu_Clock',
  'Dev -> Timer_Driver : Timer_Init()',
  'Timer_Driver -> Mcu_Clock : Mcu_EnableClock()',
  'Mcu_Clock --> Timer_Driver : E_OK',
  'Timer_Driver --> Dev : E_OK',
  '@enduml',
].join('\n');

test('手順8 メッセージ名に丸括弧のあるシーケンス図を、シーケンス図として開き直せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, SEQ_NAME, SEQ_WITH_PARENS);

  await S.openFolder(page);
  await S.openFolderItem(page, SEQ_NAME);
  await page.waitForTimeout(1200);

  // 到達条件その1: 本文が開き、図種が Sequence になっている (UseCase に化けない)。
  expect(await page.locator('#editor').inputValue()).toContain('Timer_Init()');
  expect(await page.locator('#diagram-type').inputValue()).toBe('plantuml-sequence');

  // 到達条件その2: シーケンス図でしか使えない操作が、貼り直さずにそのまま使える。
  await page.keyboard.press('Control+k');
  await page.waitForSelector('#cp-modal');
  await page.locator('#cp-input').fill('アクティビティ');
  await page.waitForTimeout(300);
  const items = page.locator('#cp-list .cp-item');
  await expect(items.first()).toBeVisible();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  await expect(page.locator('#cp-modal')).toBeHidden();
  // 「シーケンス図を開いてから使ってください」で止まらず、たたき台が別タブで開く。
  expect(await page.locator('#diagram-type').inputValue()).toBe('plantuml-activity');
  const draft = await page.locator('#editor').inputValue();
  expect(draft).toContain('start');
  expect(draft).toMatch(/^\s*:.+;\s*$/m);   // シーケンスのメッセージがアクションになっている
});

// BLK-junior-20260915-2346: 同じ図を 1 run の中で 3 回開き直すのに、「直前に開いていた図」が
// どこにも残らず、出戻りのたびに 📂 一覧を開いて 20 枚超の行から名前を目で探し直していた。
// 開いた図を憶えて、一覧の上端と Ctrl+K の両方から名前を探さずに戻れるようにする。
const RECENT_TARGET = 'spi_usecase';
const RECENT_OTHER = 'adc_sequence';

test('手順8 一度開いた図には、名前を探し直さずに一覧の「最近開いた図」から戻れる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, RECENT_TARGET, S.GPIO_STATE);
  await S.putDoc(page, DIR, RECENT_OTHER, S.GPIO_STATE);

  // まだ何も開いていない回は、今までどおりの一覧 (履歴の行は出ない)。
  await S.openFolder(page);
  await page.waitForTimeout(1200);
  await expect(page.locator('#folder-recent')).toHaveCount(0);

  await S.openFolderItem(page, RECENT_TARGET);
  await S.openFolderItem(page, RECENT_OTHER);

  // 到達条件その1: 一覧の上端に、開いた図が新しい順で出る。
  await S.openFolder(page);
  await page.waitForTimeout(1200);
  const recent = page.locator('#folder-recent .folder-recent-item');
  await expect(recent.first()).toBeVisible();
  expect(await recent.nth(0).getAttribute('data-recent-name')).toBe(RECENT_OTHER);
  expect(await recent.nth(1).getAttribute('data-recent-name')).toBe(RECENT_TARGET);

  // 到達条件その2: その 1 件を押すだけで同じ図に戻る (名前を打ち直さない)。
  await recent.nth(1).click();
  await page.waitForTimeout(1200);
  expect(await page.locator('#editor').inputValue()).toContain('GPIOドライバ状態遷移');

  // 到達条件その3: 一覧を開かなくても Ctrl+K から同じ図へ戻れる。
  await S.openFolderItem(page, RECENT_OTHER);
  await page.keyboard.press('Control+k');
  await page.waitForSelector('#cp-modal');
  await page.locator('#cp-input').fill(RECENT_TARGET);
  await page.waitForTimeout(400);
  await expect(page.locator('#cp-list .cp-item').first()).toContainText('最近開いた図');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1400);
  expect(await page.locator('#editor').inputValue()).toContain('GPIOドライバ状態遷移');
});
