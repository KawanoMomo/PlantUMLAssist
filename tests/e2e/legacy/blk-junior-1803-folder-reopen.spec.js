// @ts-check
// BLK-junior-20260907-1803: 保存した図を「📂 一覧」から開き直して確かめる。
// 開いているタブと同じ名前だと画面が何も動かず、保存できたのか一覧が効いていないのかが
// 分からなかった。開き直しの結果を必ず言葉で返し、編集中の本文でファイルを上書きしない。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText, saveDirFor } = require('../helpers');

const DIR = saveDirFor(__filename);
const NAME = 'J1803_CanDrvInit';
const UPDATED = '@startuml\nstart\n:CAN を初期化する;\n:割り込みを許可する;\nstop\n@enduml';
const SAVED = '@startuml\nstart\n:CAN を初期化する;\nstop\n@enduml';

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

async function readFile(page, name) {
  return page.evaluate(async (a) => {
    const r = await fetch('/autosave?type=' + encodeURIComponent(a.name) + '&dir=' + encodeURIComponent(a.dir));
    if (!r.ok) return null;
    const j = await r.json();
    return j.dsl == null ? null : j.dsl;
  }, { name, dir: DIR });
}

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

// 一覧から 1 度開いて、そのタブをアクティブにしたままにする (台本の手順 9 の入口)。
async function openAsActiveTab(page, name) {
  await openFolder(page);
  await page.locator('#folder-panel .folder-item[data-file-name="' + name + '"]').click();
  await page.waitForTimeout(1200);
}

async function openFolder(page) {
  // 保存先は既定で開いている (design 10a)。開いていれば畳んでから開き直し、一覧を今の中身で描き直す。
  if (await page.locator('#folder-panel.open').count()) await page.locator('#btn-tab-folder').click();
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open .folder-item');
}

test.describe('BLK-junior-1803: 一覧から開き直して保存内容を確かめる', () => {
  test.beforeEach(async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, NAME, SAVED);
    await page.waitForTimeout(300);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
  });

  test('同じ名前のタブを開いたままでも、読み直した結果が言葉で出る', async ({ page }) => {
    await openAsActiveTab(page, NAME);
    let clicks = 0;
    await openFolder(page); clicks++;
    await page.waitForSelector('#folder-panel.open .folder-item');
    await page.locator('#folder-panel .folder-item[data-file-name="' + NAME + '"]').click(); clicks++;

    const toast = page.locator('#ma-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('読み直しました');
    await expect(toast).toContainText('保存されている内容と同じです');
    expect(clicks).toBeLessThanOrEqual(10);
  });

  test('フォルダ側が変わっていれば、開き直しで本文が差し替わる', async ({ page }) => {
    await openAsActiveTab(page, NAME);
    // 別の場所から同じファイルが書き換わった状態にする (保存し直し / 他のタブ)。
    await putFile(page, NAME, UPDATED);
    await page.waitForTimeout(300);

    await openFolder(page);
    await page.locator('#folder-panel .folder-item[data-file-name="' + NAME + '"]').click();
    await page.waitForTimeout(1200);

    expect(await getEditorText(page)).toBe(UPDATED);
    await expect(page.locator('#ma-toast')).toContainText('差し替えました');
  });

  test('差し替える前の本文は「元に戻す」で戻せる', async ({ page }) => {
    await openAsActiveTab(page, NAME);
    await putFile(page, NAME, UPDATED);
    await page.waitForTimeout(300);

    await openFolder(page);
    await page.locator('#folder-panel .folder-item[data-file-name="' + NAME + '"]').click();
    await page.waitForTimeout(1200);
    await page.locator('#ma-toast button').click();
    await page.waitForTimeout(800);

    expect(await getEditorText(page)).toBe(SAVED);
  });

  test('フォルダから消えた図を押しても、開いた気にさせない', async ({ page }) => {
    await openAsActiveTab(page, NAME);
    await openFolder(page);
    await clearDir(page);
    await page.locator('#folder-panel .folder-item[data-file-name="' + NAME + '"]').click();
    await page.waitForTimeout(1200);

    await expect(page.locator('#ma-toast')).toContainText('読めませんでした');
  });
});
