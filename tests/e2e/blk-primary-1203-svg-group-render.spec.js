// @ts-check
// BLK-primary-20260908-1203: reviewer に名指しされた「SVG が古い」5 枚を直すのに、
// 一覧側に作り直す手段が無く、1 枚ずつ開いて ⟳Render → Export▾ → SVG を 5 回繰り返していた。
// 「古い SVG を作り直す」は古い・無い・内容ずれを無条件に全部作り直すので狙えない。
// 名前の行ごとに「この N 枚だけ作り直す」を置き、その行の図だけが直ることを確かめる。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('./helpers');

const DIR = saveDirFor(__filename);
const A1 = '@startuml\nparticipant A\nA -> B: go\n@enduml';
const A2 = '@startuml\nparticipant A\nA -> B: go\nB -> C: next\n@enduml';

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

async function putSvg(page, name) {
  return page.evaluate(async (a) => {
    const r = await fetch('/autosave-svg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' }),
    });
    return r.status;
  }, { name, dir: DIR });
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

// 古い 1 枚 (svg はあるが puml の方が新しい) と、無い 1 枚を作る。
async function seedStaleAndMissing(page, prefix) {
  await clearDir(page);
  await putFile(page, prefix + '_stale', A1);
  expect(await putSvg(page, prefix + '_stale')).toBe(200);
  // mtime は秒精度なので、puml を後から書き直して確実に新しくする。
  await page.waitForTimeout(1200);
  await putFile(page, prefix + '_stale', A2);
  await putFile(page, prefix + '_missing', A1);
}

test.describe('BLK-primary-1203: 名前の行ごとに作り直す', () => {
  test('「SVG が古い」「SVG が無い」の行それぞれに「この N 枚だけ作り直す」が付く', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await bootWithDir(page);
    await seedStaleAndMissing(page, 'P1203a');
    await openFolder(page);

    const stale = page.locator('#folder-panel .folder-svg-names[data-svg-status="stale"]');
    await expect(stale.locator('button.folder-svg-names-render')).toHaveText('この 1 枚だけ作り直す');
    const missing = page.locator('#folder-panel .folder-svg-names[data-svg-status="missing"]');
    await expect(missing.locator('button.folder-svg-names-render')).toHaveText('この 1 枚だけ作り直す');
  });

  test('押した行の図だけが直り、ほかの行はそのまま残る', async ({ page }) => {
    test.setTimeout(150 * 1000);
    await bootWithDir(page);
    await seedStaleAndMissing(page, 'P1203b');
    await openFolder(page);

    await page.locator('#folder-panel .folder-svg-names[data-svg-status="stale"] button.folder-svg-names-render')
      .click();
    // 作り直しが終わると一覧が組み直され、結果が 1 行で出る。
    await expect(page.locator('#folder-panel .folder-svg-note')).toContainText('1 枚を作り直しました', { timeout: 60000 });

    // 古い行は消え、無い行は手つかずで残っている。
    await expect(page.locator('#folder-panel .folder-svg-names[data-svg-status="stale"]')).toHaveCount(0);
    const missing = page.locator('#folder-panel .folder-svg-names[data-svg-status="missing"]');
    await expect(missing.locator('button.folder-svg-name')).toHaveText(['P1203b_missing']);
  });

  test('直すものが無ければ行そのものが出ない', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'P1203c_ok', A1);
    expect(await putSvg(page, 'P1203c_ok')).toBe(200);

    await openFolder(page);
    await expect(page.locator('#folder-panel .folder-svg-names')).toHaveCount(0);
    await expect(page.locator('#folder-panel button.folder-svg-names-render')).toHaveCount(0);
  });
});
