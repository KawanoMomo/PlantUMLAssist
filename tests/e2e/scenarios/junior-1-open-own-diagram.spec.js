const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

// junior 台本 手順 1「persona-data\junior の自分の図（前周までの最新版）を開く」。
//
// BLK-junior-20260908-2003: 保存は「図の名前 = ファイル名」なので、名前を既定の
// diagram1 のままにして図種だけ変えながら周を重ねると、前の周に完走した図が
// 次の周の保存で黙って消える。junior の保存フォルダには 6 図種を完走したはずの
// 周のあとも 3 枚しか残っておらず、GPIO 状態遷移図の実体が無かった。
//
// 差し戻し1回目: 消えた中身を `_versions` に控えるだけでは、手順 1 が
// 「消えた図を版から掘り出す」に変わるだけで、図そのものは残らない。
// 図種の変わる保存は上書きではなく `{名前}_{図種}` へ回し、図種ごとに 1 枚ずつ
// 残す。一覧はどの図種が何枚あるか（0 枚も）を言う。
const DIR = saveDirFor(__filename);

const SEQ = ['@startuml', 'participant Driver', 'Driver -> HW: Gpio_Init()', '@enduml'].join('\n');
const STATE = ['@startuml', 'state IDLE', 'IDLE --> RUNNING : start', '@enduml'].join('\n');
const STATE2 = ['@startuml', 'state IDLE', 'IDLE --> ERROR : fail', '@enduml'].join('\n');
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
  return await page.evaluate(async (a) => {
    const r = await fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
    return r.ok ? await r.json() : null;
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

// 同じ名前のまま図種だけ変えて 3 周ぶん保存する（junior の実際のやり方）。
async function saveThreeRounds(page) {
  await putFile(page, 'diagram1', SEQ);
  await putFile(page, 'diagram1', STATE);
  await putFile(page, 'diagram1', CLS);
}

test.beforeEach(async ({ page }) => {
  await bootWithDir(page);
  await clearDir(page);
});

test.afterEach(async ({ page }) => {
  await clearDir(page);
});

test('図種を変えて保存し続けても、前の周の図が消えない', async ({ page }) => {
  await saveThreeRounds(page);

  const files = await page.evaluate(async (d) => {
    const r = await fetch('/autosave?dir=' + encodeURIComponent(d));
    return (await r.json()).files;
  }, DIR);
  expect(files.slice().sort()).toEqual(['diagram1', 'diagram1_class', 'diagram1_state']);

  // 状態遷移図の中身は 2 周目のまま残っている（手順 1 の対象がある）。
  const state = await page.evaluate(async (d) => {
    const r = await fetch('/autosave?dir=' + encodeURIComponent(d) + '&type=diagram1_state');
    return r.ok ? await r.text() : '';
  }, DIR);
  expect(state).toContain('IDLE --> RUNNING');
});

test('📂 一覧が図種を言う。行のバッジと「状態遷移 1」の要約', async ({ page }) => {
  await saveThreeRounds(page);
  await openFolder(page);

  await expect(page.locator('#folder-kinds')).toContainText('状態遷移 1');
  await expect(page.locator('#folder-kinds')).toContainText('シーケンス 1');
  await expect(page.locator('#folder-panel [data-kind-of="diagram1_state"]')).toHaveText('状態遷移');
  await expect(page.locator('#folder-panel [data-kind-of="diagram1"]')).toHaveText('シーケンス');
});

test('状態遷移図が 1 枚も無い保存先では、要約が 0 と言う', async ({ page }) => {
  await putFile(page, 'diagram1', SEQ);
  await openFolder(page);

  await expect(page.locator('#folder-kinds')).toContainText('状態遷移 0');
});

test('図種が変わると図名も回された先に合わせ、どこへ保存したかを言う', async ({ page }) => {
  await putFile(page, 'diagram1', SEQ);
  // 画面の図名は diagram1 のまま、中身だけ状態遷移図にして保存する。
  await page.evaluate(async (a) => {
    window.MA.workspace.open({ name: 'diagram1', dsl: a.seq, diagramType: 'sequence' });
    await window.MA.workspace.saveToFile({ name: 'diagram1', dsl: a.state }, a.dir);
  }, { dir: DIR, seq: SEQ, state: STATE });

  await expect(page.locator('#ma-toast')).toContainText('diagram1_state');
  await expect(page.locator('#tab-bar .tab-label, #doc-tabs .tab-label')
    .filter({ hasText: 'diagram1_state' })).toHaveCount(1);
});

test('同じ図種の上書きは今までどおり。前の中身は「履歴」に残る', async ({ page }) => {
  await putFile(page, 'gpio_state', STATE);
  await page.waitForTimeout(1100);   // server の刻印は秒。版が同じ秒に潰れないように
  await putFile(page, 'gpio_state', STATE2);

  const files = await page.evaluate(async (d) => {
    const r = await fetch('/autosave?dir=' + encodeURIComponent(d));
    return (await r.json()).files;
  }, DIR);
  expect(files).toEqual(['gpio_state']);

  await openFolder(page);
  await expect(page.locator('#folder-panel [data-versions-name="gpio_state"]')).toHaveText('履歴 1');
  await page.locator('#folder-panel [data-versions-name="gpio_state"]').click();
  const list = page.locator('#folder-panel [data-version-list="gpio_state"] .folder-version');
  await expect(list).toHaveCount(1);
  await expect(list.nth(0)).toContainText('状態遷移');
});

test('版を開くと、今の図を上書きせずに別タブで開く', async ({ page }) => {
  await putFile(page, 'gpio_state', STATE);
  await page.waitForTimeout(1100);
  await putFile(page, 'gpio_state', STATE2);
  await openFolder(page);
  await page.locator('#folder-panel [data-versions-name="gpio_state"]').click();
  await page.locator('#folder-panel [data-version-list="gpio_state"] .folder-version').nth(0).click();

  await expect.poll(async () => {
    return await page.evaluate(() => {
      const d = window.MA.workspace.getActive();
      return d ? d.dsl : '';
    });
  }).toContain('IDLE --> RUNNING');

  const now = await page.evaluate(async (d) => {
    const r = await fetch('/autosave?dir=' + encodeURIComponent(d) + '&type=gpio_state');
    return r.ok ? await r.text() : '';
  }, DIR);
  expect(now).toContain('IDLE --> ERROR');
});

// BLK-junior-20260909-0403: ユースケース図は自分にも先輩にも手本が 1 枚も無く、
// 新規タブのサンプルから 15 行を打ち直していた (実測 280 打鍵)。題材名 1 語で
// ドライバのひな形を作れるようにする。
test('手本が無いユースケース図を、題材名 1 語のひな形から始められる', async ({ page }) => {
  // 新規タブをユースケース図にする (手順 1 の「新しい図を作る」入口)
  await page.selectOption('#diagram-type', 'plantuml-usecase');
  await page.waitForTimeout(600);

  await page.fill('#uc-starter-subject', 'GPIO');
  await expect(page.locator('#uc-starter-hint'))
    .toHaveText('アクター 2 / ユースケース 6 / 関連 7 本の下書きを作ります');
  await page.locator('#uc-starter-add').click();
  await page.waitForTimeout(800);

  const dsl = await page.evaluate(() => document.getElementById('editor').value);
  expect(dsl).toContain('actor Developer as "開発者"');
  expect(dsl).toContain('usecase GPIO_Init as "GPIO を初期化する"');
  expect(dsl).toContain('GPIO_IrqNotify ..> GPIO_IrqSetup : <<extend>>');
  expect((dsl.match(/^Developer --> /gm) || []).length).toBe(5);

  // 図として描けている (パースが通り、要素が出そろっている)
  await expect(page.locator('#status-parse')).toContainText('パース OK');
});
