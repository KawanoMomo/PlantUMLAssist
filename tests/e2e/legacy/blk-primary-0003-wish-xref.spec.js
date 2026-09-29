// @ts-check
// BLK-primary-20260908-0003-wish 「参照関係グラフ」。
// 14 枚一式を新人に渡すとき、「この図とこの図は同じ部品名で繋がっている」という
// 関係を渡す手段が無かった。開いている図を 1 プロジェクトとして扱い、部品名を
// 押すとその名前が出る図がタブ上でハイライトされ、一覧から該当行へ運べる。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

// ▤ に載る図の束は「開いているタブ + 保存フォルダ」。既定の ./autosave には他の spec が残した図が
// 入っているので、この spec だけの空の保存先を指し、保存は localStorage に取る (フォルダには書かない)。
// 数えるのは開いた 3 枚だけになる (BLK-releaser-20260929-0851-1)。
const DIR = saveDirFor(__filename);

const SPI = [
  '@startuml', 'participant Spi_Driver', 'participant DmaCtrl',
  'Spi_Driver -> DmaCtrl : Spi_TransmitDma', '@enduml',
].join('\n');
const CAN = [
  '@startuml', 'participant Can_Driver', 'participant DmaCtrl',
  'Can_Driver -> DmaCtrl : Can_Write', '@enduml',
].join('\n');
const CLS = [
  '@startuml', 'class Spi_Driver', 'class Can_Driver',
  'Spi_Driver --> DmaCtrl', '@enduml',
].join('\n');

async function setDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(700);
}

async function rename(page, name) {
  await page.evaluate((n) => {
    var ws = window.MA.workspace;
    ws.rename(ws.getActiveId(), n);
  }, name);
  await page.waitForTimeout(200);
}

// spi / can / driver_common_class の 3 枚。DmaCtrl は 3 枚すべてに出てくる。
async function openThree(page) {
  await gotoApp(page);
  await rename(page, 'spi');
  await setDsl(page, SPI);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(300);
  await rename(page, 'can');
  await setDsl(page, CAN);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(300);
  await rename(page, 'driver_common_class');
  await page.locator('#diagram-type').selectOption('plantuml-class');
  await page.waitForTimeout(500);
  await setDsl(page, CLS);
}

// BLK-owner-20260924-0852-prune: 🕸 参照関係の画面は ▤ 影響を見る 1 つに寄せた。旧入口 (#btn-tab-xref) は
// 名前を空のまま ▤ 影響を見る を開き、下段に「図をまたぐ部品名」が枚数付きで並ぶ。
async function openXref(page) {
  await page.locator('#btn-tab-xref').click();
  await page.waitForSelector('#ri-modal', { state: 'visible' });
  await page.waitForTimeout(300);
}

test.describe('BLK-primary-20260908-0003-wish 参照関係グラフ (▤ 影響を見る の中)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((d) => {
      try {
        window.localStorage.clear();
        window.localStorage.setItem('plantuml-autosave-config',
          JSON.stringify({ enabled: true, debounceMs: 300, restoreMode: 'none', backend: 'localStorage', fileDir: d }));
      } catch (e) {}
    }, DIR);
  });

  test('タブバーの旧「参照関係」の入口は ▤ 影響を見る を開く', async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator('#btn-tab-xref')).toBeVisible();
    await expect(page.locator('#btn-tab-xref')).toContainText('影響を見る');
    await openXref(page);
    // 別の画面 (#xref-panel) は無い。
    await expect(page.locator('#xref-panel')).toHaveCount(0);
    // 名前は空のまま開く。
    await expect(page.locator('#ns-q')).toHaveValue('');
  });

  test('3 枚を 1 プロジェクトとして、図をまたぐ部品名が枚数付きで並ぶ', async ({ page }) => {
    await openThree(page);
    await openXref(page);

    const head = page.locator('#ri-xref-head');
    await expect(head).toHaveAttribute('data-docs', '3');
    await expect(head).toHaveAttribute('data-shared', '3');
    await expect(head).toContainText('図をまたぐ部品名 3 件');

    // 多く跨ぐ名前が先頭に来る (辿る起点になる)。
    const first = page.locator('#ri-xref-names .ri-xref-name').first();
    await expect(first).toHaveAttribute('data-name', 'DmaCtrl');
    await expect(first).toHaveAttribute('data-docs', '3');
    // 1 枚にしか出ない語は手掛かりにならないので並べない。
    await expect(page.locator('#ri-xref-names .ri-xref-name[data-name="Spi_TransmitDma"]')).toHaveCount(0);
  });

  test('部品名を 1 回押すと、出てくる図が一覧に出てタブに印が付く', async ({ page }) => {
    await openThree(page);
    await openXref(page);

    await page.locator('#ri-xref-names .ri-xref-name[data-name="DmaCtrl"]').click();
    await page.waitForTimeout(300);

    // その名前で引き直される (名前欄に入り、出てくる図と行が並ぶ)。
    await expect(page.locator('#ns-q')).toHaveValue('DmaCtrl');
    const rows = page.locator('#ns-rows .ns-row');
    await expect(rows).toHaveCount(3);
    // 宣言が無い図はその旨が分かる。
    await expect(page.locator('#ns-rows .ns-row[data-name="driver_common_class"]'))
      .toHaveAttribute('data-declared', '0');
    await expect(page.locator('#ns-rows .ns-row[data-name="spi"]'))
      .toHaveAttribute('data-declared', '1');

    // タブ側でも 3 枚に印が付く。1 枚ずつ開いて名前を照合しなくてよい。
    await expect(page.locator('#tab-bar .tab.xref-hit')).toHaveCount(3);
    // 閉じれば印は消える。
    await page.locator('#ri-close').click();
    await expect(page.locator('#tab-bar .tab.xref-hit')).toHaveCount(0);
  });

  test('行き先を押すとその図のその行へ運ばれる', async ({ page }) => {
    await openThree(page);
    await openXref(page);
    await page.locator('#ri-xref-names .ri-xref-name[data-name="Spi_Driver"]').click();
    await page.waitForTimeout(300);

    await page.locator('#ns-rows .ns-row[data-name="spi"] button.ns-at').first().click();
    await page.waitForTimeout(800);

    // spi の図に移っている。
    await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-doc-name', 'spi');
    expect(await page.locator('#editor').inputValue()).toContain('Spi_TransmitDma');
  });

  test('図と図の繋がりが、共有している名前付きで参照の連鎖の下に畳まれて出る', async ({ page }) => {
    await openThree(page);
    await openXref(page);
    await page.locator('#ri-links-box > summary').click();
    const link = page.locator('#ri-links .ri-link[data-a="driver_common_class"][data-b="spi"]');
    await expect(link).toHaveCount(1);
    await expect(link).toBeVisible();
    await expect(link).toContainText('DmaCtrl');
    await expect(link).toContainText('Spi_Driver');
  });

  test('参照関係を 1 枚のテキストとして ▤ の見出しから書き出せる', async ({ page }) => {
    await openThree(page);
    await openXref(page);
    const dl = page.waitForEvent('download');
    await page.locator('#ri-export').click();
    const download = await dl;
    expect(download.suggestedFilename()).toBe('xref.md');
    const md = require('fs').readFileSync(await download.path(), 'utf8');
    expect(md).toContain('## 図をまたぐ部品名');
    expect(md).toContain('DmaCtrl (3 枚)');
  });

  test('図が 1 枚だけなら「またぐ名前は無い」と言う', async ({ page }) => {
    await gotoApp(page);
    await setDsl(page, SPI);
    await openXref(page);
    await expect(page.locator('#ri-xref-none')).toBeVisible();
    await expect(page.locator('#ri-xref-head')).toHaveAttribute('data-shared', '0');
  });

  test('旧名で引いても ▤ 影響を見る が開く (ツール ▾ と Ctrl+K)', async ({ page }) => {
    await openThree(page);
    // ツール ▾「探す」→「部品名で図をまたいで辿る」
    const label = await page.evaluate(() => {
      var items = window.MA.toolMenu.filterItems('またいで辿る');
      return items.length ? items[0].label : '';
    });
    expect(label).toContain('影響を見る');
    // Ctrl+K「参照関係を開く」
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#cp-modal');
    await page.locator('#cp-input').fill('参照関係');
    await page.waitForTimeout(250);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#ri-modal', { state: 'visible' });
    await expect(page.locator('#ri-xref-names .ri-xref-name').first()).toHaveAttribute('data-name', 'DmaCtrl');
  });
});
