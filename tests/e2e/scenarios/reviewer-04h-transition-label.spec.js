// @ts-check
// reviewer 台本 手順4.11: 状態遷移図の遷移ラベルが、対応するシーケンス図のメッセージ名と一致するか
// (粒度が揃っていても、架空の名前になっていないか)。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');

test('手順4.11 シーケンスに実在しない遷移ラベルを挙げられる', () => {
  const msgs = new Set(R.messages(R.DOCS.gpio_init_sequence));
  const labels = R.transitions(R.DOCS.gpio_state);
  const phantom = labels.filter((l) => !msgs.has(l));
  // 到達条件: Gpio_Reset はシーケンスに無い架空の名前だと言える。
  expect(labels).toContain('Gpio_Init');
  expect(phantom).toEqual(['Gpio_Reset']);
});

// BLK-reviewer-20260914-1106-wish: 上の判定は「開いている図」しか見ておらず、
// timer_state.puml の 5 遷移が driver_common_class.puml の Timer_Driver に
// 1 つも対応メソッドを持たないことは、reviewer が tools/audit.js を実行して
// JSON を読み解いて初めて分かった。📂一覧が保存フォルダの全部を束ねて突き合わせ、
// 宣言の無い名前を名指しすることを到達条件にする。
const path = require('path');
const { gotoApp, saveDirFor } = require('../helpers');

// 保存先の節は既定で開いている (design 10a)。開いていれば畳んでから開き直し、
// 一覧を今の中身で描き直す (直に押すと、開いていたときに畳んでしまう)。
async function openFolder(page) {
  // BLK-owner-20260924-0637-1: 旧 📂 一覧は保存先の右クリック「保存先の一覧を開く」で中央の枠に開く。
  await require('./_scenario').openFolder(page);
  await page.waitForSelector('#folder-panel.open');
}

const DIR = saveDirFor(__filename);

// Timer_Driver には Timer_Init しか無い (実物の driver_common_class と同じ形)。
const CLASS_DSL = '@startuml\nclass Timer_Driver {\n  + Timer_Init()\n}\n'
  + 'class Spi_Driver {\n  + Spi_Init()\n}\n@enduml';
// 接頭辞つきの遷移が 2 つ、接頭辞なしの UML イベントが 1 つ。
const STATE_DSL = '@startuml\n[*] --> Idle\nIdle --> Busy : Timer_Start\n'
  + 'Busy --> Idle : Timer_Stop\nBusy --> Idle : Tick\n@enduml';
const SEQ_DSL = '@startuml\nparticipant Spi_Driver\nparticipant Mcu\n'
  + 'Mcu -> Spi_Driver: Spi_Init()\n@enduml';

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

function putFile(page, name, dsl) {
  return page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl, dir: DIR });
}

test('手順4.11 一覧が部品ごとに 3 枚を束ね、クラスに宣言の無い遷移ラベルを名指しする', async ({ page }) => {
  test.setTimeout(120000);
  await bootWithDir(page);
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
  await putFile(page, 'R04h_class', CLASS_DSL);
  await putFile(page, 'R04h_state', STATE_DSL);
  await putFile(page, 'R04h_seq', SEQ_DSL);

  await openFolder(page);
  await page.waitForSelector('#folder-panel.open .folder-item');

  // 到達条件その1: audit.js を実行せずに、一覧の頭で件数が読める。
  await expect(page.locator('#folder-part-cross-summary'))
    .toHaveText('部品の突合: 1 部品にクラス未宣言 2 件');

  // 到達条件その2: どのクラスに何を足すのかまで名指しされる
  // (「ずれている」で止まると、結局 2 枚を開いて突き合わせ直すことになる)。
  const row = page.locator('#folder-panel .folder-part-cross-row[data-part="Timer_Driver"]');
  await expect(row.locator('.folder-part-cross-missing'))
    .toHaveText('Timer_Driver に宣言が無い: Timer_Start / Timer_Stop');
  await expect(row.locator('.folder-part-cross-missing'))
    .toHaveAttribute('title', /状態遷移図の遷移ラベル: Timer_Start, Timer_Stop/);

  // 到達条件その3: 束ねた図はその場で開ける (名前を一覧の中から目で探し直さない)。
  await expect(row.locator('.folder-part-cross-doc')).toHaveText(['R04h_class', 'R04h_state']);

  // 到達条件その4: 接頭辞を持たない UML のイベント名 (Tick) は名指ししない。
  await expect(page.locator('#folder-panel .folder-part-cross-row')).not.toContainText('Tick');

  // 到達条件その5: 同じ答えが図の行にも出る (一覧を絞って読んでいても見落とさない)。
  const state = page.locator('#folder-panel .folder-item[data-file-name="R04h_state"]');
  await expect(state.locator('.folder-part-cross')).toHaveText('クラス未宣言 2');
  await expect(state.locator('.folder-part-cross'))
    .toHaveAttribute('data-part-cross', 'Timer_Driver');
  // 宣言が揃っているシーケンス図には印を出さない (赤が常時出ていると読まれなくなる)。
  const seq = page.locator('#folder-panel .folder-item[data-file-name="R04h_seq"]');
  await expect(seq.locator('.folder-part-cross')).toHaveCount(0);

  // 到達条件その6: 束ねた行から図を開ける。
  await row.locator('.folder-part-cross-doc[data-file-name="R04h_state"]').click();
  await expect(page.locator('#editor')).toHaveValue(/Timer_Start/);
});
