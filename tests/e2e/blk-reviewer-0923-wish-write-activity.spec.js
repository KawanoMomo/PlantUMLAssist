const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('./helpers');

// BLK-reviewer-20260908-0923-wish: run の途中で primary が persona-data\primary\ に
// 書き込み続けているのに、reviewer は tick 開始時点の状態を読んでいるつもりでいる。
// 「今読んでいる内容が読み始めた瞬間のものか」を見分ける印が 📂一覧に無かった。
// 直近 N 分以内に更新された図に印が付き、後回しにしたまま残りを読めることを見る。
const DIR = saveDirFor(__filename);

const A1 = '@startuml\nparticipant A\nA -> B: go\n@enduml';

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

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

// 一覧の GET だけを書き換える。「5 分前に保存された図」を実時間で待って作ると
// 1 本の spec に 5 分かかるので、server の答えの時刻だけを差し替えて判定を見る。
// 判定の材料 (entries の mtime と now) は server の答えそのままの形で渡る。
async function patchListing(page, fn) {
  await page.route('**/autosave?*', async (route, request) => {
    if (request.method() !== 'GET') return route.continue();
    const resp = await route.fetch();
    const body = await resp.json();
    route.fulfill({ status: 200, contentType: 'application/json',
                    body: JSON.stringify(fn(body)) });
  });
}

async function openFolder(page) {
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open .folder-item');
}

test.describe('BLK-reviewer-0923-wish: 書き込み中かもしれない図に印を付ける', () => {
  test('今しがた保存された図に「書込中?」が付き、名前と経過時間がその場に出る', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0923_live', A1);

    await openFolder(page);
    await expect(page.locator('#folder-write-summary')).toContainText('更新中の可能性 1 枚');
    const badge = page.locator('#folder-panel .folder-write-badge[data-write-status="active"]');
    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveText('書込中?');
    const name = page.locator('#folder-panel button[data-write-name="R0923_live"]');
    await expect(name).toContainText('R0923_live');
    await expect(name).toContainText('秒前');
  });

  test('窓より前の更新なら印は出ず、読み始めた版のまま読めると言う', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0923_settled', A1);
    // server の「今」を 1 時間先にする = どの図も 1 時間前が最後の更新。
    await patchListing(page, (body) => {
      body.now = new Date(Date.parse(body.now) + 3600 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
      return body;
    });

    await openFolder(page);
    await expect(page.locator('#folder-write-summary')).toContainText('更新された図はありません');
    await expect(page.locator('#folder-panel .folder-write-badge')).toHaveCount(0);
    await expect(page.locator('#folder-panel .folder-write-names')).toHaveCount(0);
  });

  test('「更新中を除いて選ぶ」で落ち着いている図だけに印が付く（後回しにできる）', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0923_old', A1);
    await putFile(page, 'R0923_new', A1);
    // R0923_old だけ、最後の更新をずっと前にする。
    await patchListing(page, (body) => {
      (body.entries || []).forEach((e) => {
        if (e.name === 'R0923_old') { e.mtime = '2026-01-01T00:00:00Z'; e.svgMtime = null; }
      });
      return body;
    });

    await openFolder(page);
    const skip = page.locator('#folder-panel button.folder-write-skip');
    await expect(skip).toContainText('1 枚');
    await skip.click();
    await expect(page.locator('#folder-panel .folder-pick[data-pick-name="R0923_old"]')).toBeChecked();
    await expect(page.locator('#folder-panel .folder-pick[data-pick-name="R0923_new"]')).not.toBeChecked();
  });

  test('時刻が取れない図は「読んでよい」側に入れない', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0923_notime', A1);
    await patchListing(page, (body) => {
      (body.entries || []).forEach((e) => { e.mtime = null; e.svgMtime = null; });
      return body;
    });

    await openFolder(page);
    await expect(page.locator('#folder-write-summary')).toContainText('時刻不明 1 枚');
    await expect(page.locator('#folder-panel .folder-write-badge[data-write-status="unknown"]')).toHaveCount(1);
    await expect(page.locator('#folder-panel button.folder-write-skip')).toBeDisabled();
  });

  test('「一覧を取り直す」で、その時点の更新時刻で付け直す', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0923_again', A1);

    await openFolder(page);
    await expect(page.locator('#folder-write-summary')).toContainText('更新中の可能性 1 枚');
    // 取り直した先では窓の外にする。押した結果が画面に出ることを見る。
    await patchListing(page, (body) => {
      body.now = new Date(Date.parse(body.now) + 3600 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
      return body;
    });
    await page.locator('#folder-panel button.folder-write-refresh').click();
    await expect(page.locator('#folder-write-summary')).toContainText('更新された図はありません');
  });
});
