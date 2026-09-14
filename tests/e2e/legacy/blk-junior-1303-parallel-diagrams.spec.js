// @ts-check
// BLK-junior-20260908-1303: 同じ台本から起こした 2 枚 (UART 版と、後で作った CAN 版) の見比べ。
// start → 4 アクション → if の並びまで完全に同じで、違うのはドメインの語だけ。
// これまでは語の違う 2 箇所が「相手だけ / 自分だけ」に落ち、
// 「後で作った方にだけある要素を 1 つ選ぶ」手順が成立しなかった。
// 片方にだけある要素は無いと言い切り、語の対応表に切り替わることを見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

const SELF_DIR = saveDirFor(__filename) + '/self';
const REF_DIR = saveDirFor(__filename) + '/ref';
const NAME = 'CAN初期化';
const REF_NAME = 'CAN初期化';

const REF_DSL = [
  '@startuml',
  'start',
  ':UARTクロック有効化;',
  ':ボーレート設定;',
  ':割り込み設定;',
  ':送受信有効化;',
  'if (初期化失敗?) then (異常)',
  'else (正常)',
  'endif',
  'stop',
  '@enduml',
].join('\n');

const SELF_DSL = [
  '@startuml',
  'start',
  ':CANクロック有効化;',
  ':ビットレート設定;',
  ':割り込み設定;',
  ':送受信有効化;',
  'if (初期化失敗?) then (異常)',
  'else (正常)',
  'endif',
  'stop',
  '@enduml',
].join('\n');

// 相手が 1 行だけ直した図 (言い換えではない。取り込む対象がある)
const REF_ONE_FIX = SELF_DSL.replace(':送受信有効化;', ':送受信有効化 (割り込み許可後);');

async function seedRefFolder(page, dsl) {
  await page.evaluate(([dir, name, text]) => {
    return fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: name, dsl: text, dir: dir }),
    }).then((r) => r.ok);
  }, [REF_DIR, REF_NAME, dsl]);
}

async function setup(page, refDsl) {
  await gotoApp(page);
  await page.evaluate(([dir, name]) => {
    window.MA.autoSave.setConfig({
      enabled: true, debounceMs: 500, restoreMode: 'none',
      backend: 'file', fileDir: dir,
    });
    window.MA.workspace.rename(window.MA.workspace.getActiveId(), name);
  }, [SELF_DIR, NAME]);
  await page.locator('#editor').fill(SELF_DSL);
  await page.waitForTimeout(900);
  await seedRefFolder(page, refDsl);
  await page.locator('#btn-tab-compare').click();
  await page.waitForTimeout(400);
  await page.locator('#xf-dir').fill(REF_DIR);
  await page.locator('#btn-xf-load').click();
  await expect(page.locator('#xf-pick')).toBeVisible();
  await expect(page.locator('#xf-file')).toHaveValue(REF_NAME);
  await expect(page.locator('#xf-summary')).toBeVisible();
}

test.describe('骨格が同じで語だけ違う 2 枚 (BLK-junior-1303)', () => {

  test('「片方にだけある要素はない」と言い切る', async ({ page }) => {
    await setup(page, REF_DSL);
    const sum = page.locator('#xf-summary');
    await expect(sum).toContainText('骨格は同じで、語だけが違います');
    await expect(sum).toContainText('片方にだけある要素はありません');
    await expect(sum).not.toContainText('相手にしかない');
  });

  test('語の対応表が位置ごとに並び、違う語に印が付く', async ({ page }) => {
    await setup(page, REF_DSL);
    await expect(page.locator('#xf-parallel')).toBeVisible();
    await expect(page.locator('#xf-parallel-lead')).toContainText('位置ごとに一致');
    const rows = page.locator('#xf-parallel-table .xf-parallel-row');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText('CANクロック有効化');
    await expect(rows.nth(0)).toContainText('UARTクロック有効化');
    await expect(page.locator('#xf-parallel-table .xf-parallel-row.differs')).toHaveCount(2);
  });

  test('取り込む行の一覧は出さない (言い換えを足しても図が二重になるだけ)', async ({ page }) => {
    await setup(page, REF_DSL);
    await expect(page.locator('#xf-list')).toBeHidden();
    await expect(page.locator('#xf-shape')).toBeHidden();
  });

  test('対応表はそのままコピーできる', async ({ page }) => {
    await setup(page, REF_DSL);
    const copy = page.locator('#btn-xf-parallel-copy');
    await expect(copy).toBeVisible();
    await copy.click();
    await expect(copy).toHaveText('コピーしました');
  });

  test('相手が 1 行だけ直した図なら、従来どおり取り込む行が並ぶ', async ({ page }) => {
    await setup(page, REF_ONE_FIX);
    await expect(page.locator('#xf-parallel')).toBeHidden();
    await expect(page.locator('#xf-summary')).toContainText('相手にしかない');
    await expect(page.locator('#xf-list .xf-row.only-ref')).toHaveCount(1);
  });
});
