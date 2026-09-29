const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

// BLK-reviewer-20260908-0203-wish: 保存フォルダの一覧でファイルを「実データ」「テンプレ」に
// 分類でき、テンプレの内容が変化したら赤くなること。手順 5 (前回 run との差分確認) が
// 22 枚の手動 diff ではなく、一覧を開くだけで済むことを確かめる。
// 保存フォルダはテストごとに分ける。同じフォルダを使い回すと、前のテストが残した
// 分類の宣言 (_roles.json) を次のテストが拾い、未分類のはずの図が分類済みで始まる。
let DIR = saveDirFor(__filename);

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

async function rolesOnDisk(page) {
  return page.evaluate(async (d) => {
    const r = await fetch('/autosave?dir=' + encodeURIComponent(d));
    const j = await r.json();
    return j.roles || {};
  }, DIR);
}

// 保存先の一覧は FILES の保存先の右クリック「保存先の一覧を開く」で中央の枠に開く
// (BLK-owner-20260924-0637-1。scenarios/_scenario.js の openFolder と同じ経路)。旧経路 (保存先の
// 見出しを畳んで開き直す) は FILES の節を開くだけで、一覧の枠は見えないまま待ち続けた。
// 開くたびに読み直すので、後から置いたファイルも出る。
async function openFolder(page) {
  await require('../scenarios/_scenario').openFolder(page);
  await page.waitForSelector('#folder-panel.open.is-list .folder-item');
  // 開いた直後は FILES ツリーの読み直しが続けて一覧を 1 回描き直す。その間に押した
  // 分類の印は描き直しで消えた古いボタンに当たって数に入らないことがあるので、
  // 一覧の描き直しが 400ms 止むまで待ってから押す。
  await page.evaluate(() => new Promise((resolve) => {
    const el = document.getElementById('folder-panel');
    let t = null;
    const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, 400); });
    function done() { mo.disconnect(); resolve(); }
    mo.observe(el, { childList: true });
    t = setTimeout(done, 400);
  }));
}

async function closeFolder(page) {
  await require('../scenarios/_scenario').closeFolderList(page);
}

function roleBtn(page, name) {
  return page.locator('#folder-panel button.folder-role[data-role-name="' + name + '"]');
}

const TPL = '@startuml\nparticipant Alice\nAlice -> Bob: hello\n@enduml';
const POLLUTED = '@startuml\nparticipant DMA\nDMA -> MEM: transfer\nMEM -> CPU: done\n@enduml';
const DATA = '@startuml\nparticipant CPU\nCPU -> GPIO: set\n@enduml';

test.describe('BLK-reviewer-20260908-0203-wish: 実データ / テンプレの分類とテンプレ汚染の検出', () => {
  test.beforeEach(async ({}, testInfo) => {
    DIR = './test-results/autosave/blk-reviewer-0203-file-role/e2e-blk-r0203role-' + testInfo.testId.replace(/[^a-zA-Z0-9]/g, '');
  });

  test('分類の印を押すと 未分類 → 実データ → テンプレ と変わり、保存フォルダに残る', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0203_tpl', TPL);
    await putFile(page, 'R0203_data', DATA);

    await openFolder(page);
    const tpl = roleBtn(page, 'R0203_tpl');
    await expect(tpl).toHaveAttribute('data-role', 'unset');

    await tpl.click();   // → 実データ
    await expect(roleBtn(page, 'R0203_tpl')).toHaveAttribute('data-role', 'data');
    await roleBtn(page, 'R0203_tpl').click();   // → テンプレ
    await expect(roleBtn(page, 'R0203_tpl')).toHaveAttribute('data-role', 'template');
    await expect(roleBtn(page, 'R0203_tpl')).toHaveAttribute('data-role-status', 'clean');

    // 宣言は GUI の設定ではなく保存フォルダに置かれる。
    const roles = await rolesOnDisk(page);
    expect(roles.R0203_tpl.role).toBe('template');
    expect(typeof roles.R0203_tpl.baseline).toBe('string');

    // 開き直しても残る。
    await closeFolder(page);
    await openFolder(page);
    await expect(roleBtn(page, 'R0203_tpl')).toHaveAttribute('data-role', 'template');
    await expect(roleBtn(page, 'R0203_data')).toHaveAttribute('data-role', 'unset');
  });

  test('テンプレの中身が書き換わると赤くなり、要約と名指しが出る', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0203_tpl', TPL);
    await putFile(page, 'R0203_keep', TPL);
    await putFile(page, 'R0203_data', DATA);

    await openFolder(page);
    await roleBtn(page, 'R0203_tpl').click();
    await expect(roleBtn(page, 'R0203_tpl')).toHaveAttribute('data-role', 'data');
    await roleBtn(page, 'R0203_tpl').click();          // テンプレ
    await expect(roleBtn(page, 'R0203_tpl')).toHaveAttribute('data-role', 'template');
    await roleBtn(page, 'R0203_keep').click();
    await expect(roleBtn(page, 'R0203_keep')).toHaveAttribute('data-role', 'data');
    await roleBtn(page, 'R0203_keep').click();         // テンプレ
    await expect(roleBtn(page, 'R0203_keep')).toHaveAttribute('data-role', 'template');
    await roleBtn(page, 'R0203_data').click();         // 実データ
    await expect(roleBtn(page, 'R0203_data')).toHaveAttribute('data-role', 'data');
    await expect(page.locator('#folder-role-summary')).toHaveText(/実データ 1 \/ テンプレ 2 \/ 未分類 0/);
    await expect(page.locator('#folder-role-dirty')).toHaveCount(0);

    // 別の図の内容が流れ込む (今回の事故そのもの)。
    await closeFolder(page);
    await putFile(page, 'R0203_tpl', POLLUTED);
    await openFolder(page);

    const bad = roleBtn(page, 'R0203_tpl');
    await expect(bad).toHaveAttribute('data-role-status', 'dirty');
    await expect(bad).toHaveClass(/role-dirty/);
    await expect(bad).toHaveCSS('color', 'rgb(247, 74, 74)');
    await expect(page.locator('#folder-role-dirty')).toHaveText('汚染: R0203_tpl');
    await expect(page.locator('#folder-role-summary')).toHaveText(/テンプレ 1 枚の中身が変わっています/);
    // 実データが変わっても赤くならない (区別できている)。
    await expect(roleBtn(page, 'R0203_keep')).toHaveAttribute('data-role-status', 'clean');
  });

  test('自分で直したテンプレは「今の内容で更新」で赤が消える', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0203_tpl', TPL);

    await openFolder(page);
    await roleBtn(page, 'R0203_tpl').click();
    await expect(roleBtn(page, 'R0203_tpl')).toHaveAttribute('data-role', 'data');
    await roleBtn(page, 'R0203_tpl').click();
    await expect(roleBtn(page, 'R0203_tpl')).toHaveAttribute('data-role', 'template');
    await closeFolder(page);
    await putFile(page, 'R0203_tpl', POLLUTED);
    await openFolder(page);
    await expect(roleBtn(page, 'R0203_tpl')).toHaveAttribute('data-role-status', 'dirty');

    await page.locator('button.folder-role-accept[data-role-accept="R0203_tpl"]').click();
    await expect(roleBtn(page, 'R0203_tpl')).toHaveAttribute('data-role-status', 'clean');
    await expect(page.locator('#folder-role-dirty')).toHaveCount(0);
  });

  // 図を消したら分類も消える。同じ名前で作り直した別物が、前のテンプレの baseline と
  // 比べられて「身に覚えのない汚染」として赤くなると、この印そのものが信用されなくなる。
  test('消えた図の分類は残らない', async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R0203_tpl', TPL);
    await putFile(page, 'R0203_data', DATA);
    await openFolder(page);
    await roleBtn(page, 'R0203_tpl').click();
    await expect(roleBtn(page, 'R0203_tpl')).toHaveAttribute('data-role', 'data');
    await roleBtn(page, 'R0203_tpl').click();     // テンプレ
    await expect(roleBtn(page, 'R0203_tpl')).toHaveAttribute('data-role', 'template');
    await roleBtn(page, 'R0203_data').click();    // 実データ
    await expect(roleBtn(page, 'R0203_data')).toHaveAttribute('data-role', 'data');
    expect(Object.keys(await rolesOnDisk(page)).sort().join(',')).toBe('R0203_data,R0203_tpl');
    await closeFolder(page);

    // 図を全部消す。宣言だけが保存フォルダに残ってはいけない。
    await clearDir(page);
    expect(Object.keys(await rolesOnDisk(page)).length).toBe(0);

    // 同じ名前で別の中身を作り直しても、前のテンプレ扱いを引きずらない。
    await putFile(page, 'R0203_tpl', POLLUTED);
    await openFolder(page);
    await expect(roleBtn(page, 'R0203_tpl')).toHaveAttribute('data-role', 'unset');
    await expect(roleBtn(page, 'R0203_tpl')).toHaveAttribute('data-role-status', 'none');
    await expect(page.locator('#folder-role-dirty')).toHaveCount(0);
  });
});
