const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('./helpers');

// BLK-reviewer-20260908-0823-wish: SVG が無い図に気付けたのは 17 枚の puml と svg を
// 目で突き合わせた偶然の産物だった。一覧の要約に枚数は出ていたが、どの図かは 22 行の
// 中から印を探すしかない。書き出し漏れの図の名前をその場に並べ、押せば開けることを見る。
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

const A1 = '@startuml\nparticipant A\nA -> B: go\n@enduml';
const A2 = '@startuml\nparticipant A\nA -> B: go\nB -> C: next\n@enduml';

test.describe('BLK-reviewer-0823-wish: 書き出し漏れの図を名前で出す', () => {
  test('SVG が無い図・古い図の名前が一覧のその場に並ぶ', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0823_stale', A1);
    expect(await putSvg(page, 'R0823_stale')).toBe(200);
    // mtime は秒精度なので、puml を後から書き直して確実に新しくする。
    await page.waitForTimeout(1200);
    await putFile(page, 'R0823_stale', A2);
    await putFile(page, 'R0823_missing', A1);
    await putFile(page, 'R0823_fresh', A1);
    expect(await putSvg(page, 'R0823_fresh')).toBe(200);

    await openFolder(page);
    const missing = page.locator('#folder-panel .folder-svg-names[data-svg-status="missing"]');
    await expect(missing).toContainText('SVG が無い');
    await expect(missing.locator('button.folder-svg-name')).toHaveText(['R0823_missing']);
    const stale = page.locator('#folder-panel .folder-svg-names[data-svg-status="stale"]');
    await expect(stale.locator('button.folder-svg-name')).toHaveText(['R0823_stale']);
    // 追いついている図は名前に出さない (直す必要が無いため)。
    await expect(page.locator('#folder-panel button.folder-svg-name', { hasText: 'R0823_fresh' }))
      .toHaveCount(0);
  });

  test('名前を押すとその図が開く (探し直しが要らない)', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0823_open', A2);

    await openFolder(page);
    await page.locator('#folder-panel button.folder-svg-name', { hasText: 'R0823_open' }).click();
    await expect(page.locator('#editor')).toHaveValue(A2);
  });

  test('全部書き出してあれば名前の行は出ない', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0823_ok', A1);
    expect(await putSvg(page, 'R0823_ok')).toBe(200);

    await openFolder(page);
    await expect(page.locator('#folder-panel .folder-svg-summary')).toContainText('追いついています');
    await expect(page.locator('#folder-panel .folder-svg-names')).toHaveCount(0);
  });
});
