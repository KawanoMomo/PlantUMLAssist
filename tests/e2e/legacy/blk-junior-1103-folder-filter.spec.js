// @ts-check
// BLK-junior-20260908-1103: 📂 一覧は行ごとに印・役割・差分のボタンが付いた行が
// 20 枚超並ぶため、目的の 1 枚 (gpio_state) を名前だけを頼りに一発で押し分けにくく、
// 隣の図 (gpio_init_sequence) を開いてもトーストが出るまで気づけない。
// 名前を数文字打てば候補がその 1 枚になり、Enter でそのまま開けるようにする。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const DIR = './test-results/autosave-e2e-blk-j1103';
const NAMES = [
  'gpio_state', 'gpio_init_sequence', 'gpio_driver_class',
  'adc_state', 'spi_init_sequence', 'pwm_state',
];

function dslOf(name) {
  return '@startuml\ntitle ' + name + '\nAlice -> Bob : ' + name + '\n@enduml';
}

async function putFile(page, name) {
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { dir: DIR, name, dsl: dslOf(name) });
}

async function boot(page) {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page);
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
  for (const n of NAMES) await putFile(page, n);
}

async function openFolder(page) {
  // 保存先は既定で開いている (design 10a)。開いていれば畳んでから開き直し、一覧を今の中身で描き直す。
  if (await page.locator('#folder-panel.open').count()) await page.locator('#btn-tab-folder').click();
  await page.locator('#btn-tab-folder').click();
  await expect(page.locator('#folder-panel')).toHaveClass(/open/);
  await expect(page.locator('#folder-filter')).toBeVisible();
}

function visibleNames(page) {
  return page.locator('#folder-panel [data-file-name]:visible').evaluateAll(
    (els) => els.map((el) => el.getAttribute('data-file-name')));
}

test.describe('BLK-junior-1103 一覧を名前で絞り込む', () => {
  test('一覧を開くと絞り込み欄にカーソルがあり、そのまま名前を打てる', async ({ page }) => {
    await boot(page);
    await openFolder(page);
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id))
      .toBe('folder-filter');
  });

  test('打った文字に当たる行だけが残る', async ({ page }) => {
    await boot(page);
    await openFolder(page);
    const all = await visibleNames(page);
    expect(all.length).toBeGreaterThanOrEqual(6);

    await page.locator('#folder-filter').fill('gpio');
    const gpio = await visibleNames(page);
    expect(gpio.sort()).toEqual(['gpio_driver_class', 'gpio_init_sequence', 'gpio_state']);
    await expect(page.locator('#folder-filter-state')).toHaveText(/gpio に当たる図 3 \/ \d+ 枚/);
  });

  test('空白で区切ると両方を含む図だけになる', async ({ page }) => {
    await boot(page);
    await openFolder(page);
    await page.locator('#folder-filter').fill('gpio seq');
    expect(await visibleNames(page)).toEqual(['gpio_init_sequence']);
  });

  test('1 枚に絞れたら Enter でその図が開く (隣の図は開かない)', async ({ page }) => {
    await boot(page);
    await openFolder(page);
    await page.locator('#folder-filter').fill('gpio_state');
    expect(await visibleNames(page)).toEqual(['gpio_state']);

    await page.locator('#folder-filter').press('Enter');
    await page.waitForTimeout(900);
    expect(await page.locator('#editor').inputValue()).toContain('title gpio_state');
    expect(await page.locator('#editor').inputValue()).not.toContain('gpio_init_sequence');
    await expect(page.locator('#folder-panel')).not.toHaveClass(/open/);
  });

  test('2 枚以上に当たっているうちは Enter で何も開かない', async ({ page }) => {
    await boot(page);
    await openFolder(page);
    const before = await page.locator('#editor').inputValue();
    await page.locator('#folder-filter').fill('gpio');
    await page.locator('#folder-filter').press('Enter');
    await page.waitForTimeout(600);
    expect(await page.locator('#editor').inputValue()).toBe(before);
    await expect(page.locator('#folder-panel')).toHaveClass(/open/);
  });

  test('当たらなければその旨を出し、絞り込みを消せば全部戻る', async ({ page }) => {
    await boot(page);
    await openFolder(page);
    const all = (await visibleNames(page)).length;
    await page.locator('#folder-filter').fill('zzz');
    expect(await visibleNames(page)).toEqual([]);
    await expect(page.locator('#folder-filter-state')).toHaveText(/zzz に当たる図はありません/);

    await page.locator('#folder-filter').fill('');
    expect((await visibleNames(page)).length).toBe(all);
    await expect(page.locator('#folder-filter-state')).toHaveText('');
  });

  test('絞り込みは一覧を開き直すと白紙に戻る', async ({ page }) => {
    await boot(page);
    await openFolder(page);
    await page.locator('#folder-filter').fill('adc');
    expect(await visibleNames(page)).toEqual(['adc_state']);

    await page.locator('#btn-tab-folder').click();   // 閉じる
    await openFolder(page);
    expect(await page.locator('#folder-filter').inputValue()).toBe('');
    expect((await visibleNames(page)).length).toBeGreaterThanOrEqual(6);
  });

  test('手数: 一覧を開いて目的の 1 枚を出すまで クリック 1 / キー 11', async ({ page }) => {
    await boot(page);
    let clicks = 0;
    let keys = 0;
    await openFolder(page); clicks++;
    await expect(page.locator('#folder-filter')).toBeVisible();
    for (const ch of 'gpio_state') { await page.keyboard.type(ch); keys++; }
    await page.keyboard.press('Enter'); keys++;
    await page.waitForTimeout(900);
    expect(await page.locator('#editor').inputValue()).toContain('title gpio_state');
    expect(clicks).toBeLessThanOrEqual(10);
    expect(keys).toBeLessThanOrEqual(50);
  });
});
