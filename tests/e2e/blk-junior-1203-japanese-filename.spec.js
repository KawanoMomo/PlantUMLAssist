// @ts-check
// BLK-junior-20260907-1203: 図の名前が日本語だと保存フォルダ経由の保存・一覧・読み込みが
// 全て黙って失敗していた (server.py / workspace.js が名前を [A-Za-z0-9_-]+ に限っていた)。
// クライアントとサーバを通しで見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('./helpers');

const DIR = saveDirFor(__filename);
const JP = 'GPIOドライバユースケース';
const DSL = '@startuml\nactor 開発者\nusecase (GPIO を初期化する)\n開発者 --> (GPIO を初期化する)\n@enduml';

function ws(page, fn, ...args) {
  return page.evaluate(fn, ...args);
}

test.describe('BLK-junior-20260907-1203 日本語名の図を保存フォルダで扱える', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate((d) => window.fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' }), DIR)
      .catch(() => {});
  });

  test('UC-1: 日本語名で保存でき、一覧に出て、同じ中身で読み戻せる', async ({ page }) => {
    await gotoApp(page);
    const saved = await page.evaluate(([dir, name, dsl]) =>
      window.MA.workspace.saveToFile({ name: name, dsl: dsl }, dir), [DIR, JP, DSL]);
    expect(saved).toBe(true);

    const files = await page.evaluate((dir) => window.MA.workspace.listFiles(dir), DIR);
    expect(files).toContain(JP);

    const back = await page.evaluate(([dir, name]) =>
      window.MA.workspace.loadFile(name, dir), [DIR, JP]);
    expect(back).toBe(DSL);
  });

  test('UC-2: タブ名に日本語を付けても削られない', async ({ page }) => {
    await gotoApp(page);
    const name = await page.evaluate((n) => {
      var id = window.MA.workspace.getActiveId();
      return window.MA.workspace.rename(id, n).name;
    }, JP);
    expect(name).toBe(JP);
  });

  test('UC-3: パス区切りや Windows の禁止文字は今までどおり弾く', async ({ page }) => {
    await gotoApp(page);
    const results = await page.evaluate(() => {
      var w = window.MA.workspace;
      return {
        slash: w.isValidName('CAN/state'),
        backslash: w.isValidName('CAN\\state'),
        colon: w.isValidName('a:b'),
        reserved: w.isValidName('nul'),
        jp: w.isValidName('UARTドライバ 状態遷移'),
      };
    });
    expect(results.slash).toBe(false);
    expect(results.backslash).toBe(false);
    expect(results.colon).toBe(false);
    expect(results.reserved).toBe(false);
    expect(results.jp).toBe(true);
  });

  test('UC-4: サーバも危ない名前は 400 で断る', async ({ page }) => {
    await gotoApp(page);
    const status = await page.evaluate((dir) => window.fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: '../escape', dsl: 'x', dir: dir }),
    }).then((r) => r.status), DIR);
    expect(status).toBe(400);
  });
});
