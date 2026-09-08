const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('./helpers');

// BLK-reviewer-20260908-1303: 「食い違いの中身を調べる」で 7 枚のうち 6 枚が
// 「文字の上での食い違いは見つかりませんでした（描画の見た目だけの差です）」と出た。
// render は決定的なので、バイトが違う以上 差は必ずある。この文面を primary に
// 見せると「レイアウトだけだから直さなくていい」と誤読される。
// 文字で差が出ないときこそ、保存中の SVG と描き直した SVG を直に比べて構造を言う。
const DIR = saveDirFor(__filename);
const ABS = path.join(__dirname, '..', '..', DIR);

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

async function putFile(page, name, dsl) {
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl, dir: DIR });
}

function render(page, dsl) {
  return page.evaluate(async (d) => {
    const r = await fetch('/render', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: d, mode: 'local' }),
    });
    return r.ok ? r.text() : null;
  }, dsl);
}

async function putRawSvg(page, name, dsl) {
  const svg = await render(page, dsl);
  expect(svg).not.toBeNull();
  fs.writeFileSync(path.join(ABS, name + '.svg'), svg, 'utf-8');
}

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

async function openFolder(page) {
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open .folder-item');
}

// 今の puml。別名 (as X) は図に描かれないので、ここでは使わない
// (別名を使うと puml との突き合わせだけで差が出てしまい、
//  「文字では差が出ないのに実体は違う」という起票の状況を作れない)。
const NOW = [
  '@startuml',
  'participant "受注サービス"',
  'participant "倉庫サービス"',
  '"受注サービス" -> "倉庫サービス": 在庫を引き当てる',
  '"倉庫サービス" -> "受注サービス": 引き当て結果',
  '@enduml',
].join('\n');

// 旧: 出てくる文字は 1 つも変わらないが、participant の並びだけが逆。
const OLD_ORDER = [
  '@startuml',
  'participant "倉庫サービス"',
  'participant "受注サービス"',
  '"受注サービス" -> "倉庫サービス": 在庫を引き当てる',
  '"倉庫サービス" -> "受注サービス": 引き当て結果',
  '@enduml',
].join('\n');

// 旧: 文字は同じまま、矢印の種類だけが違う (点線 + 白抜きの矢尻)。
const OLD_ARROW = [
  '@startuml',
  'participant "受注サービス"',
  'participant "倉庫サービス"',
  '"受注サービス" ->> "倉庫サービス": 在庫を引き当てる',
  '"倉庫サービス" --> "受注サービス": 引き当て結果',
  '@enduml',
].join('\n');

test.describe('BLK-reviewer-1303: 文字に現れない食い違いを「差なし」と言わない', () => {
  test('文字が 1 つも変わらない図でも、構造の違いを名指しする', async ({ page }) => {
    test.setTimeout(180000);
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1303_order', NOW);
    await putRawSvg(page, 'R1303_order', OLD_ORDER);

    await openFolder(page);
    await page.locator('#folder-svg-verify').click();
    await expect(page.locator('#folder-svg-content'))
      .toContainText('ずれ 1 枚', { timeout: 120000 });

    const box = page.locator('[data-svg-diff="R1303_order"]');
    await expect(box).toHaveCount(1);
    // 文字ベースでは差が出ない (これが起票の状況)
    await expect(box.locator('.diff-missing')).toHaveCount(0);
    await expect(box.locator('.diff-leftover')).toHaveCount(0);

    // それでも「見た目だけ」とは言わず、不一致だと言い切る
    const sum = box.locator('.folder-svg-diff-sum');
    await expect(sum).not.toContainText('見た目だけの差');
    // 構造の違いが掴めたときは、位置の差ではなく構造の違いとして言い切る
    await expect(sum).toContainText('構造が違います');
    // 並び順の違いを構造として出す
    await expect(box.locator('.diff-structural')).not.toHaveCount(0);
    await expect(box.locator('.diff-structural').filter({ hasText: '並び順' })).toHaveCount(1);

    // 指摘文にも「作り直してください」まで入る
    const report = page.locator('#folder-svg-diff-report');
    await expect(report).toHaveValue(/R1303_order/);
    await expect(report).not.toHaveValue(/レイアウトだけの差/);
    await expect(report).toHaveValue(/作り直してください/);
  });

  test('矢印の種類だけが違う図を、図形の数の違いとして出す', async ({ page }) => {
    test.setTimeout(180000);
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1303_arrow', NOW);
    await putRawSvg(page, 'R1303_arrow', OLD_ARROW);

    await openFolder(page);
    await page.locator('#folder-svg-verify').click();
    await expect(page.locator('#folder-svg-content'))
      .toContainText('ずれ 1 枚', { timeout: 120000 });

    const box = page.locator('[data-svg-diff="R1303_arrow"]');
    await expect(box.locator('.diff-missing')).toHaveCount(0);
    await expect(box.locator('.diff-leftover')).toHaveCount(0);
    await expect(box.locator('.folder-svg-diff-sum')).not.toContainText('見た目だけの差');
    await expect(box.locator('.diff-structural')).not.toHaveCount(0);
  });

  test('中身が一致している図には、そもそも食い違いの欄が出ない', async ({ page }) => {
    test.setTimeout(180000);
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1303_same', NOW);
    await putRawSvg(page, 'R1303_same', NOW);

    await openFolder(page);
    await page.locator('#folder-svg-verify').click();
    await expect(page.locator('#folder-svg-content'))
      .toContainText('1 枚とも今の puml から作られています', { timeout: 120000 });
    await expect(page.locator('#folder-svg-diff-head')).toHaveCount(0);
  });
});

// friction の実測: 起票者 (reviewer) の手順を数える。
// 従来は「文字の上での食い違いは見つかりませんでした」を受け取った 6 枚それぞれに
// ついて、本当に差が無いのかを手で grep し直していた (1 枚あたり 10 行前後の打鍵)。
test.describe('BLK-reviewer-1303: friction の実測', () => {
  test('「本当に差があるのか」に答えるまでのクリック / キー入力', async ({ page }) => {
    test.setTimeout(180000);
    let clicks = 0, keys = 0;
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1303_m', NOW);
    await putRawSvg(page, 'R1303_m', OLD_ORDER);

    await page.locator('#btn-tab-folder').click(); clicks++;
    await page.waitForSelector('#folder-panel.open .folder-item');
    await page.locator('#folder-svg-verify').click(); clicks++;
    await expect(page.locator('#folder-svg-content'))
      .toContainText('ずれ 1 枚', { timeout: 120000 });

    // ここまでで、画面に「構造が違う」と その中身 が出ている
    const box = page.locator('[data-svg-diff="R1303_m"]');
    await expect(box.locator('.diff-structural')).not.toHaveCount(0);
    await expect(box.locator('.folder-svg-diff-sum')).not.toContainText('見た目だけの差');

    console.log('BLK-reviewer-20260908-1303: クリック ' + clicks + ' / キー ' + keys);
    expect(clicks).toBeLessThanOrEqual(10);
    expect(keys).toBeLessThanOrEqual(50);
  });
});
