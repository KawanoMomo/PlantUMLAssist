const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

// 保存先の節は既定で開いている (design 10a)。開いていれば畳んでから開き直し、
// 一覧を今の中身で描き直す (直に押すと、開いていたときに畳んでしまう)。
async function openFolder(page) {
  if (await page.locator('#folder-panel.open').count()) await page.locator('#btn-tab-folder').click();
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open');
}

// BLK-reviewer-20260908-1203: 「一致 / 不一致」までは自動で分かるが、不一致の中身
// (旧 participant 名が残っている・状態や遷移が欠落している) を primary への指摘文に
// 書くには、7 枚それぞれで puml と旧 svg を grep で突き合わせていた。
// 印 (svgSource) だけで「内容ずれ」と分かった図についても、一覧から中身を出せることを見る。
const DIR = saveDirFor(__filename);

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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl, dir: DIR });
}

// その時点の puml から svg を書き出す (server が元 puml の sha1 を svg に刻む)。
async function exportSvg(page, name, dsl) {
  return page.evaluate(async (a) => {
    const r = await fetch('/render', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: a.dsl, mode: 'local' }),
    });
    const svg = await r.text();
    const w = await fetch('/autosave-svg', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, svg: svg }),
    });
    return w.status;
  }, { name, dsl, dir: DIR });
}

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

const OLD = [
  '@startuml',
  'participant "受注サービス" as Order',
  'participant "在庫サービス" as Stock',
  'Order -> Stock: 在庫を引き当てる',
  '@enduml',
].join('\n');
const NOW = [
  '@startuml',
  'participant "受注サービス" as Order',
  'participant "倉庫サービス" as Stock',
  'Order -> Stock: 在庫を引き当てる',
  'Stock -> Order: 引き当て結果',
  '@enduml',
].join('\n');

test.describe('BLK-reviewer-1203: 内容ずれの中身を grep せずに読む', () => {
  test('印でずれと分かった図も、一覧から中身まで出せる（クリック 3 / キー 0）', async ({ page }) => {
    test.setTimeout(180000);
    await bootWithDir(page);
    await clearDir(page);
    // 旧内容で書き出した svg (印つき) を残したまま、puml だけ今の内容に進める。
    await putFile(page, 'R1203_a', OLD);
    expect(await exportSvg(page, 'R1203_a', OLD)).toBe(200);
    await putFile(page, 'R1203_a', NOW);
    await putFile(page, 'R1203_b', NOW);
    expect(await exportSvg(page, 'R1203_b', NOW)).toBe(200);

    // ここから reviewer の手順。押した回数と打ったキーを数える。
    let clicks = 0;
    let keys = 0;

    await openFolder(page); clicks++;
    await page.waitForSelector('#folder-panel.open .folder-item');
    // 印だけで「内容ずれ」と分かっている状態 (確かめ直してはいない)
    await expect(page.locator('#folder-svg-content')).toContainText('ずれ 1 枚');

    const scan = page.locator('#folder-svg-diff-scan');
    await expect(scan).toHaveText('食い違いの中身を調べる（1 枚）');
    await scan.click(); clicks++;

    // 何が食い違うのかがそのまま出る
    const box = page.locator('[data-svg-diff="R1203_a"]');
    await expect(box).toHaveCount(1, { timeout: 120000 });
    await expect(box.locator('.diff-missing').filter({ hasText: '倉庫サービス' })).toHaveCount(1);
    await expect(box.locator('.diff-missing').filter({ hasText: '引き当て結果' })).toHaveCount(1);
    await expect(box.locator('.diff-leftover').filter({ hasText: '在庫サービス' })).toHaveCount(1);
    await expect(page.locator('[data-svg-diff="R1203_b"]')).toHaveCount(0);

    // 指摘文をコピーして終わり
    await page.locator('#folder-svg-diff-copy').click(); clicks++;
    await expect(page.locator('#folder-svg-diff-copy')).toHaveText('コピーしました');

    expect(clicks).toBeLessThanOrEqual(10);
    expect(keys).toBeLessThanOrEqual(50);
    console.log('BLK-reviewer-20260908-1203: クリック ' + clicks + ' / キー ' + keys);
  });

  test('調べ終えた図は対象から外れる', async ({ page }) => {
    test.setTimeout(180000);
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1203_c', OLD);
    expect(await exportSvg(page, 'R1203_c', OLD)).toBe(200);
    await putFile(page, 'R1203_c', NOW);

    await openFolder(page);
    await page.waitForSelector('#folder-panel.open .folder-item');
    await page.locator('#folder-svg-diff-scan').click();
    await expect(page.locator('#folder-svg-diff-head')).toBeVisible({ timeout: 120000 });
    await expect(page.locator('#folder-svg-diff-scan')).toHaveText('食い違いの中身は調べてあります');
    await expect(page.locator('#folder-svg-diff-scan')).toBeDisabled();
  });

  test('ずれた図が無ければ押させない', async ({ page }) => {
    test.setTimeout(180000);
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1203_d', NOW);
    expect(await exportSvg(page, 'R1203_d', NOW)).toBe(200);

    await openFolder(page);
    await page.waitForSelector('#folder-panel.open .folder-item');
    await expect(page.locator('#folder-svg-diff-scan')).toBeDisabled();
    await expect(page.locator('#folder-svg-diff-head')).toHaveCount(0);
  });
});
