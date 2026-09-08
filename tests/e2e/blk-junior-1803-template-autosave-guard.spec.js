// @ts-check
// BLK-junior-20260908-1803: 見比べのために Open で開いたテンプレ (前周の完了物) へ、
// 図名を変えるまでの間に自動保存が書き込み、plantuml-usecase.puml が編集途中の
// 内容で壊れた。テンプレ宣言のあるファイルには自動保存が書き込まないことを確かめる。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('./helpers');

let DIR = saveDirFor(__filename);

const TPL = '@startuml\nleft to right direction\nactor User\nUser --> (UC1)\n@enduml';
const DATA = '@startuml\nactor CPU\nCPU --> (Boot)\n@enduml';

async function boot(page) {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 100, restoreMode: 'auto', backend: 'file', fileDir: d }));
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

async function fileText(page, name) {
  return page.evaluate(async (a) => {
    const r = await fetch('/autosave?dir=' + encodeURIComponent(a.dir) + '&type=' + encodeURIComponent(a.name));
    if (!r.ok) return null;
    return await r.text();
  }, { name, dir: DIR });
}

async function openFolder(page) {
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open .folder-item');
}

function roleBtn(page, name) {
  return page.locator('#folder-panel button.folder-role[data-role-name="' + name + '"]');
}

async function markTemplate(page, name) {
  await roleBtn(page, name).click();   // → 実データ
  await roleBtn(page, name).click();   // → テンプレ
  await expect(roleBtn(page, name)).toHaveAttribute('data-role', 'template');
}

async function typeIntoEditor(page, text) {
  await page.locator('#editor').click();
  await page.keyboard.type(text);
  // debounce (100ms) より十分に待ち、自動保存が走る機会を与える。
  // 「開きました」の通知が消える間 (5 秒) を置いてからもう一度打ち、
  // 編集中にも止めていることが画面に出るのを見る。
  await page.waitForTimeout(1200);
  await page.keyboard.type(' ');
  await page.waitForTimeout(5200);
  await page.keyboard.type(' ');
  await page.waitForTimeout(1200);
}

test.describe('BLK-junior-20260908-1803: テンプレは自動保存で壊れない', () => {
  test.beforeEach(async ({}, testInfo) => {
    DIR = './test-results/autosave/blk-junior-1803-template-autosave-guard/e2e-'
      + testInfo.testId.replace(/[^a-zA-Z0-9]/g, '');
  });

  test('テンプレを開いて編集しても、そのファイルは書き換わらない', async ({ page }) => {
    await boot(page);
    await clearDir(page);
    await putFile(page, 'J1803_tpl', TPL);
    await openFolder(page);
    await markTemplate(page, 'J1803_tpl');

    // 見比べのために開く (図名はファイル名のまま)。
    await page.locator('#folder-panel .folder-item[data-file-name="J1803_tpl"]').click();
    await page.waitForTimeout(300);
    await typeIntoEditor(page, '\nUser --> (UC5)');

    expect(await fileText(page, 'J1803_tpl')).toBe(TPL);
    // 止めたことは画面で言う (黙って保存されていないと思わせない)。
    await expect(page.locator('#ma-toast')).toContainText('自動保存しません');
  });

  // 起票者の手順 (テンプレを開いて追記し、図名を変えて別ファイルに保存する) を
  // そのままなぞり、手数とテンプレの無事を一緒に測る。
  test('起票者の手順を通し、テンプレは無事なまま別名で保存される (クリック 10 以下 / キー入力 50 以下)', async ({ page }) => {
    await boot(page);
    await clearDir(page);
    await putFile(page, 'J1803_tpl2', TPL);

    let clicks = 0;
    let keys = 0;
    const click = async (loc) => { clicks += 1; await loc.click(); };
    const type = async (loc, text) => { keys += text.length; await loc.fill(text); };

    await click(page.locator('#btn-tab-folder'));
    await page.waitForSelector('#folder-panel.open .folder-item');
    await click(roleBtn(page, 'J1803_tpl2'));
    await click(roleBtn(page, 'J1803_tpl2'));   // テンプレ宣言
    await click(page.locator('#folder-panel .folder-item[data-file-name="J1803_tpl2"]'));
    await page.waitForTimeout(300);

    // 追記 (UC5 相当)
    await click(page.locator('#editor'));
    keys += '\nUser --> (UC5)'.length;
    await page.keyboard.type('\nUser --> (UC5)');
    await page.waitForTimeout(600);

    // 図名を変えて別ファイルにする
    await click(page.locator('#props-tab-settings'));
    await type(page.locator('#ds-docname'), 'J1803_senpai');
    await page.locator('#ds-docname').dispatchEvent('change');
    await page.waitForTimeout(900);
    // 保存ボタンは畳まれていることがあるので、押下は event で送る (人の 1 クリック分)。
    clicks += 1;
    await page.locator('#btn-save').dispatchEvent('click');
    await page.waitForTimeout(900);

    // テンプレは元のまま。新しい名前の方に追記が入る。
    expect(await fileText(page, 'J1803_tpl2')).toBe(TPL);
    expect(await fileText(page, 'J1803_senpai')).toContain('UC5');

    expect(clicks).toBeLessThanOrEqual(10);
    expect(keys).toBeLessThanOrEqual(50);
    console.log('BLK-junior-20260908-1803: クリック ' + clicks + ' / キー入力 ' + keys);
  });

  test('実データの図はこれまでどおり自動保存される', async ({ page }) => {
    await boot(page);
    await clearDir(page);
    await putFile(page, 'J1803_data', DATA);
    await openFolder(page);
    await roleBtn(page, 'J1803_data').click();   // 実データ
    await expect(roleBtn(page, 'J1803_data')).toHaveAttribute('data-role', 'data');

    await page.locator('#folder-panel .folder-item[data-file-name="J1803_data"]').click();
    await page.waitForTimeout(300);
    await page.locator('#editor').click();
    await page.keyboard.type('\nCPU --> (Run)');
    // BLK-junior-20260908-1803-wish の錠: 開いたファイルへ最初に書く前に一度だけ聞く。
    // ここは「書き換える」を選び、これまでどおり保存される道を見る。
    await page.locator('#source-lock-overwrite').click();
    await page.waitForTimeout(1500);

    const after = await fileText(page, 'J1803_data');
    expect(after).not.toBe(DATA);
    expect(after).toContain('Run');
  });
});
