// @ts-check
// BLK-junior-20260908-0203-wish: コンポーネント図で「定石の依存先のうち今の図に
// 無いもの」がチェックリストで出て、選ぶだけで図に入ること。これが無い間は、
// 先輩の UART / CAN の図を 1 枚ずつ開いて見比べないと抜けに気づけなかった。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText } = require('./helpers');

const GPIO = [
  '@startuml',
  'title GpioDrv',
  'component GpioDrv',
  'component Port_Drv',
  'GpioDrv ..> Port_Drv : 依存',
  '@enduml',
].join('\n');

const UART = [
  '@startuml',
  'title UartDrv',
  'component UartDrv',
  'component Power_Ctrl',
  'component Dma_Drv',
  'UartDrv ..> Power_Ctrl : 依存',
  'UartDrv ..> Dma_Drv : 依存',
  '@enduml',
].join('\n');

async function freshWorkspace(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'localStorage', fileDir: './test-results/autosave/blk-junior-0203-wish-component-deps/e2e-blk-j0203w' }));
    } catch (e) {}
  });
}

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(400);
}

async function openComponent(page) {
  await gotoApp(page);
  await page.locator('#diagram-type').selectOption('plantuml-component');
  await page.waitForTimeout(500);
}

test.describe('BLK-junior-0203 定石の依存チェック (コンポーネント図)', () => {
  test.beforeEach(async ({ page }) => { await freshWorkspace(page); });

  test('図に無い定石の依存先が理由付きで並ぶ', async ({ page }) => {
    await openComponent(page);
    await typeDsl(page, GPIO);

    const summary = page.locator('#co-deps-summary');
    await expect(summary).toContainText('定石 6 件');
    await expect(summary).toHaveAttribute('data-catalog-missing', '6');

    const rows = page.locator('#co-deps-list .co-dep-row');
    await expect(rows).toHaveCount(6);
    await expect(rows.first()).toContainText('Power_Ctrl');
    await expect(rows.first()).toContainText('電源制御');
    // 「なぜその依存が要るのか」が出るので、言われたまま足すことにならない。
    await expect(rows.first()).toContainText('電源ドメイン');
    await expect(page.locator('#co-deps-list')).toContainText('IrqCtrl');
    await expect(page.locator('#co-deps-list')).toContainText('Clock_Ctrl');
    await expect(page.locator('#co-deps-list')).toContainText('Board_Cfg');
  });

  test('選んだ依存先が宣言と矢印になって図に入る', async ({ page }) => {
    await openComponent(page);
    await typeDsl(page, GPIO);

    await page.locator('#co-deps-list .co-dep-row[data-dep-key="cat:power"] input').check();
    await page.locator('#co-deps-list .co-dep-row[data-dep-key="cat:irq"] input').check();
    await page.locator('#co-deps-add').click();

    await expect.poll(async () => await getEditorText(page)).toContain('component Power_Ctrl');
    const dsl = await getEditorText(page);
    expect(dsl).toContain('component IrqCtrl');
    expect(dsl).toMatch(/GpioDrv\s+\.\.>\s+Power_Ctrl\s*:\s*電源制御/);
    expect(dsl).toMatch(/GpioDrv\s+\.\.>\s+IrqCtrl\s*:\s*割り込み制御/);

    // 足した分は候補から消える。棚卸しが 1 周で終わる。
    await expect(page.locator('#co-deps-summary')).toHaveAttribute('data-catalog-missing', '4');
    await expect(page.locator('#co-deps-list .co-dep-row[data-dep-key="cat:power"]')).toHaveCount(0);
  });

  test('他の図で依存先になっている名前も、図を開かずに候補として出る', async ({ page }) => {
    await gotoApp(page);
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(500);
    await typeDsl(page, UART);
    await page.locator('#btn-tab-new').click();
    await page.locator('#diagram-type').selectOption('plantuml-component');
    await page.waitForTimeout(500);
    await typeDsl(page, GPIO);
    await expect(page.locator('#tab-bar .tab')).toHaveCount(2);

    const summary = page.locator('#co-deps-summary');
    await expect(summary).toContainText('他の図にあって無い依存');
    const peer = page.locator('#co-deps-list .co-dep-row[data-dep-source="peer"]');
    await expect(peer).toContainText('Dma_Drv');
    // どの図から来た候補なのかが出る (先輩の図を開いて確かめ直さずに済む)。
    await expect(peer.filter({ hasText: 'Dma_Drv' })).toContainText('他の図 1 枚');

    // Power_Ctrl は定石にもあるので、二重には出ない。
    await expect(page.locator('#co-deps-list .co-dep-row').filter({ hasText: 'Power_Ctrl' })).toHaveCount(1);
  });

  test('定石が全部あれば欠け無しと言い、リストは出ない', async ({ page }) => {
    await openComponent(page);
    await typeDsl(page, [
      '@startuml', 'component GpioDrv',
      'GpioDrv ..> Power_Ctrl', 'GpioDrv ..> IrqCtrl', 'GpioDrv ..> Clock_Ctrl',
      'GpioDrv ..> Board_Cfg', 'GpioDrv ..> Det', 'GpioDrv ..> SchM',
      '@enduml',
    ].join('\n'));

    await expect(page.locator('#co-deps-summary')).toContainText('すべて図にあります');
    await expect(page.locator('#co-deps-list')).toHaveCount(0);
  });
});
