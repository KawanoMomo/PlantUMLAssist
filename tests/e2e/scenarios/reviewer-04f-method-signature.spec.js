// @ts-check
// reviewer 台本 手順4.9: シーケンスのメッセージの引数・戻り値と、クラス図のメソッド宣言が一致するか。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

// 同じ突合を GUI 側が保存の**前**に掛ける (BLK-reviewer-20260915-0007-wish)。
// reviewer が次の tick で指摘を返すまで待たなくても、書いた本人が保存の瞬間に気付く。
const CLASS_DOC = [
  '@startuml',
  'class Spi_Driver {',
  '  +Spi_Init(cfg): Std_ReturnType',
  '}',
  'class ClockCtrl {',
  '  +Reset(): void',
  '}',
  '@enduml',
].join('\n');

const SEQ_OK = [
  '@startuml',
  'participant Spi_Driver',
  'App -> Spi_Driver : Spi_Init(cfg)',
  '@enduml',
].join('\n');

// 自動保存の debounce を長く取って開く。ここで見たいのは「手で押した保存」が
// 書き込む前に止まることなので、打鍵の途中で自動保存が走ると何を見ているか
// 分からなくなる (自動保存は止めない —— 止めると編集内容を失う)。
async function bootManualSave(page, dir) {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config', JSON.stringify({
        enabled: true, debounceMs: 60000, restoreMode: 'auto', backend: 'file', fileDir: d,
      }));
    } catch (e) {}
  }, dir);
  await page.goto('/plantuml-assist.html');
  await page.waitForSelector('#editor');
  await page.waitForTimeout(600);
}

// 手で押す保存。一覧から開いた図には錠がかかっているので、最初の 1 回だけ
// 「このファイルを書き換える」に答えてから押し直す。
async function answerLock(page) {
  const modal = page.locator('#source-lock-modal');
  if (await modal.isVisible().catch(() => false)) {
    await page.locator('#source-lock-overwrite').click();
    await page.waitForTimeout(800);
  }
}

async function pressSave(page) {
  await answerLock(page);
  await page.locator('#top-save').click();
  await page.waitForTimeout(700);
  await answerLock(page);
  if (await page.locator('#save-guard-overlay').isHidden().catch(() => true)) {
    // 錠に答えた直後の押下は保存へ進まないので、もう一度押す。
    await page.locator('#top-save').click();
    await page.waitForTimeout(700);
  }
}

const SEQ_GAP = [
  '@startuml',
  'participant Spi_Driver',
  'participant ClockCtrl',
  'Spi_Driver -> ClockCtrl : EnableClock(id)',
  'App -> Spi_Driver : Spi_Init(cfg)',
  '@enduml',
].join('\n');

test('手順4.9 クラス図に無いメソッドがシーケンスで呼ばれていれば挙がる', () => {
  const declared = R.methods(R.DOCS.driver_common_class).map((m) => m.replace(/^[+\-#]\s*/, '').split('(')[0]);
  // 到達条件その1: クラス図から宣言が読める。
  expect(declared).toContain('Init');
  expect(declared).toContain('Write');

  // 到達条件その2: シーケンスの呼び出し名を宣言と突き合わせられる。
  const calls = R.messages(R.DOCS.spi_init_sequence).map((m) => m.replace(/^\w+?_Driver_/, ''));
  const undeclaredCalls = calls.filter((c) => !declared.includes(c) && !/Done$/.test(c));
  expect(undeclaredCalls).toEqual([]);
});

// 保存を押したその場で、同じ保存フォルダのクラス図と突き合わせて止める。
test('手順4.9 宣言の無い呼び出しは、保存を書き込む前に GUI が止めて一覧で出す', async ({ page }) => {
  await bootManualSave(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'driver_common_class', CLASS_DOC);
  await S.putDoc(page, DIR, 'spi_init_sequence', SEQ_OK);

  // 📂 一覧からシーケンス図を開く (ここでフォルダの中身が読まれ、突合の相手が揃う)。
  await S.openFolderItem(page, 'spi_init_sequence');

  // クラス図に宣言の無い呼び出しを 1 行足して保存する。
  await S.typeDsl(page, SEQ_GAP);
  await pressSave(page);

  const guard = page.locator('#save-guard-overlay');
  await expect(guard).toBeVisible();
  await expect(page.locator('#sgd-summary')).toContainText('宣言の無いメソッド呼び出し');
  await expect(page.locator('#sgd-list')).toContainText('EnableClock');
  // 足し先の 1 行がそのまま出る (何をすれば消えるかが帯の中で分かる)。
  await expect(page.locator('#sgd-list')).toContainText('ClockCtrl : +EnableClock');

  // 止まっている間、押した保存は進んでいない。状態バーを空にしてからもう一度
  // 押し、「どこに保存したか」の文言が出ないことで確かめる。
  await page.evaluate(() => { document.getElementById('status-save-result').textContent = ''; });
  await page.locator('#top-save').click();
  await page.waitForTimeout(900);
  await expect(guard).toBeVisible();
  expect((await page.locator('#status-save-result').textContent()) || '').toBe('');

  // 承知のうえで押せば、そのまま保存できる (作業は止めない)。
  await page.locator('#btn-sgd-save').click();
  await page.waitForTimeout(1500);
  await expect(guard).toBeHidden();
  expect((await page.locator('#status-save-result').textContent()) || '').not.toBe('');
  expect(await S.readDoc(page, DIR, 'spi_init_sequence')).toContain('EnableClock');
});

// 宣言が揃っている保存は、これまでどおり黙って通る。
test('手順4.9 宣言が揃っていれば保存は止まらない', async ({ page }) => {
  await bootManualSave(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'driver_common_class', CLASS_DOC);
  await S.putDoc(page, DIR, 'spi_init_sequence', SEQ_OK);

  await S.openFolderItem(page, 'spi_init_sequence');
  await S.typeDsl(page, SEQ_OK + "\n' ok");
  await pressSave(page);
  await page.waitForTimeout(800);

  await expect(page.locator('#save-guard-overlay')).toBeHidden();
  expect(await S.readDoc(page, DIR, 'spi_init_sequence')).toContain("' ok");
});
