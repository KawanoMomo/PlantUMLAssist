// @ts-check
// BLK-junior-20260908-1803-wish: 見比べのために開いたファイル(先輩版・テンプレート)が、
// 図名欄で名前を変え終える前の自動保存で書き換えられてしまう。開いた瞬間に錠をかけ、
// 最初に書き戻す直前で一度だけ「元ファイルは変更前のまま保つか」を聞く。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

// 保存先の節は既定で開いている (design 10a)。開いていれば畳んでから開き直し、
// 一覧を今の中身で描き直す (直に押すと、開いていたときに畳んでしまう)。
async function openFolder(page) {
  if (await page.locator('#folder-panel.open').count()) await page.locator('#btn-tab-folder').click();
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open');
}

const DIR = saveDirFor(__filename);
const TEMPLATE = 'plantuml-usecase-template';
const TEMPLATE2 = 'plantuml-usecase-template-2';
const ORIGINAL = '@startuml\nleft to right direction\nactor 運転者\n(エンジンを始動する)\n運転者 --> (エンジンを始動する)\n@enduml';

async function boot(page) {
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
    return await r.text();
  }, { name, dir: DIR });
}

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

async function openFromFolder(page, name) {
  await openFolder(page);
  await page.waitForSelector('#folder-panel.open .folder-item');
  await page.locator('#folder-panel .folder-item[data-file-name="' + name + '"]').click();
  await page.waitForTimeout(1000);
}

async function editEditor(page, text) {
  await page.locator('#editor').fill(text);
  await page.waitForTimeout(900);
}

test.describe('BLK-junior-20260908-1803-wish: 開いた元ファイルを自動保存から守る', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page);
    await clearDir(page);
    await putFile(page, TEMPLATE, ORIGINAL);
    await putFile(page, TEMPLATE2, ORIGINAL);
    await page.waitForTimeout(300);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
  });

  test('開いた直後に編集すると、書き込む前に一度だけ確認が出る', async ({ page }) => {
    await openFromFolder(page, TEMPLATE);
    await expect(page.locator('#top-source-lock')).toHaveText('🔒 ' + TEMPLATE);
    await editEditor(page, ORIGINAL + '\n\' 自分のメモ MARKER_A');
    await expect(page.locator('#source-lock-modal')).toBeVisible();
    await expect(page.locator('#source-lock-body')).toContainText(TEMPLATE + '.puml');
    // 答えるまでは元ファイルに手を付けない
    expect(await readFile(page, TEMPLATE)).toBe(ORIGINAL);
  });

  test('「元のまま保つ」を選べば、元ファイルは変更前のまま残り、控えに書かれる', async ({ page }) => {
    await openFromFolder(page, TEMPLATE);
    await editEditor(page, ORIGINAL + '\n\' 自分のメモ MARKER_A');
    await page.locator('#source-lock-keep').click();
    await page.waitForTimeout(1200);
    expect(await readFile(page, TEMPLATE)).toBe(ORIGINAL);
    const copy = await readFile(page, TEMPLATE + '-編集中');
    expect(copy).toContain('MARKER_A');
    await expect(page.locator('#top-source-lock')).toHaveText('🔒 元ファイル保護');

    // 打ち続けても確認は二度と出ず、元ファイルは無傷のまま
    await editEditor(page, ORIGINAL + '\n\' 自分のメモ MARKER_B');
    await expect(page.locator('#source-lock-modal')).toHaveCount(0);
    await page.waitForTimeout(800);
    expect(await readFile(page, TEMPLATE)).toBe(ORIGINAL);
    expect(await readFile(page, TEMPLATE + '-編集中')).toContain('MARKER_B');
  });

  test('「このファイルを書き換える」を選べば、これまでどおり元ファイルへ書く', async ({ page }) => {
    await openFromFolder(page, TEMPLATE);
    await editEditor(page, ORIGINAL + '\n\' 自分のメモ MARKER_C');
    await page.locator('#source-lock-overwrite').click();
    await page.waitForTimeout(1200);
    expect(await readFile(page, TEMPLATE)).toContain('MARKER_C');
    await expect(page.locator('#top-source-lock')).toHaveText('✎ ' + TEMPLATE);
  });

  test('図名欄で名前を変え終えれば錠は外れ、以後は新しい名前へ書く', async ({ page }) => {
    await openFromFolder(page, TEMPLATE);
    await editEditor(page, ORIGINAL + '\n\' 自分のメモ MARKER_D');
    await page.locator('#source-lock-keep').click();
    await page.waitForTimeout(800);

    // 図名欄 = タブのラベルをダブルクリックして改名する
    page.once('dialog', async (d) => { await d.accept('J1803_自分版'); });
    await page.locator('#tab-bar .tab.active .tab-label').dblclick();
    await page.waitForTimeout(500);
    await expect(page.locator('#top-source-lock')).toBeHidden();

    await editEditor(page, ORIGINAL + '\n\' 自分のメモ MARKER_E');
    await page.waitForTimeout(1000);
    expect(await readFile(page, 'J1803_自分版')).toContain('MARKER_E');
    expect(await readFile(page, TEMPLATE)).toBe(ORIGINAL);
  });

  // BLK-primary-20260909-0403: 開いたファイルが複数あると、タブを切り替えるたびに
  // 同じ確認が挟まる。1 回答えたら残りにも同じ扱いを当てて、二度と聞かない。
  test('1 回答えれば、他の開いたファイルでは確認が出ない', async ({ page }) => {
    await openFromFolder(page, TEMPLATE);
    await editEditor(page, ORIGINAL + '\n\' MARKER_F');
    await expect(page.locator('#source-lock-all')).toBeChecked();
    await page.locator('#source-lock-keep').click();
    await page.waitForTimeout(1000);

    // 2 枚目を開いて打っても、もう聞かれない
    await openFromFolder(page, TEMPLATE2);
    await editEditor(page, ORIGINAL + '\n\' MARKER_G');
    await expect(page.locator('#source-lock-modal')).toHaveCount(0);
    await page.waitForTimeout(1000);
    expect(await readFile(page, TEMPLATE2)).toBe(ORIGINAL);
    expect(await readFile(page, TEMPLATE2 + '-編集中')).toContain('MARKER_G');
    await expect(page.locator('#top-source-lock')).toHaveText('🔒 元ファイル保護');
  });

  test('チェックを外して答えれば、他のファイルでは今までどおり聞く', async ({ page }) => {
    await openFromFolder(page, TEMPLATE);
    await editEditor(page, ORIGINAL + '\n\' MARKER_H');
    await page.locator('#source-lock-all').uncheck();
    await page.locator('#source-lock-keep').click();
    await page.waitForTimeout(800);

    await openFromFolder(page, TEMPLATE2);
    await editEditor(page, ORIGINAL + '\n\' MARKER_I');
    await expect(page.locator('#source-lock-modal')).toBeVisible();
  });
});
