// @ts-check
// BLK-primary-20260908-0723-wish: ⇄一括置換のヒット数は「今開いているタブ」しか
// 数えないので、22 枚のうち 1 枚だけ開いた状態で置換すると、残りに同じ名前が
// 何件あるかが分からない。仕様変更が全図に及んだかを確かめるには、結局
// 15 枚を 1 枚ずつ開き直して目で見るしかなかった。
// 保存フォルダの全ファイルを先に数え、ヒットした図・しなかった図を一覧で出し、
// 置換もその一覧 (テンプレを除く) に当たることを確認する。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('./helpers');

const DIR = saveDirFor(__filename);

function seq(name) {
  return '@startuml\nparticipant ' + name + '\nparticipant Mcu\n'
    + name + ' -> Mcu : init()\n@enduml';
}

const FILES = {
  P0723_spi: seq('SpiDrv'),
  P0723_can: seq('SpiDrv'),
  P0723_adc: seq('AdcDrv'),
  'plantuml-p0723-tpl': seq('SpiDrv'),
};

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
    return r.ok ? await r.text() : null;
  }, { name, dir: DIR });
}

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

// テンプレ宣言 (_roles.json)。テンプレは数えるが置換の的から外れる。
async function declareTemplate(page, name) {
  await page.evaluate(async (a) => {
    await fetch('/file-roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir: a.dir, roles: { [a.name]: { role: 'template' } } }),
    });
  }, { name, dir: DIR });
}

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(250);
}

async function openRename(page, from, to) {
  await page.locator('#btn-tab-rename').click();
  await expect(page.locator('#rename-panel')).toHaveClass(/open/);
  await expect(page.locator('#rename-folder-head')).toHaveAttribute('data-loading', '0');
  if (from != null) await page.locator('#rename-from').fill(from);
  if (to != null) await page.locator('#rename-to').fill(to);
  await page.waitForTimeout(150);
}

test.describe('BLK-primary-0723-wish 開いていない図も含めた置換の影響範囲', () => {
  test.beforeEach(async ({ page }) => {
    await bootWithDir(page);
    await clearDir(page);
    for (const name of Object.keys(FILES)) await putFile(page, name, FILES[name]);
    await declareTemplate(page, 'plantuml-p0723-tpl');
    await page.waitForTimeout(300);
    await bootWithDir(page);
    await typeDsl(page, seq('SpiDrv'));
  });

  test.afterEach(async ({ page }) => { await clearDir(page).catch(() => {}); });

  test('開いていない図のヒット件数が置換の前に出る', async ({ page }) => {
    await openRename(page, 'SpiDrv', 'Spi_Driver');
    const head = page.locator('#rename-folder-head');
    // 開いているタブ 1 枚しか見えていなかったところを、保存フォルダごと数える。
    // (アプリが同梱テンプレを保存フォルダに置くので、枚数は「4 枚以上」で見る)
    expect(Number(await head.getAttribute('data-files'))).toBeGreaterThanOrEqual(5);
    // 開いていない spi / can / テンプレの 3 枚が、開き直さずに数に入る。
    expect(Number(await head.getAttribute('data-unopened-hit-docs'))).toBeGreaterThanOrEqual(3);
    await expect(head).toContainText('未オープン');
    await expect(head).toContainText('テンプレ 1 枚は置換しない');
  });

  test('ヒットした図が先に並び、当たらなかった図も一覧に残る', async ({ page }) => {
    await openRename(page, 'SpiDrv', 'Spi_Driver');
    const rows = page.locator('#rename-folder .folder-row');
    // 最後の 1 行がヒット 0 (当たらなかった図も「調べた」ことが見える)
    await expect(rows.last()).toHaveAttribute('data-doc-name', 'P0723_adc');
    await expect(rows.last()).toHaveAttribute('data-count', '0');
    // 先頭は開いているタブ (ヒットあり)。ヒット 0 は後ろにしか出ない。
    await expect(rows.first()).not.toHaveAttribute('data-count', '0');
    const tpl = page.locator('#rename-folder .folder-row[data-doc-name="plantuml-p0723-tpl"]');
    await expect(tpl).toHaveAttribute('data-target', '0');
    await expect(tpl).toContainText('テンプレ (置換しない)');
    await expect(page.locator('#rename-folder .folder-row[data-doc-name="P0723_spi"]'))
      .toHaveAttribute('data-count', '2');
  });

  test('置換を押すと開いていない図もそのまま直る (開き直さない)', async ({ page }) => {
    await openRename(page, 'SpiDrv', 'Spi_Driver');
    const summary = page.locator('#rename-summary');
    expect(Number(await summary.getAttribute('data-unopened-docs'))).toBeGreaterThanOrEqual(2);
    await page.locator('#btn-rename-apply').click();
    // 「置換しました」が出るまで待つ (押した直後はまだ置換前の予告が出ている)
    await expect(summary).toContainText('置換しました');
    await expect(summary).toContainText('未オープン');
    expect(Number(await summary.getAttribute('data-applied-unopened'))).toBeGreaterThanOrEqual(2);
    expect(await readFile(page, 'P0723_spi')).toContain('Spi_Driver');
    expect(await readFile(page, 'P0723_can')).toContain('Spi_Driver');
    expect(await readFile(page, 'P0723_spi')).not.toContain('participant SpiDrv\n');
    // テンプレは触らない (テンプレ汚染を一括置換から出さない)
    expect(await readFile(page, 'plantuml-p0723-tpl')).toContain('SpiDrv');
    // 当たらなかった図も無傷
    expect(await readFile(page, 'P0723_adc')).toBe(FILES.P0723_adc);
  });

  test('チェックを外すと従来どおり開いている図だけを数える', async ({ page }) => {
    await openRename(page, 'SpiDrv', 'Spi_Driver');
    await page.locator('#rename-scan-folder').uncheck();
    await page.waitForTimeout(150);
    await expect(page.locator('#rename-folder-head')).toHaveCount(0);
    await expect(page.locator('#rename-summary')).toHaveAttribute('data-unopened-docs', '0');
    await expect(page.locator('#rename-summary')).toHaveAttribute('data-grand-total', '2');
  });

  test('開いていない図にしか無い名前でも置換できる', async ({ page }) => {
    await typeDsl(page, '@startuml\nparticipant Mcu\nMcu -> Mcu : tick()\n@enduml');
    await openRename(page, 'AdcDrv', 'Adc_Driver');
    await expect(page.locator('#btn-rename-apply')).toBeEnabled();
    await page.locator('#btn-rename-apply').click();
    await expect(page.locator('#rename-summary')).toContainText('置換しました');
    await expect(page.locator('#rename-summary')).toHaveAttribute('data-applied-unopened', '1');
    expect(await readFile(page, 'P0723_adc')).toContain('Adc_Driver');
  });
});
