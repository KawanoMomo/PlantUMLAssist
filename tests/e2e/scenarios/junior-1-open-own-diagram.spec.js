const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

// junior 台本 手順 1「persona-data\junior の自分の図（前周までの最新版）を開く」。
//
// BLK-junior-20260908-2003: 保存は「図の名前 = ファイル名」なので、名前を既定の
// diagram1 のままにして図種だけ変えながら周を重ねると、前の周に完走した図が
// 次の周の保存で黙って消える。junior の保存フォルダには 6 図種を完走したはずの
// 周のあとも 3 枚しか残っておらず、GPIO 状態遷移図の実体が無かったため、
// 手順 1 を始められなかった。
//
// 上書きの直前に前の中身を控え、📂 一覧から「その版」を開けることを確かめる。
const DIR = saveDirFor(__filename);

const SEQ = ['@startuml', 'participant Driver', 'Driver -> HW: Gpio_Init()', '@enduml'].join('\n');
const STATE = ['@startuml', 'state IDLE', 'IDLE --> RUNNING : start', '@enduml'].join('\n');
const CLS = ['@startuml', 'class GpioDriver', '@enduml'].join('\n');

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

async function putFile(page, name, text) {
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl: text, dir: DIR });
}

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

async function openFolder(page) {
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open');
}

// 同じ名前へ 3 周ぶんを順に保存する。server の刻印は秒なので、
// 版が同じ秒に潰れないよう間を空ける (実運用では周が 1 時間空く)。
async function saveThreeRounds(page) {
  await putFile(page, 'diagram1', SEQ);
  await page.waitForTimeout(1100);
  await putFile(page, 'diagram1', STATE);
  await page.waitForTimeout(1100);
  await putFile(page, 'diagram1', CLS);
}

test.beforeEach(async ({ page }) => {
  await bootWithDir(page);
  await clearDir(page);
});

test.afterEach(async ({ page }) => {
  await clearDir(page);
});

test('上書きで消えた前の周の図が 📂 一覧の「履歴」に残る', async ({ page }) => {
  await saveThreeRounds(page);
  await openFolder(page);

  const btn = page.locator('#folder-panel [data-versions-name="diagram1"]');
  await expect(btn).toHaveText('履歴 2');
});

test('履歴を開くと、消えた版が図種つきで並ぶ', async ({ page }) => {
  await saveThreeRounds(page);
  await openFolder(page);
  await page.locator('#folder-panel [data-versions-name="diagram1"]').click();

  const list = page.locator('#folder-panel [data-version-list="diagram1"] .folder-version');
  await expect(list).toHaveCount(2);
  // 新しい順。1 つ前が状態遷移図、その前がシーケンス図。
  await expect(list.nth(0)).toContainText('状態遷移');
  await expect(list.nth(1)).toContainText('シーケンス');
});

// 開く先は既定のタブ名 (diagram1) を避ける。既定のタブは開いた時点から
// 自動保存が走るので、diagram1.puml が今の図かどうかは版の話とは別に動く。
test('状態遷移図の版を開くと、今の図を上書きせずに別タブで開く', async ({ page }) => {
  await putFile(page, 'gpio_state', SEQ);
  await page.waitForTimeout(1100);
  await putFile(page, 'gpio_state', STATE);
  await page.waitForTimeout(1100);
  await putFile(page, 'gpio_state', CLS);
  await openFolder(page);
  await page.locator('#folder-panel [data-versions-name="gpio_state"]').click();
  await page.locator('#folder-panel [data-version-list="gpio_state"] .folder-version').nth(0).click();

  // 開いた本文は消えたはずの状態遷移図。
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const d = window.MA.workspace.getActive();
      return d ? d.dsl : '';
    });
  }).toContain('IDLE --> RUNNING');

  // 今の gpio_state.puml は最後に保存したクラス図のまま (版を開いても塗り潰さない)。
  const now = await page.evaluate(async (d) => {
    const r = await fetch('/autosave?dir=' + encodeURIComponent(d) + '&type=gpio_state');
    return r.ok ? await r.text() : '';
  }, DIR);
  expect(now).toContain('class GpioDriver');
});

test('名前を付けた図でも同じ名前への上書きは控えられる', async ({ page }) => {
  await putFile(page, 'gpio_state', STATE);
  await page.waitForTimeout(1100);
  await putFile(page, 'gpio_state', CLS);

  await openFolder(page);
  // 本体が残っている間は「今は無い図」の欄は出ない。
  await expect(page.locator('#folder-gone-versions')).toHaveCount(0);
  await expect(page.locator('#folder-panel [data-versions-name="gpio_state"]')).toHaveText('履歴 1');
});

test('中身が変わらない保存では版を増やさない', async ({ page }) => {
  await putFile(page, 'diagram1', STATE);
  await page.waitForTimeout(1100);
  await putFile(page, 'diagram1', STATE);
  await page.waitForTimeout(1100);
  await putFile(page, 'diagram1', STATE);

  const n = await page.evaluate(async (d) => {
    const r = await fetch('/autosave-versions?dir=' + encodeURIComponent(d) + '&type=diagram1');
    const j = await r.json();
    return j.versions.length;
  }, DIR);
  expect(n).toBe(0);
});
