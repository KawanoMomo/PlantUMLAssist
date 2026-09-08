// @ts-check
// BLK-junior-20260908-1603-wish
// 「この図はどの図の後継か」を画面が覚えていないので、毎周 先輩(primary)の同種図を
// 探して開いて記憶と見比べていた。継承元を 1 回登録すれば、次に開いたときに
// 「継承元が更新されています (差分 N 行)」と自動で言い、1 クリックで継承元に飛べる。
const { test, expect } = require('@playwright/test');
const { gotoApp } = require('../helpers');

const SELF_DIR = './test-results/autosave/blk-junior-1603-wish-lineage/self';
const REF_DIR = './test-results/autosave/blk-junior-1603-wish-lineage/primary';
const CHILD = 'GPIOドライバ初期化アクティビティ_先輩反映';
const PARENT = 'GPIOドライバ初期化アクティビティ_primary';

const PARENT_V1 = [
  '@startuml',
  'title GPIOドライバ初期化アクティビティ',
  'start',
  ':ポート設定を読む;',
  ':GPIO を初期化;',
  'stop',
  '@enduml',
].join('\n');

// 先輩が 1 行足した版。
const PARENT_V2 = [
  '@startuml',
  'title GPIOドライバ初期化アクティビティ',
  'start',
  ':ポート設定を読む;',
  ':クロックを有効化;',
  ':GPIO を初期化;',
  'stop',
  '@enduml',
].join('\n');

const CHILD_DSL = [
  '@startuml',
  'title GPIOドライバ初期化アクティビティ',
  'start',
  ':ポート設定を読む;',
  ':GPIO を初期化;',
  ':自分のメモを足した;',
  'stop',
  '@enduml',
].join('\n');

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
  await page.waitForTimeout(700);
  await seed(page, REF_DIR, PARENT, PARENT_V1);
}

// 継承元を 1 回登録する (これが「1 回だけの登録」)。
async function register(page) {
  await page.locator('#btn-tab-lineage').click();
  await expect(page.locator('#lg-modal')).toBeVisible();
  await page.locator('#lg-dir').fill(REF_DIR);
  await page.locator('#lg-dir').dispatchEvent('change');
  await page.waitForTimeout(400);
  await page.locator('#lg-parent').selectOption(PARENT);
  await page.locator('#lg-set').click();
  await page.waitForTimeout(400);
}

test.describe('BLK-junior-20260908-1603-wish: 図の継承元', () => {
  test('継承元を登録した直後は「取り込み済み」で、見比べる必要がないと言う', async ({ page }) => {
    await setup(page);
    await register(page);
    await expect(page.locator('#lg-summary')).toContainText('取り込み済み');
    await expect(page.locator('#lg-nochange')).toBeVisible();
    await page.locator('#lg-close').click();
    await expect(page.locator('#btn-tab-lineage')).toContainText('継承元 ✓');
  });

  test('先輩が継承元を直すと、開いた時点で差分の行数を言う', async ({ page }) => {
    await setup(page);
    await register(page);
    await page.locator('#lg-close').click();

    // 先輩が 1 行足す
    await seed(page, REF_DIR, PARENT, PARENT_V2);
    await page.evaluate(() => window.renderLineageBadge && window.renderLineageBadge());
    await page.waitForTimeout(500);
    await expect(page.locator('#btn-tab-lineage')).toContainText('+1 -0');

    await page.locator('#btn-tab-lineage').click();
    await expect(page.locator('#lg-summary')).toContainText('継承元 ' + PARENT + ' が更新されています');
    await expect(page.locator('#lg-summary')).toContainText('差分 1 行');
    await expect(page.locator('#lg-diff')).toContainText(':クロックを有効化;');
  });

  test('「継承元を開く」1 クリックで継承元がタブに出る', async ({ page }) => {
    await setup(page);
    await register(page);
    await page.locator('#lg-open').click();
    await page.waitForTimeout(700);
    await expect(page.locator('#lg-modal')).toBeHidden();
    const active = await page.evaluate(() => window.MA.workspace.getActive().name);
    expect(active).toBe(PARENT);
    await expect(page.locator('#editor')).toHaveValue(/ポート設定を読む/);
  });

  test('取り込み済みにすると基準が進み、次からは更新なしになる', async ({ page }) => {
    await setup(page);
    await register(page);
    await page.locator('#lg-close').click();
    await seed(page, REF_DIR, PARENT, PARENT_V2);
    await page.locator('#btn-tab-lineage').click();
    await expect(page.locator('#lg-summary')).toContainText('更新されています');

    await page.locator('#lg-adopt').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#lg-summary')).toContainText('取り込み済み');
    await expect(page.locator('#btn-tab-lineage')).toContainText('継承元 ✓');
  });

  test('継承元は図ごとに覚え、リロードしても残る', async ({ page }) => {
    await setup(page);
    await register(page);
    await page.locator('#lg-close').click();
    await seed(page, REF_DIR, PARENT, PARENT_V2);

    await page.reload();
    await page.waitForSelector('#preview-svg');
    await page.waitForTimeout(700);
    // 次の日に同じ図を開き直した場面。開いた時点でボタンが更新を言う。
    await page.evaluate(([dir, name]) => {
      window.MA.autoSave.setConfig({
        enabled: true, debounceMs: 500, restoreMode: 'none',
        backend: 'file', fileDir: dir,
      });
      window.MA.workspace.rename(window.MA.workspace.getActiveId(), name);
      window.applyActiveDoc();
    }, [SELF_DIR, CHILD]);
    await page.waitForTimeout(700);
    await expect(page.locator('#btn-tab-lineage')).toContainText('+1 -0');
  });

  test('未登録の図では、そう言う。外せば未登録に戻る', async ({ page }) => {
    await setup(page);
    await page.locator('#btn-tab-lineage').click();
    await expect(page.locator('#lg-empty')).toContainText('まだ継承元がありません');
    await page.locator('#lg-close').click();

    await register(page);
    await expect(page.locator('#lg-summary')).toContainText('取り込み済み');
    await page.locator('#lg-clear').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#lg-summary')).toContainText('未登録');
    await expect(page.locator('#btn-tab-lineage')).toContainText('継承元 −');
  });
});
