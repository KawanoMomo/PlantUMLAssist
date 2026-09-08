// @ts-check
// junior 台本 手順 1「persona-data\junior の自分の GPIO 図(前周までの最新版)を開く」。
//
// BLK-junior-20260908-2003-wish: 資料化の周は「前周に作った状態遷移図を開く」から
// 始まるのに、その図が実データに残っていないことがある。一覧はファイル名を並べる
// だけなので「GPIO の 8 図種のうち状態遷移だけ無い」は名前を読み比べないと言えず、
// 手順 1 で初めて詰まっていた。棚卸しが、開く前に欠けを名指しすることを確かめる。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

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
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open #folder-inv-summary');
}

async function pickComponent(page, name) {
  await page.selectOption('#folder-inv-pick', name);
  await page.waitForSelector('#folder-panel.open #folder-inv-summary[data-inv-component="' + name + '"]');
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

  test('一覧を開くと、部品ごとの図種の棚卸しが出る', async ({ page }) => {
    await openFolder(page);
    const opts = await page.locator('#folder-inv-pick option').allTextContents();
    expect(opts.some((t) => t.indexOf('GPIOドライバ') >= 0)).toBe(true);
  });

  test('GPIO を選ぶと「状態遷移図が無い」が見出しで名指しされる', async ({ page }) => {
    await openFolder(page);
    await pickComponent(page, 'GPIOドライバ');
    const line = page.locator('#folder-inv-summary');
    await expect(line).toHaveClass(/inv-short/);
    const text = await line.textContent();
    expect(text).toContain('8 図種中 6 種あり');
    expect(text).toContain('状態遷移図');
    expect(text).toContain('配置図');
  });

  test('図種ごとの行に「あり / なし」が並び、なしの行にはファイル名が無い', async ({ page }) => {
    await openFolder(page);
    await pickComponent(page, 'GPIOドライバ');
    const rows = page.locator('#folder-panel .folder-inv-row');
    await expect(rows).toHaveCount(8);

    const state = page.locator('.folder-inv-row[data-inv-kind="状態遷移図"]');
    await expect(state).toHaveAttribute('data-inv-present', '0');
    await expect(state.locator('.folder-inv-mark')).toHaveText('なし');
    await expect(state.locator('button.folder-inv-file')).toHaveCount(0);

    const seq = page.locator('.folder-inv-row[data-inv-kind="シーケンス図"]');
    await expect(seq).toHaveAttribute('data-inv-present', '1');
    await expect(seq.locator('button.folder-inv-file'))
      .toHaveText('GPIOドライバ初期化シーケンス');
  });

  test('「あり」の行のファイル名を押すとその図が開く（手順 1 が完了する）', async ({ page }) => {
    await openFolder(page);
    await pickComponent(page, 'GPIOドライバ');
    await page.locator('.folder-inv-row[data-inv-kind="シーケンス図"] button.folder-inv-file').click();
    await page.waitForTimeout(600);
    const name = await page.evaluate(() => {
      const doc = window.MA.workspace.getActive();
      return doc ? doc.name : '';
    });
    expect(name).toContain('GPIOドライバ初期化シーケンス');
  });

  test('欠けを埋めたら棚卸しが「欠けはありません」に変わる', async ({ page }) => {
    await putFile(page, 'GPIOドライバ状態遷移');
    await putFile(page, 'GPIOドライバ配置');
    await page.waitForTimeout(300);
    await openFolder(page);
    await pickComponent(page, 'GPIOドライバ');
    const line = page.locator('#folder-inv-summary');
    await expect(line).toHaveClass(/inv-ok/);
    await expect(line).toContainText('欠けはありません');
    await expect(page.locator('.folder-inv-row[data-inv-kind="状態遷移図"]'))
      .toHaveAttribute('data-inv-present', '1');
  });

  test('図種が名前から分からない図は「なし」に数えず別に出す', async ({ page }) => {
    await openFolder(page);
    await pickComponent(page, 'GPIOドライバ');
    // diagram1 は GPIO の欠けとして数えられていない (GPIO は 6/8 のまま)。
    await expect(page.locator('#folder-inv-summary')).toHaveAttribute('data-inv-have', '6');
    await page.selectOption('#folder-inv-pick', { index: 0 });
    await expect(page.locator('#folder-inv-summary')).toContainText('部品を選ぶ');
  });
});
