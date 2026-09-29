// @ts-check
// BLK-primary-20260908-1703: 台本の手順 1「対象 14 枚が揃っているか確認する」。
// 📂 一覧は今そこにあるものを並べるだけで期待枚数を持たず、目で名前を数えていた。
// 一覧を「対象set」として登録すると、次に開いた瞬間に 何枚/何枚 と足りない名前が出る。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

const DIR = saveDirFor(__filename);
// 台本と同じ枚数 (13 枚 + ADC 状態遷移 = 14 枚)。
const SET = [];
for (let i = 1; i <= 13; i++) SET.push('P1703_Doc' + i);
SET.push('P1703_AdcState');
const DSL = '@startuml\nstart\n:初期化する;\nstop\n@enduml';

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

// server の DELETE はフォルダ単位なので、消したい 1 枚を除いて置き直す
// (「対象の図が 1 枚無くなった状態」を作るのが目的)。
async function keepOnly(page, names) {
  await clearDir(page);
  for (const n of names) await putFile(page, n);
  await page.waitForTimeout(300);
}

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

// 保存先の一覧は FILES ツリーの「保存先」の右クリック「保存先の一覧を開く」で中央の枠に開く
// (scenarios/_scenario.js の openFolder と同じ経路)。旧経路 (見出しを畳んで開き直し #folder-panel.open を待つ) は
// 一覧が中央の枠へ移ってから見えないまま待ち続けていた (BLK-releaser-20260929-0851-2)。
const S = require('../scenarios/_scenario');
async function openFolder(page) {
  await S.openFolder(page);
  await page.waitForSelector('#folder-panel.open #folder-target-summary');
}

// 閉じるのは中央の枠の一覧だけ (ツリーの保存先節は開いたまま)。
async function closeFolder(page) {
  if (await page.locator('#folder-panel.is-list').count()) {
    await page.locator('#folder-list-close').click();
    await page.waitForSelector('#folder-panel:not(.is-list)', { state: 'attached' });
  }
}

test.describe('BLK-primary-1703: 対象setとの突合カウント', () => {
  test.beforeEach(async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    for (const n of SET) await putFile(page, n);
    await page.waitForTimeout(400);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
  });

  test('未登録のうちは「未登録」と登録の入口が出る', async ({ page }) => {
    await openFolder(page);
    const line = page.locator('#folder-target-summary');
    await expect(line).toContainText('対象set: 未登録');
    await expect(page.locator('#folder-target-set')).toHaveText('今の一覧を対象setにする');
    await expect(page.locator('#folder-target-clear')).toHaveCount(0);
  });

  test('今の一覧を対象setにすると 14/14 が見出しに出る', async ({ page }) => {
    await openFolder(page);
    await page.locator('#folder-target-set').click();
    const line = page.locator('#folder-target-summary');
    await expect(line).toHaveText('対象set: 14/14 揃っています');
    await expect(line).toHaveAttribute('data-target-expected', '14');
    await expect(line).toHaveAttribute('data-target-present', '14');
    await expect(page.locator('#folder-target-set')).toHaveText('対象setを今の一覧で取り直す');
  });

  test('1 枚消えると開いた瞬間に 13/14 と足りない名前が出る', async ({ page }) => {
    await openFolder(page);
    await page.locator('#folder-target-set').click();
    await expect(page.locator('#folder-target-summary')).toHaveText('対象set: 14/14 揃っています');
    await closeFolder(page);

    await keepOnly(page, SET.filter((n) => n !== 'P1703_AdcState'));
    await openFolder(page);
    const line = page.locator('#folder-target-summary');
    // 数えるのは一覧をスクロールする前。開いた瞬間の 1 行で過不足が読める。
    await expect(line).toContainText('対象set: 13/14');
    await expect(line).toContainText('足りない: P1703_AdcState');
    await expect(line).toHaveClass(/target-set-short/);
  });

  test('対象外の図が増えても期待枚数は 14 のまま', async ({ page }) => {
    await openFolder(page);
    await page.locator('#folder-target-set').click();
    await closeFolder(page);

    await putFile(page, 'P1703_Scratch');
    await openFolder(page);
    const line = page.locator('#folder-target-summary');
    await expect(line).toHaveAttribute('data-target-expected', '14');
    await expect(line).toContainText('対象set: 14/14 揃っています（対象外 1 枚）');
  });

  test('行の [対象にする] で 1 枚だけ足せる', async ({ page }) => {
    await openFolder(page);
    await page.locator('#folder-target-set').click();
    await expect(page.locator('#folder-target-summary')).toHaveAttribute('data-target-expected', '14');

    await closeFolder(page);
    await putFile(page, 'P1703_Extra');
    await page.waitForTimeout(300);
    await openFolder(page);   // 開き直して一覧を取り直す
    await page.locator('button.folder-target[data-target-name="P1703_Extra"]').click();
    const line = page.locator('#folder-target-summary');
    await expect(line).toHaveAttribute('data-target-expected', '15');
    await expect(line).toHaveText('対象set: 15/15 揃っています');
    await expect(page.locator('button.folder-target[data-target-name="P1703_Extra"]'))
      .toHaveText('対象');
  });

  test('対象setを外すと未登録に戻る', async ({ page }) => {
    await openFolder(page);
    await page.locator('#folder-target-set').click();
    await expect(page.locator('#folder-target-summary')).toHaveText('対象set: 14/14 揃っています');
    await page.locator('#folder-target-clear').click();
    await expect(page.locator('#folder-target-summary')).toContainText('対象set: 未登録');
  });
});
