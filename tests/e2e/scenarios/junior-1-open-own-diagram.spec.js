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
  // 保存先は既定で開いている (design 10a)。開いていれば畳んでから開き直し、一覧を今の中身で描き直す。
  // BLK-owner-20260924-0637-1: 旧 📂 一覧は保存先の右クリック「保存先の一覧を開く」で中央の枠に開く。
  await require('./_scenario').openFolder(page);
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

test('一覧が図種を言う。行のバッジと「状態遷移 1」の要約', async ({ page }) => {
  await saveThreeRounds(page);
  await openFolder(page);

  await expect(page.locator('#folder-kinds')).toContainText('状態遷移 1');
  await expect(page.locator('#folder-kinds')).toContainText('シーケンス 1');
  // BLK-junior-20260912-2103-wish: 控え (保存したときの図種) のある行は、図種名の
  // 左に印が付く (「この図種のまま開く」ことを行の上で言うため)。図種名そのものは変わらない。
  await expect(page.locator('#folder-panel [data-kind-of="diagram1_state"]')).toContainText('状態遷移');
  await expect(page.locator('#folder-panel [data-kind-of="diagram1"]')).toContainText('シーケンス');
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

// BLK-owner-20260923-2312-prune: 過去の版を見る画面は「この図の履歴」1 つ。保存先一覧の
// [履歴 N] は一覧の中に版を広げず、同じ「この図の履歴」を開く (右クリック・⟲ 変遷と同じ画面)。
async function openHistoryOf(page, name) {
  await openFolder(page);
  await expect(page.locator('#folder-panel [data-versions-name="' + name + '"]')).toHaveText(/履歴 \d/);
  await page.locator('#folder-panel [data-versions-name="' + name + '"]').click();
  await expect(page.locator('#vt-modal')).toBeVisible();
  await expect(page.locator('#vt-modal-content strong')).toHaveText('この図の履歴');
  return page.locator('#vt-body [data-version-list="' + name + '"] .folder-version');
}

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
  const list = await openHistoryOf(page, 'gpio_state');
  await expect(list).toHaveCount(1);
  await expect(list.nth(0)).toContainText('状態遷移');
  await expect(page.locator('#vt-summary')).toContainText('保存した版 1');
  // 保存先一覧の中には版を広げない (過去の版を見る画面は 1 つ)。
  await expect(page.locator('#folder-panel .folder-version')).toHaveCount(0);
});

test('版を開くと、今の図を上書きせずに別タブで開く', async ({ page }) => {
  await putFile(page, 'gpio_state', STATE);
  await page.waitForTimeout(1100);
  await putFile(page, 'gpio_state', STATE2);
  const list = await openHistoryOf(page, 'gpio_state');
  await list.nth(0).click();
  await expect(page.locator('#vt-modal')).toBeHidden();

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

// BLK-owner-20260924-1212-prune: Ctrl+K でこの図の履歴を開く行は「この図の履歴を見る」1 行。
// 旧名 (変遷) で打っても同じ 1 行が出て、旧名は行の文字に並ばない。
test('Ctrl+K で「変遷」「履歴」と打っても、この図の履歴を開く行は 1 行', async ({ page }) => {
  await putFile(page, 'gpio_state', STATE);
  await page.waitForTimeout(1100);
  await putFile(page, 'gpio_state', STATE2);
  await openHistoryOf(page, 'gpio_state');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { document.getElementById('vt-modal').style.display = 'none'; });
  for (const q of ['変遷', '履歴']) {
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#cp-modal.open');
    await page.locator('#cp-input').fill(q);
    await page.waitForTimeout(150);
    const rows = page.locator('.cp-item[data-cp-id$=":tab-versions"]');
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator('.cp-title')).toHaveText('この図の履歴を見る');
    await expect(page.locator('.cp-item').filter({ hasText: '変遷' })).toHaveCount(0);
    if (q === '履歴') {
      await rows.first().click();
      await expect(page.locator('#vt-modal')).toBeVisible();
      await expect(page.locator('#vt-modal-content strong')).toHaveText('この図の履歴');
    } else {
      await page.keyboard.press('Escape');
    }
  }
});

test('この図の履歴の「比較」で、版を今の図の右に並べる (今の図はそのまま)', async ({ page }) => {
  await putFile(page, 'gpio_state', STATE);
  await page.waitForTimeout(1100);
  await putFile(page, 'gpio_state', STATE2);
  await openHistoryOf(page, 'gpio_state');
  await page.locator('#vt-body [data-version-compare][data-version-of="gpio_state"]').first().click();
  await expect(page.locator('#vt-modal')).toBeHidden();

  // 編集しているのは今の図 (上書きされていない)。右には版が並ぶ。
  await expect.poll(async () => page.evaluate(() => {
    const d = window.MA.workspace.getActive();
    return d ? d.name + '|' + d.dsl : '';
  })).toContain('gpio_state|');
  expect(await page.evaluate(() => window.MA.workspace.getActive().dsl)).toContain('IDLE --> ERROR');
  await expect(page.locator('#compare-pane')).toBeVisible();
  await expect(page.locator('#compare-select option:checked')).toContainText('gpio_state@');
});

test('前の版と同じ中身に戻った版には、この図の履歴で「往復」の印が付く', async ({ page }) => {
  await putFile(page, 'gpio_state', STATE);
  await page.waitForTimeout(1100);
  await putFile(page, 'gpio_state', STATE2);
  await page.waitForTimeout(1100);
  await putFile(page, 'gpio_state', STATE);
  await page.waitForTimeout(1100);
  await putFile(page, 'gpio_state', STATE2);
  // 控え (新しい順): STATE ← STATE2 ← STATE。いちばん新しい控えが往復。
  const list = await openHistoryOf(page, 'gpio_state');
  await expect(list).toHaveCount(3);
  const rows = page.locator('#vt-body .vt-row');
  await expect(rows.nth(0)).toHaveAttribute('data-vt-revisit', '1');
  await expect(rows.nth(0).locator('.vt-badge')).toHaveText('往復');
  await expect(page.locator('#vt-summary')).toContainText('往復 1');
  await page.locator('#vt-only-revisit').check();
  await expect(page.locator('#vt-body .vt-row')).toHaveCount(1);
  await page.locator('#vt-only-revisit').uncheck();
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
  // design 9c (BLK-builder-20260924-1759-1): 通ったことは点の色 (緑) で言い、文字は隣の件数と同じ色。
  await expect(page.locator('#status-parse')).toHaveAttribute('data-dot', 'ok');
  const look = await page.evaluate(() => {
    const p = document.getElementById('status-parse');
    const before = getComputedStyle(p, '::before');
    return {
      text: getComputedStyle(p).color,
      info: getComputedStyle(document.getElementById('status-info')).color,
      dot: before.color,
      content: before.content,
    };
  });
  expect(look.text).toBe(look.info);
  expect(look.content).toBe('"●"');
  expect(look.dot).not.toBe(look.text);
});

// BLK-junior-20260916-0546-wish: 手順 1 で先輩 (primary) の図を見るには、📂 一覧が
// 「今の保存先の中身」しか出せないので保存先そのものを切り替えるしかなく、切り替えた
// まま保存すれば自分の図が他人のフォルダに紛れ込む。junior は毎回「戻し忘れていないか」
// を確かめていた。
// BLK-owner-20260925-0416-prune: 保存先の一覧の頭にあった参照タブ列 (「(保存先)」タブ・「＋参照」) は
// FILES「読むだけ」節と同じことを別の登録簿でしていたので外した。到達条件 (保存先が動かない・先輩の図が
// 右の枠に並ぶ・まだ無い図種が開く前に分かる) は「読むだけ」節と 🧩 部品ビューで確かめる。
const SENIOR_DIR = './test-results/autosave/junior-1-senior-ref';
const SENIOR_CLASS = ['@startuml', 'class Timer_Driver {', '  +Init()', '  +DeInit()',
  '  +Start()', '  +Stop()', '  +GetTick()', '  +SetPeriod()', '}', '@enduml'].join('\n');
const S = require('./_scenario');

async function putIn(page, dir, name, text) {
  return await page.evaluate(async (a) => {
    const r = await fetch('/autosave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
    return r.ok ? await r.json() : null;
  }, { name, dsl: text, dir });
}

async function saveDirNow(page) {
  return await page.evaluate(() => {
    try { return JSON.parse(window.localStorage.getItem('plantuml-autosave-config') || '{}').fileDir; }
    catch (e) { return null; }
  });
}

test('手順1 先輩の図を、保存先を動かさず「読むだけ」から右の枠に並べて読める', async ({ page }) => {
  // 自分の図と、先輩のフォルダ (隣のフォルダ) を用意する。
  await putFile(page, 'diagram1', CLS);
  await putIn(page, SENIOR_DIR, 'driver_common_class', SENIOR_CLASS);
  await openFolder(page);

  // 到達条件その1: 保存先の一覧に参照タブ列は無く、隣のフォルダの行き先を 1 行で案内する。
  await expect(page.locator('#folder-tabbar')).toHaveCount(0);
  await expect(page.locator('#folder-tab-add')).toHaveCount(0);
  const hint = page.locator('#folder-ro-hint');
  await expect(hint).toHaveText('隣のフォルダは FILES の『読むだけ』で開けます');
  await expect(page.locator('#folder-panel .folder-item[data-file-name="diagram1"]')).toBeVisible();

  // 到達条件その2: 案内を押すと一覧が閉じ、FILES の「読むだけ」節が開いて見出しに移る。
  await hint.click();
  await expect(page.locator('#folder-panel.is-list')).toHaveCount(0);
  await expect(page.locator('#files-sec-readonly')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#files-sec-readonly')).toBeFocused();
  const folder = page.locator('#files-ro-list .files-ro-folder[data-ro-name="junior-1-senior-ref"]');
  await expect(folder).toBeVisible();

  // 到達条件その3: フォルダの行 → 図の行を押すと、先輩の図が読むだけで右の枠に並ぶ。
  await folder.click();
  const roFile = page.locator('#files-ro-list .files-ro-file[data-ro-dir$="junior-1-senior-ref"][data-file-name="driver_common_class"]');
  await expect(roFile).toBeVisible();
  await roFile.click();
  await expect(page.locator('#senior-pane')).toBeVisible();
  // 到達条件その4: 粒度差 (先輩は Timer_Driver にメソッド 6 つ) を並べたまま読める。
  await expect(page.locator('#senior-dsl')).toContainText('+GetTick()');
  await expect(folder).toContainText('比較中');

  // 到達条件その5: ここまでで保存先は 1 度も動いていない。
  expect(await saveDirNow(page)).toBe(DIR);
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, SENIOR_DIR);
});

// 以前「＋参照」で足したフォルダ (localStorage の控え) は、隣のフォルダでなくても「読むだけ」節に残る。
const KEPT_DIR = './test-results/kept-ref/junior-1-kept-ref';

test('手順1 以前「＋参照」で足したフォルダは、隣でなくても「読むだけ」節に並ぶ', async ({ page }) => {
  await putIn(page, KEPT_DIR, 'kept_class', SENIOR_CLASS);
  await page.addInitScript((d) => {
    try { window.localStorage.setItem('pua.ref.folders', JSON.stringify([d])); } catch (e) {}
  }, KEPT_DIR);
  await S.reopenApp(page);
  const head = page.locator('#files-sec-readonly');
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  const kept = page.locator('#files-ro-list .files-ro-folder[data-ro-name="junior-1-kept-ref"]');
  await expect(kept).toBeVisible();
  await kept.click();
  await expect(page.locator('#files-ro-list .files-ro-file[data-file-name="kept_class"]')).toBeVisible();
  expect(await saveDirNow(page)).toBe(DIR);
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, KEPT_DIR);
});

// BLK-junior-20260917-0423-wish: 取り込む場面の手順 1 は「先輩の該当図を開く」から
// 始まるが、先輩がその部品のその図種をまだ作っていないことがある。TIMER のクラス図で
// 実際に空振りし、一覧のファイル名を目で読み比べて初めて「まだ無い」と分かった。
// BLK-owner-20260925-0416-prune: 参照タブの部品 × 図種の表は外し、同じ問いに 🧩 部品ビューで答える
// (読むだけのフォルダの右クリック「このフォルダの図を調べる…」→「部品ビュー」)。
const PROG_DIR = './test-results/autosave/junior-1-senior-progress';
const P_SEQ = ['@startuml', 'participant Timer', 'Timer -> HW: Timer_Init()', '@enduml'].join('\n');
const P_STATE = ['@startuml', 'state IDLE', 'IDLE --> RUNNING : start', '@enduml'].join('\n');

test('手順1 部品ビューで、先輩がまだ作っていない図種が開く前に分かる', async ({ page }) => {
  // 自分は TIMER のクラス図を持っている。先輩はシーケンスと状態遷移までで、クラス図は無い。
  await putFile(page, 'timer_class', CLS);
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, PROG_DIR);
  await putIn(page, PROG_DIR, 'timer_init_sequence', P_SEQ);
  await putIn(page, PROG_DIR, 'timer_state', P_STATE);

  // 読むだけのフォルダの右クリック「このフォルダの図を調べる…」→「部品ビュー」。
  await S.peekFolder(page, 'junior-1-senior-progress');
  await page.locator('#peek-board-toggle').click();
  await page.waitForSelector('#peek-board .pb-row');

  // 到達条件その1: 部品 TIMER の 6 図種が並ぶ (ファイル名の並びを読み比べない)。
  await expect(page.locator('#peek-board-part')).toHaveValue('timer');
  const row = (k) => page.locator('#peek-board .pb-row[data-board-kind="' + k + '"]');
  await expect(page.locator('#peek-board .pb-row')).toHaveCount(6);

  // 到達条件その2: 先輩にある図種は本文が並び、まだ無い図種は「手本なし」と開く前に分かる。
  await expect(row('sequence').locator('[data-board-ref="sequence"]')).toContainText('Timer_Init()');
  await expect(row('state').locator('[data-board-ref="state"]')).toContainText('IDLE --> RUNNING');
  await expect(row('class').locator('.pb-col-head').first()).toContainText('手本なし');
  await expect(row('class').locator('[data-board-ref="class"]')).toHaveText('');

  // 到達条件その3: ここまでで保存先は 1 度も動いていない。
  expect(await saveDirNow(page)).toBe(DIR);
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, PROG_DIR);
});
