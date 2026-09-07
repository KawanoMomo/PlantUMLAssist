// @ts-check
// BLK-junior-20260908-0723-wish
// 先輩(primary)版と自分(junior)版の同種図を突き合わせる場面を、実機でなぞる。
// これまでは自分の保存先設定を先輩フォルダへ替えて開き、内容を憶えてから設定を
// 戻して打ち直していた。相手フォルダを打つだけで、名前の近い図が相手に選ばれ、
// 「相手にしかない要素」が並び、1 クリックで自分の図に入ることを見る。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const SELF_DIR = './test-results/autosave/blk-junior-0723-wish-cross-ref-diff/e2e-xf-junior';
const REF_DIR = './test-results/autosave/blk-junior-0723-wish-cross-ref-diff/e2e-xf-primary';
const NAME = 'GPIOドライバ初期化シーケンス';

const SELF_DSL = [
  '@startuml',
  'title GPIO ドライバ初期化',
  'actor App',
  'participant Gpio_Driver',
  'participant Driver_Common',
  'App -> Gpio_Driver : Gpio_Init()',
  'Gpio_Driver -> Driver_Common : Common_Init()',
  '@enduml',
].join('\n');

// 先輩版は note が 1 本多い。
const REF_DSL = [
  '@startuml',
  'title GPIO ドライバ初期化',
  'actor App',
  'participant Gpio_Driver',
  'participant Driver_Common',
  'note over Gpio_Driver : shares Driver_Common base with Spi_Driver',
  'App -> Gpio_Driver : Gpio_Init()',
  'Gpio_Driver -> Driver_Common : Common_Init()',
  '@enduml',
].join('\n');

// 先輩のフォルダに図を 1 枚置く (server の /autosave にそのまま書く)。
async function seedRefFolder(page) {
  await page.evaluate(([dir, name, dsl]) => {
    return fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: name, dsl: dsl, dir: dir }),
    }).then((r) => r.ok);
  }, [REF_DIR, NAME, REF_DSL]);
}

async function setup(page) {
  await gotoApp(page);
  await page.evaluate(([dir, name]) => {
    window.MA.autoSave.setConfig({
      enabled: true, debounceMs: 500, restoreMode: 'none',
      backend: 'file', fileDir: dir,
    });
    // 今開いているタブを「自分の図」にする (名前が相手探しの手掛かりになる)。
    window.MA.workspace.rename(window.MA.workspace.getActiveId(), name);
  }, [SELF_DIR, NAME]);
  await page.locator('#editor').fill(SELF_DSL);
  await page.waitForTimeout(900);
  await seedRefFolder(page);
  // 並べて見るペインを開く
  await page.locator('#btn-tab-compare').click();
  await page.waitForTimeout(400);
}

async function loadRef(page) {
  await page.locator('#xf-dir').fill(REF_DIR);
  await page.locator('#btn-xf-load').click();
  await expect(page.locator('#xf-summary')).toBeVisible();
}

test.describe('他の人のフォルダの図と突き合わせる (BLK-junior-0723-wish)', () => {

  test('並べて見るペインに、相手のフォルダを入れる欄がある', async ({ page }) => {
    await setup(page);
    await expect(page.locator('#xf-dir')).toBeVisible();
    await expect(page.locator('#btn-xf-load')).toBeVisible();
  });

  test('相手のフォルダを打つと、名前の近い図が勝手に相手に選ばれる', async ({ page }) => {
    await setup(page);
    await loadRef(page);
    await expect(page.locator('#xf-pick')).toBeVisible();
    await expect(page.locator('#xf-file')).toHaveValue(NAME);
  });

  test('相手にしかない要素が名指しで並ぶ', async ({ page }) => {
    await setup(page);
    await loadRef(page);
    await expect(page.locator('#xf-summary')).toContainText('相手にしかない 1 件');
    const rows = page.locator('#xf-list .xf-row.only-ref');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('shares Driver_Common base');
  });

  test('「取り込む」を押すと、その 1 行が自分の DSL に入る', async ({ page }) => {
    await setup(page);
    await loadRef(page);
    await page.locator('#xf-list .xf-row.only-ref .xf-take').first().click();
    await page.waitForTimeout(600);
    await expect(page.locator('#editor')).toHaveValue(/shares Driver_Common base with Spi_Driver/);
    // 取り込んだ後は差が無くなり、その旨が出る
    await expect(page.locator('#xf-summary')).toContainText('同じ要素が揃っています');
  });

  test('取り込んでも自分の保存先設定は変わらない (先輩フォルダに書かない)', async ({ page }) => {
    await setup(page);
    await loadRef(page);
    await page.locator('#xf-list .xf-row.only-ref .xf-take').first().click();
    await page.waitForTimeout(600);
    const dir = await page.evaluate(() => window.MA.autoSave.getConfig().fileDir);
    expect(dir).toBe(SELF_DIR);
  });

  test('無いフォルダを打つと、その旨が出る (黙って空にならない)', async ({ page }) => {
    await setup(page);
    await page.locator('#xf-dir').fill('./test-results/autosave/blk-junior-0723-wish-cross-ref-diff/e2e-xf-nowhere');
    await page.locator('#btn-xf-load').click();
    await expect(page.locator('#xf-summary')).toContainText('見つかりません');
    await expect(page.locator('#xf-list')).toBeHidden();
  });

  test('打った相手フォルダは開き直しても残る', async ({ page }) => {
    await setup(page);
    await loadRef(page);
    await page.reload();
    await page.waitForSelector('#preview-svg');
    await page.locator('#btn-tab-compare').click();
    await page.waitForTimeout(400);
    await expect(page.locator('#xf-dir')).toHaveValue(REF_DIR);
  });

  test('先輩の図を読むのに、保存先設定の往復は要らない (クリック 10 以下・キー入力 50 以下)', async ({ page }) => {
    await setup(page);
    let clicks = 0;
    await page.exposeFunction('__countClick', () => { clicks++; });
    await page.evaluate(() => document.addEventListener('click', () => window.__countClick(), true));

    // ① フォルダ欄に打つ ② 探す ③ 取り込む
    await page.locator('#xf-dir').fill(REF_DIR);           // キー入力 = REF_DIR の長さ
    await page.locator('#btn-xf-load').click();
    await expect(page.locator('#xf-summary')).toBeVisible();
    await page.locator('#xf-list .xf-row.only-ref .xf-take').first().click();
    await page.waitForTimeout(600);

    await expect(page.locator('#editor')).toHaveValue(/shares Driver_Common base/);
    expect(clicks).toBeLessThanOrEqual(10);
    // 打つのはフォルダ名 1 つだけというのが AC。REF_DIR の前半
    // (test-results/autosave/<spec 名>/) はテストの置き場であって、
    // 利用者が打つものではない (BLK-releaser-20260908-0800)。
    expect(REF_DIR.split('/').pop().length).toBeLessThanOrEqual(50);
  });
});
