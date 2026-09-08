const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

// BLK-reviewer-20260908-1203-wish: 一覧は「内容ずれ」までは言えるが、何と何で
// 食い違っているかは出さない。ずれた図を 1 枚ずつ開いて grep で旧名や欠落を
// 突き止める手順 6・7 を、「一覧を見て指摘文をコピーする」に置き換える。
const DIR = saveDirFor(__filename);
const ABS = path.join(__dirname, '..', '..', '..', DIR);

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

// 印を持たない svg (書き出し元の印を刻む前からある実データ) を直に置く。
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

// 旧: 在庫サービス という participant があり、返信メッセージが無かった頃の図。
const OLD = [
  '@startuml',
  'participant "受注サービス" as Order',
  'participant "在庫サービス" as Stock',
  'Order -> Stock: 在庫を引き当てる',
  '@enduml',
].join('\n');
// 今: participant の表示名が変わり、返信メッセージが増えた。
const NOW = [
  '@startuml',
  'participant "受注サービス" as Order',
  'participant "倉庫サービス" as Stock',
  'Order -> Stock: 在庫を引き当てる',
  'Stock -> Order: 引き当て結果',
  '@enduml',
].join('\n');

test.describe('BLK-reviewer-1203-wish: 食い違いの中身を一覧が言う', () => {
  test('ずれた図の欠落と旧名を名指しし、指摘文にまとめる', async ({ page }) => {
    test.setTimeout(180000);
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1203w_a', NOW);
    await putFile(page, 'R1203w_b', NOW);
    await putRawSvg(page, 'R1203w_a', NOW);   // 今の姿
    await putRawSvg(page, 'R1203w_b', OLD);   // 前の内容のまま

    await openFolder(page);
    await page.locator('#folder-svg-verify').click();
    await expect(page.locator('#folder-svg-content'))
      .toContainText('ずれ 1 枚', { timeout: 120000 });

    // 食い違った図だけが中身つきで並ぶ
    await expect(page.locator('#folder-svg-diff-head')).toHaveText('内容ずれの中身（1 枚）');
    const box = page.locator('[data-svg-diff="R1203w_b"]');
    await expect(box).toHaveCount(1);
    await expect(page.locator('[data-svg-diff="R1203w_a"]')).toHaveCount(0);

    // 欠落 (今の puml にあって svg に無い) と 残存 (svg に残る旧名)
    await expect(box.locator('.diff-missing').filter({ hasText: '倉庫サービス' })).toHaveCount(1);
    await expect(box.locator('.diff-missing').filter({ hasText: '引き当て結果' })).toHaveCount(1);
    await expect(box.locator('.diff-leftover').filter({ hasText: '在庫サービス' })).toHaveCount(1);

    // そのまま primary へ渡せる指摘文
    const report = page.locator('#folder-svg-diff-report');
    await expect(report).toHaveValue(/R1203w_b/);
    await expect(report).toHaveValue(/SVG に無い participant: 倉庫サービス/);
    await expect(report).toHaveValue(/SVG に残っている古い文字: 在庫サービス/);
    await expect(report).not.toHaveValue(/R1203w_a/);
  });

  test('指摘文をコピーできる', async ({ page }) => {
    test.setTimeout(180000);
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1203w_c', NOW);
    await putRawSvg(page, 'R1203w_c', OLD);

    await openFolder(page);
    await page.locator('#folder-svg-verify').click();
    await expect(page.locator('#folder-svg-diff-head')).toBeVisible({ timeout: 120000 });
    await page.locator('#folder-svg-diff-copy').click();
    await expect(page.locator('#folder-svg-diff-copy')).toHaveText('コピーしました');
  });

  test('中身が一致していれば、食い違いの欄そのものが出ない', async ({ page }) => {
    test.setTimeout(180000);
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1203w_d', NOW);
    await putRawSvg(page, 'R1203w_d', NOW);

    await openFolder(page);
    await page.locator('#folder-svg-verify').click();
    await expect(page.locator('#folder-svg-content'))
      .toContainText('1 枚とも今の puml から作られています', { timeout: 120000 });
    await expect(page.locator('#folder-svg-diff-head')).toHaveCount(0);
    await expect(page.locator('#folder-svg-diff-report')).toHaveCount(0);
  });
});
