// @ts-check
// BLK-junior-20260908-0823
// 先輩(primary)の GPIO 状態遷移図と自分(junior)版を突き合わせる場面。
// 2 枚は電気的な出力状態 / ドライバの生死という別の抽象度で描かれていて、
// 状態名も遷移名も 1 つも一致しない。これまでは全要素が「相手にしかない」に落ち、
// どれが「先輩が後から足した差分」なのか名前だけでは選べなかった。
// 対応が無いことを言い切り、形 (種別ごとの件数) の見比べに切り替わることを見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

const SELF_DIR = saveDirFor(__filename) + '/junior';
const REF_DIR = saveDirFor(__filename) + '/primary';
const NAME = 'GPIOドライバ状態遷移';

// 先輩版: 電気的な出力状態で描いてある
const REF_DSL = [
  '@startuml',
  'title GPIO 状態遷移',
  '[*] --> Idle',
  'state Idle',
  'state Configured',
  'state Driving_High',
  'state Driving_Low',
  'state Fault',
  'Idle --> Configured : Gpio_SetPinDirection',
  'Configured --> Driving_High : Gpio_WriteChannel(HIGH)',
  'Configured --> Driving_Low : Gpio_WriteChannel(LOW)',
  'Driving_High --> Fault : OverCurrent',
  'Fault --> Idle : Gpio_Init',
  '@enduml',
].join('\n');

// 自分版: ドライバの生死 + 選択擬似状態
const SELF_DSL = [
  '@startuml',
  'title GPIO ドライバ状態遷移 (レビュー反映)',
  '[*] --> Uninit',
  'state Uninit',
  'state Ready',
  'state Busy',
  'state Error',
  'state AnomalyCheck <<choice>>',
  'Uninit --> Ready : init',
  'Ready --> Busy : request',
  'Busy --> AnomalyCheck : done',
  'AnomalyCheck --> Ready : [ok]',
  'AnomalyCheck --> Error : [ng]',
  '@enduml',
].join('\n');

// 先輩版と同じ土俵で描いた自分版 (対応が付くほうの確かめに使う)
const ALIGNED_DSL = REF_DSL.replace('Fault --> Idle : Gpio_Init', 'Fault --> Idle : Gpio_Reset');

async function seedRefFolder(page) {
  await page.evaluate(([dir, name, dsl]) => {
    return fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: name, dsl: dsl, dir: dir }),
    }).then((r) => r.ok);
  }, [REF_DIR, NAME, REF_DSL]);
}

async function setup(page, selfDsl) {
  await gotoApp(page);
  await page.evaluate(([dir, name]) => {
    window.MA.autoSave.setConfig({
      enabled: true, debounceMs: 500, restoreMode: 'none',
      backend: 'file', fileDir: dir,
    });
    window.MA.workspace.rename(window.MA.workspace.getActiveId(), name);
  }, [SELF_DIR, NAME]);
  await page.locator('#editor').fill(selfDsl);
  await page.waitForTimeout(900);
  await seedRefFolder(page);
  await page.locator('#btn-tab-compare').click();
  await page.waitForTimeout(400);
  await page.locator('#xf-dir').fill(REF_DIR);
  await page.locator('#btn-xf-load').click();
  // 相手の図を読むのは非同期なので、相手が選ばれるまで待つ
  // (#xf-summary は読み込み中の短い知らせでも見える)。
  await expect(page.locator('#xf-pick')).toBeVisible();
  await expect(page.locator('#xf-file')).toHaveValue(NAME);
  await expect(page.locator('#xf-summary')).toBeVisible();
}

test.describe('抽象度の違う 2 枚の見比べ (BLK-junior-0823)', () => {

  test('対応が 1 つも無いことを言い切り、「相手にしかない N 件」とは言わない', async ({ page }) => {
    await setup(page, SELF_DSL);
    const sum = page.locator('#xf-summary');
    await expect(sum).toContainText('対応する要素が 1 つもありません');
    await expect(sum).toContainText('別の粒度');
    await expect(sum).not.toContainText('相手にしかない');
  });

  test('形の見比べが出て、何を先に決めるかが書いてある', async ({ page }) => {
    await setup(page, SELF_DSL);
    await expect(page.locator('#xf-shape')).toBeVisible();
    await expect(page.locator('#xf-shape-lead')).toContainText('名前では対応が付かない');
    await expect(page.locator('#xf-shape-lead')).toContainText('粒度');
    await expect(page.locator('#xf-shape-sum')).not.toBeEmpty();
  });

  test('形の表に、自分と相手の件数が種別ごとに並ぶ', async ({ page }) => {
    await setup(page, SELF_DSL);
    const rows = page.locator('#xf-shape-table .xf-shape-row');
    await expect(rows).toHaveCount(3);
    // 擬似状態は自分 2 / 相手 1 (名前が違っても数は比べられる)
    const pseudo = page.locator('#xf-shape-table .xf-shape-row[data-kind="pseudo"]');
    await expect(pseudo).toHaveCount(1);
    await expect(pseudo).toContainText('2');
    await expect(pseudo).toContainText('1');
  });

  test('件数が違う種別には印が付く', async ({ page }) => {
    await setup(page, SELF_DSL);
    // 擬似状態は自分 2 / 相手 1 で違うので印が付く
    await expect(page.locator('#xf-shape-table .xf-shape-row.differs')).toHaveCount(1);
  });

  test('名前で対応が付く 2 枚なら、形の見比べは出ず従来どおり差分が並ぶ', async ({ page }) => {
    await setup(page, ALIGNED_DSL);
    await expect(page.locator('#xf-shape')).toBeHidden();
    await expect(page.locator('#xf-summary')).toContainText('相手にしかない');
    await expect(page.locator('#xf-list .xf-row.only-ref')).toHaveCount(1);
  });
});
