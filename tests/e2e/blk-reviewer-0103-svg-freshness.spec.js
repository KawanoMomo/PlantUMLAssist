const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('./helpers');

// BLK-reviewer-20260908-0103: SVG が puml 変更後も再生成されているかを
// `ls -l` でタイムスタンプ比較して判定していた。一覧が答え、古い枚数だけを
// 1 押しで作り直せることを確かめる。
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

async function entryOf(page, name) {
  return page.evaluate(async (a) => {
    const r = await fetch('/autosave?dir=' + encodeURIComponent(a.dir));
    const j = await r.json();
    return (j.entries || []).filter((e) => e.name === a.name)[0] || null;
  }, { name, dir: DIR });
}

async function openFolder(page) {
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open .folder-item');
}

const A1 = '@startuml\nparticipant A\nA -> B: go\n@enduml';
const A2 = '@startuml\nparticipant A\nA -> B: go\nB -> C: next\n@enduml';

test.describe('BLK-reviewer-20260908-0103: SVG が puml に追いついているか', () => {
  test('一覧に SVG が古い図・無い図の印が出て、要約に枚数が出る', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0103_stale', A1);
    expect(await putSvg(page, 'R0103_stale')).toBe(200);
    // mtime は秒精度なので、puml を後から書き直して確実に新しくする。
    await page.waitForTimeout(1200);
    await putFile(page, 'R0103_stale', A2);
    await putFile(page, 'R0103_missing', A1);

    await openFolder(page);
    const stale = page.locator('#folder-panel .folder-item[data-file-name="R0103_stale"] .folder-svg-badge');
    await expect(stale).toHaveText('SVG 古');
    const missing = page.locator('#folder-panel .folder-item[data-file-name="R0103_missing"] .folder-svg-badge');
    await expect(missing).toHaveText('SVG 無');
    await expect(page.locator('#folder-panel .folder-svg-summary')).toContainText('古い 1 枚');
    await expect(page.locator('#folder-panel .folder-svg-summary')).toContainText('無い');
  });

  test('追いついている図には印が付かない', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0103_fresh', A1);
    await page.waitForTimeout(1200);
    expect(await putSvg(page, 'R0103_fresh')).toBe(200);

    await openFolder(page);
    await expect(page.locator('#folder-panel .folder-item[data-file-name="R0103_fresh"] .folder-svg-badge')).toHaveCount(0);
  });

  test('「古い SVG を作り直す」の 1 押しで、古い図の SVG が puml より新しくなる', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0103_a', A1);
    expect(await putSvg(page, 'R0103_a')).toBe(200);
    await page.waitForTimeout(1200);
    await putFile(page, 'R0103_a', A2);

    await openFolder(page);
    const btn = page.locator('#folder-panel .folder-svg-render');
    await expect(btn).toBeEnabled();
    await expect(btn).toContainText('古い SVG を作り直す');
    await btn.click();
    await expect(page.locator("#folder-panel .folder-svg-note")).toContainText("作り直しました", { timeout: 60000 });

    const e = await entryOf(page, 'R0103_a');
    expect(e.svgMtime).not.toBeNull();
    expect(Date.parse(e.svgMtime)).toBeGreaterThanOrEqual(Date.parse(e.mtime));
  });

  test('作り直しても puml 側は書き換わらない (古い判定が永久に残らない)', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0103_b', A2);
    const before = await entryOf(page, 'R0103_b');

    await openFolder(page);
    await page.locator('#folder-panel .folder-svg-render').click();
    await expect(page.locator("#folder-panel .folder-svg-note")).toContainText("作り直しました", { timeout: 60000 });

    const after = await entryOf(page, 'R0103_b');
    expect(after.mtime).toBe(before.mtime);
    expect(after.hash).toBe(before.hash);
  });

  test('作り直したあと、一覧から SVG の印が消える', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0103_c', A1);

    await openFolder(page);
    await expect(page.locator('#folder-panel .folder-item[data-file-name="R0103_c"] .folder-svg-badge')).toHaveText('SVG 無');
    await page.locator('#folder-panel .folder-svg-render').click();
    await expect(page.locator("#folder-panel .folder-svg-note")).toContainText("作り直しました", { timeout: 60000 });
    await page.waitForTimeout(500);

    await expect(page.locator('#folder-panel .folder-svg-summary').first()).toContainText('追いついています');
    await expect(page.locator('#folder-panel .folder-item[data-file-name="R0103_c"] .folder-svg-badge')).toHaveCount(0);
  });

  test('保存フォルダに無い図の SVG は書けない', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    expect(await putSvg(page, 'R0103_nothing')).toBe(404);
  });
});
