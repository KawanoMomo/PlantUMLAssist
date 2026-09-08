// @ts-check
// BLK-junior-20260908-0723: 先輩 (primary) の図を読むためだけに、設定ダイアログで
// 保存先を persona-data\primary に打ち替え、読んだ後にまた persona-data\junior へ
// 打ち戻していた (往復でフルパス 2 回・60 字超)。戻し忘れると自分の図が他人の
// フォルダに紛れ込む。読むだけなら保存先を動かさずに見られるようにする。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const MINE = './test-results/autosave-e2e-blk-j0723/junior';
const SENPAI = './test-results/autosave-e2e-blk-j0723/primary';
const SEQ = '@startuml\nparticipant App\nparticipant Gpio\nApp -> Gpio : Gpio_Init()\n@enduml';

async function putFile(page, dir, name, dsl) {
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { dir, name, dsl });
}

async function clearDir(page, dir) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, dir);
}

async function boot(page) {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, MINE);
  await gotoApp(page);
}

async function savedDir(page) {
  return page.evaluate(() => {
    const cfg = JSON.parse(window.localStorage.getItem('plantuml-autosave-config') || '{}');
    return cfg.fileDir;
  });
}

test.describe('BLK-junior-0723 他フォルダの図を読むだけで見る', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page);
    await clearDir(page, MINE);
    await clearDir(page, SENPAI);
    await putFile(page, MINE, 'J0723_mine', SEQ.replace('Gpio_Init', 'My_Init'));
    await putFile(page, SENPAI, 'P0723_gpio_init', SEQ);
    await putFile(page, SENPAI, 'P0723_spi_init',
      '@startuml\nparticipant App\nparticipant Spi\nApp -> Spi : Spi_Init()\n@enduml');
    await page.waitForTimeout(300);
    await boot(page);
    await page.waitForTimeout(800);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page, MINE).catch(() => {});
    await clearDir(page, SENPAI).catch(() => {});
  });

  test('隣のフォルダが枚数付きで並び、自分の保存先が分かる', async ({ page }) => {
    await page.locator('#btn-tab-peek').click();
    await expect(page.locator('#peek-modal')).toBeVisible();
    const dirs = page.locator('#peek-dirs .peek-dir');
    await expect(dirs.first()).toHaveAttribute('data-current', '1');
    await expect(page.locator('#peek-dirs .peek-dir[data-dir-name="primary"]')).toBeVisible();
    await expect(page.locator('#peek-dirs .peek-dir[data-dir-name="primary"]')).toContainText('2 枚');
  });

  test('先輩の図を選ぶと本文と図がその場で出る', async ({ page }) => {
    await page.locator('#btn-tab-peek').click();
    await page.locator('#peek-dirs .peek-dir[data-dir-name="primary"]').click();
    await expect(page.locator('#peek-files .peek-file')).toHaveCount(2);
    await page.locator('#peek-files .peek-file[data-file-name="P0723_gpio_init"]').click();
    await expect(page.locator('#peek-dsl')).toContainText('Gpio_Init()');
    await expect(page.locator('#peek-svg svg')).toBeVisible();
    await expect(page.locator('#peek-title')).toContainText('読むだけ');
  });

  test('見ている間も保存先は自分のまま (紛れ込みが起きない)', async ({ page }) => {
    await page.locator('#btn-tab-peek').click();
    await page.locator('#peek-dirs .peek-dir[data-dir-name="primary"]').click();
    await expect(page.locator('#peek-notice')).toContainText('保存先は junior のままです');
    expect(await savedDir(page)).toBe(MINE);
    // 閲覧はタブを増やさない (増えれば自動保存で自分のフォルダへ書かれてしまう)
    await expect(page.locator('#tab-bar .tab')).toHaveCount(1);
    await page.locator('#peek-close').click();
    await page.waitForTimeout(600);
    expect(await savedDir(page)).toBe(MINE);
    const mine = await page.evaluate(async (d) => {
      const r = await fetch('/autosave?dir=' + encodeURIComponent(d));
      return (await r.json()).files;
    }, MINE);
    expect(mine.sort()).toEqual(['J0723_mine', 'diagram1'].sort());
  });

  test('↓ で次の図へ移れる (1 枚ごとに選び直さない)', async ({ page }) => {
    await page.locator('#btn-tab-peek').click();
    await page.locator('#peek-dirs .peek-dir[data-dir-name="primary"]').click();
    await expect(page.locator('#peek-files .peek-file.selected')).toHaveAttribute('data-file-name', 'P0723_gpio_init');
    await page.locator('#peek-next').click();
    await expect(page.locator('#peek-files .peek-file.selected')).toHaveAttribute('data-file-name', 'P0723_spi_init');
    await expect(page.locator('#peek-dsl')).toContainText('Spi_Init()');
  });

  test('実測 — 先輩の図を読んで戻るまでがクリック 10 以下・キー入力 50 以下', async ({ page }) => {
    let clicks = 0;
    let keys = 0;
    async function click(sel) { clicks++; await page.locator(sel).click(); }

    // 起票の手順: 先輩の GPIO 初期化シーケンス図を開いて読み、自分の作業へ戻る
    await click('#btn-tab-peek');
    await click('#peek-dirs .peek-dir[data-dir-name="primary"]');
    await click('#peek-files .peek-file[data-file-name="P0723_gpio_init"]');
    await expect(page.locator('#peek-dsl')).toContainText('Gpio_Init()');
    await click('#peek-close');

    expect(await savedDir(page)).toBe(MINE);
    // 変更前は保存先のフルパスを 2 回打ち直していた (往復 60 字超)
    console.log('MEASURE clicks=' + clicks + ' keys=' + keys);
    expect(clicks).toBeLessThanOrEqual(10);
    expect(keys).toBeLessThanOrEqual(50);
  });
  // BLK-junior-20260909-0503-wish: 読むだけで見た図は自分のタブへ何も引き継がれず、
  // 見た構成を覚えて新規タブに打ち直していた (実測 360 字)。覗いた 1 枚を
  // そのままテンプレートに据えて、部品名だけ替えて作れるようにする。
  test('図を選ぶまで「テンプレートとして開く」は押せない', async ({ page }) => {
    await page.locator('#btn-tab-peek').click();
    await page.locator('#peek-dirs .peek-dir[data-current="1"]').click();
    await page.locator('#peek-files .peek-file[data-file-name="J0723_mine"]').click();
    await expect(page.locator('#peek-template')).toBeEnabled();
    await page.locator('#peek-close').click();
    await page.locator('#btn-tab-peek').click();
    await expect(page.locator('#peek-template')).toBeDisabled();
  });

  test('覗いた先輩の図をテンプレートにして、部品名だけ替えた図が作れる', async ({ page }) => {
    await page.locator('#btn-tab-peek').click();
    await page.locator('#peek-dirs .peek-dir[data-dir-name="primary"]').click();
    await page.locator('#peek-files .peek-file[data-file-name="P0723_gpio_init"]').click();
    await expect(page.locator('#peek-dsl')).toContainText('Gpio_Init()');

    await page.locator('#peek-template').click();
    await expect(page.locator('#peek-modal')).toBeHidden();
    await expect(page.locator('#tpl-modal')).toBeVisible();
    // 覗いてきた図が選ばれた状態で開く (選び直しをさせない)
    await expect(page.locator('#tpl-source')).toHaveValue('peek:primary/P0723_gpio_init');
    await expect(page.locator('#tpl-source option:checked')).toContainText('primary');
    // 置換元は本文から決まっているので、打つのは作る部品名だけ
    await expect(page.locator('#tpl-from')).toHaveValue('Gpio');

    await page.locator('#tpl-to').fill('Can');
    // 元の系統のままの部品はチェックリストで片付ける
    const keep = page.locator('[data-remaining-keep="App"]');
    if (await keep.count()) await keep.check();
    await expect(page.locator('#tpl-preview .tpl-row')).not.toHaveCount(0);
    await expect(page.locator('#btn-tpl-create')).toBeEnabled();
    await page.locator('#btn-tpl-create').click();

    await expect(page.locator('#tpl-modal')).toBeHidden();
    const dsl = await page.locator('#editor').inputValue();
    expect(dsl).toContain('Can_Init()');
    expect(dsl).toContain('participant Can');
    expect(dsl).not.toContain('Gpio');
    // 保存先は自分のまま (覗いたフォルダには書かない)
    expect(await savedDir(page)).toBe(MINE);
  });

  test('実測 — 覗いた図をテンプレートに起こすまでがクリック 10 以下・キー入力 50 以下', async ({ page }) => {
    let clicks = 0;
    let keys = 0;
    async function click(sel) { clicks++; await page.locator(sel).click(); }
    async function type(sel, text) { keys += text.length; await page.locator(sel).fill(text); }

    await click('#btn-tab-peek');
    await click('#peek-dirs .peek-dir[data-dir-name="primary"]');
    await click('#peek-files .peek-file[data-file-name="P0723_gpio_init"]');
    await click('#peek-template');
    await type('#tpl-to', 'Can');
    const keep = page.locator('[data-remaining-keep="App"]');
    if (await keep.count()) { clicks++; await keep.check(); }
    await click('#btn-tpl-create');

    const dsl = await page.locator('#editor').inputValue();
    expect(dsl).toContain('Can_Init()');
    // 変更前は先輩の図を覚えて新規タブに全部打ち直していた (実測 360 字)
    console.log('MEASURE clicks=' + clicks + ' keys=' + keys);
    expect(clicks).toBeLessThanOrEqual(10);
    expect(keys).toBeLessThanOrEqual(50);
  });
});
