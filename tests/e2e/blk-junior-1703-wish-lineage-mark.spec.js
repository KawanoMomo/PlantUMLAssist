// @ts-check
// BLK-junior-20260908-1703-wish
// 「⇡ 継承元」で更新の有無と差分行数は出るようになったが、増えた行が画面のどこかは
// 自分で探すしかなかった。GpioDrv から伸びる矢印が 5 本あり、見た目は実線/点線の
// 違いだけなので、目的の 1 本 (IrqCtrl への依存) は 1 本ずつクリックして右パネルを
// 読むまで分からない。差分を図の上で色付けし、その 1 本を一目で出す。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('./helpers');

const SELF_DIR = './test-results/autosave/blk-junior-1703-wish-lineage-mark/self';
const REF_DIR = './test-results/autosave/blk-junior-1703-wish-lineage-mark/primary';
const CHILD = 'GPIOドライバ構成_先輩反映';
const PARENT = 'GPIOドライバ構成_primary';

// junior の図。GpioDrv から 5 本出ていて、ラベルはどれにも付いていない。
const CHILD_DSL = [
  '@startuml',
  'component "GPIO Driver" as GpioDrv',
  'component IrqCtrl',
  'component Power_Ctrl',
  'component Timer',
  'component Clock',
  'component Uart',
  'GpioDrv --> Power_Ctrl',
  'GpioDrv ..> IrqCtrl',
  'GpioDrv --> Timer',
  'GpioDrv ..> Clock',
  'GpioDrv --> Uart',
  '@enduml',
].join('\n');

const PARENT_V1 = CHILD_DSL;

// 先輩が「依存関係にラベルを付ける」変更を入れた版。IrqCtrl への 1 本だけ。
const PARENT_V2 = CHILD_DSL.replace('GpioDrv ..> IrqCtrl', 'GpioDrv ..> IrqCtrl : 割り込み登録');

// 先輩が、自分の図にはまだ無い相手を足した版。
const PARENT_V3 = CHILD_DSL.replace('@enduml', 'GpioDrv --> Watchdog : reset\n@enduml');

async function seed(page, dir, name, dsl) {
  await page.evaluate(([d, n, t]) => {
    return fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: n, dsl: t, dir: d }),
    }).then((r) => r.ok);
  }, [dir, name, dsl]);
}

async function setup(page) {
  await gotoApp(page);
  await page.evaluate(() => window.MA.lineage.reset());
  await page.evaluate(([dir, name]) => {
    window.MA.autoSave.setConfig({
      enabled: true, debounceMs: 500, restoreMode: 'none',
      backend: 'file', fileDir: dir,
    });
    window.MA.workspace.rename(window.MA.workspace.getActiveId(), name);
  }, [SELF_DIR, CHILD]);
  await page.locator('#editor').fill(CHILD_DSL);
  await page.waitForTimeout(1200);
  await seed(page, REF_DIR, PARENT, PARENT_V1);
}

async function register(page) {
  await page.locator('#btn-tab-lineage').click();
  await expect(page.locator('#lg-modal')).toBeVisible();
  await page.locator('#lg-dir').fill(REF_DIR);
  await page.locator('#lg-dir').dispatchEvent('change');
  await page.waitForTimeout(400);
  await page.locator('#lg-parent').selectOption(PARENT);
  await page.locator('#lg-set').click();
  await page.waitForTimeout(400);
  await page.locator('#lg-close').click();
}

async function openAfterParentChange(page, dsl) {
  await seed(page, REF_DIR, PARENT, dsl);
  await page.locator('#btn-tab-lineage').click();
  await expect(page.locator('#lg-summary')).toContainText('更新されています');
}

test.describe('BLK-junior-20260908-1703-wish: 継承元の差分を図で色付け', () => {
  test('更新が無いうちは色付けボタンは押せない', async ({ page }) => {
    await setup(page);
    await register(page);
    await page.locator('#btn-tab-lineage').click();
    await expect(page.locator('#lg-summary')).toContainText('取り込み済み');
    await expect(page.locator('#lg-mark')).toBeDisabled();
  });

  test('ラベルが付いた 1 本だけが図の上で色付く (5 本を 1 本ずつ当てない)', async ({ page }) => {
    await setup(page);
    await register(page);
    await openAfterParentChange(page, PARENT_V2);

    await page.locator('#lg-mark').click();
    await expect(page.locator('#lg-modal')).toBeHidden();
    await expect(page.locator('#lg-mark-overlay')).toBeVisible();

    // 色が付いたのは 1 本だけ。しかもそれは IrqCtrl への依存の行。
    const marked = await page.evaluate(() => {
      const els = document.querySelectorAll('#overlay-layer rect.lg-mark');
      return Array.prototype.map.call(els, (r) => Number(r.getAttribute('data-line')));
    });
    expect(marked.length).toBeGreaterThan(0);
    const irqLine = CHILD_DSL.split('\n').indexOf('GpioDrv ..> IrqCtrl') + 1;
    expect([...new Set(marked)]).toEqual([irqLine]);
    await expect(page.locator('#lgm-summary')).toContainText('色付け');
  });

  test('自分の図にまだ無い変更は帯に並ぶ (どこにも色が付かず探し続ける、を防ぐ)', async ({ page }) => {
    await setup(page);
    await register(page);
    await openAfterParentChange(page, PARENT_V3);

    await page.locator('#lg-mark').click();
    await expect(page.locator('#lg-mark-overlay')).toBeVisible();
    await expect(page.locator('#lgm-list .lgm-missing')).toHaveCount(1);
    await expect(page.locator('#lgm-list .lgm-missing')).toContainText('Watchdog');
  });

  test('✕ で色付けを消せる', async ({ page }) => {
    await setup(page);
    await register(page);
    await openAfterParentChange(page, PARENT_V2);
    await page.locator('#lg-mark').click();
    await expect(page.locator('#overlay-layer rect.lg-mark').first()).toBeAttached();

    await page.locator('#btn-lgm-close').click();
    await expect(page.locator('#lg-mark-overlay')).toBeHidden();
    await expect(page.locator('#overlay-layer rect.lg-mark')).toHaveCount(0);
  });
});
