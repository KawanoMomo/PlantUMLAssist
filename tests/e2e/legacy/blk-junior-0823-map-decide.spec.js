// @ts-check
// BLK-junior-20260908-0823 (差し戻し 1 回目)
// 抽象度の違う 2 枚では、名前の形だけで組んだ対応が当たらない。部分一致の行に
// 意味の対応が無いものが混ざるので、「参照図だけ」の行が本当に先輩の足した要素
// なのか、対応を取り損ねただけなのかを読む側で判別できない。
// 1 組ずつ「同じもの」「対応なし」と決めていけば推測が減り、0 件になった時点で
// 「参照図にあって自分の図に無い要素は N 件」と言い切れることを見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor, openCompareTabs } = require('../helpers');

// 起票そのままの 2 枚。先輩は電気的な出力状態、自分は生死 + 選択擬似状態。
const SENIOR = [
  '@startuml',
  '[*] --> Idle',
  'state Idle',
  'state Configured',
  'state Driving_High',
  'state Fault',
  'Idle --> Configured : Gpio_SetPinDirection',
  'Configured --> Driving_High : Gpio_WriteChannel(HIGH)',
  'Driving_High --> Fault : OverCurrent',
  '@enduml',
].join('\n');

const MINE = [
  '@startuml',
  '[*] --> Uninit',
  'state Uninit',
  'state Busy',
  'state Error',
  'Uninit --> Busy : init',
  'Busy --> Error : fail',
  '@enduml',
].join('\n');

const DIR = saveDirFor(__filename);

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(1200);
}

async function openMap(page) {
  await gotoApp(page);
  await typeDsl(page, SENIOR);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(600);
  await typeDsl(page, MINE);
  await openCompareTabs(page);
  await expect(page.locator('#compare-pane')).toBeVisible();
  await page.locator('#btn-map-run').click();
  await expect(page.locator('#map-list')).toBeVisible();
}

// 推測の行を上から 1 つずつ決め切る。組になっている行は「同じもの」、
// 片方だけの行は「対応なし」。人がやる手順をそのままなぞる。
async function decideAll(page) {
  for (let i = 0; i < 40; i++) {
    const same = page.locator('.map-row:not([data-map-decided]) .map-decide', { hasText: '同じもの' }).first();
    if (await same.count()) { await same.click(); continue; }
    const none = page.locator('.map-row:not([data-map-decided]) .map-decide', { hasText: '対応なし' }).first();
    if (await none.count()) { await none.click(); continue; }
    break;
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
});

test('決める前は推測が残っていると言い、言い切らない', async ({ page }) => {
  await openMap(page);
  const dec = page.locator('#map-decision');
  await expect(dec).toBeVisible();
  await expect(page.locator('#map-decision-text')).toContainText('機械の推測が');
  await expect(dec).not.toHaveClass(/settled/);
  // やり直すものがまだ無いので、やり直しは出さない。
  await expect(page.locator('#btn-map-reset')).toBeHidden();
});

test('「同じもの」を押した行は手で対応になり、推測が 1 件減る', async ({ page }) => {
  await openMap(page);
  const before = await page.locator('#map-decision-text').textContent();
  await page.locator('.map-row .map-decide', { hasText: '同じもの' }).first().click();
  await expect(page.locator('.map-row[data-map-match="manual"]').first()).toBeVisible();
  await expect(page.locator('.map-row[data-map-match="manual"] .map-match').first()).toHaveText('手で対応');
  const after = await page.locator('#map-decision-text').textContent();
  expect(after).not.toBe(before);
  await expect(page.locator('#btn-map-reset')).toBeVisible();
});

test('「対応なし」を押した行は参照図だけとして確定する', async ({ page }) => {
  await openMap(page);
  const row = page.locator('.map-row[data-map-match="ref-only"]:not([data-map-decided])').first();
  await row.locator('.map-decide', { hasText: '対応なし' }).click();
  await expect(page.locator('.map-row[data-map-match="ref-only"][data-map-decided="1"]').first()).toBeVisible();
});

test('決めを「戻す」と機械の推測に返る', async ({ page }) => {
  await openMap(page);
  await page.locator('.map-row .map-decide', { hasText: '同じもの' }).first().click();
  await expect(page.locator('.map-row[data-map-match="manual"]')).toHaveCount(1);
  await page.locator('.map-row[data-map-decided="1"] .map-decide', { hasText: '戻す' }).first().click();
  await expect(page.locator('.map-row[data-map-match="manual"]')).toHaveCount(0);
});

test('全部決め切ると「参照図にあって自分の図に無い要素は N 件」と言い切る', async ({ page }) => {
  await openMap(page);
  await decideAll(page);
  await expect(page.locator('#map-decision')).toHaveClass(/settled/);
  await expect(page.locator('#map-decision-text')).toContainText('対応は全部決まりました');
  await expect(page.locator('#map-decision-text')).toContainText('自分の図に無い要素は');
  // 決め切ったので抽象度の警告も消える。
  await expect(page.locator('#map-warn')).toBeHidden();
  // 言い切った行はそのまま取り込める。
  await expect(page.locator('.map-row[data-map-match="ref-only"] .map-take').first()).toBeVisible();
});

test('決めた対応は対応表を作り直しても残る', async ({ page }) => {
  await openMap(page);
  await page.locator('.map-row .map-decide', { hasText: '同じもの' }).first().click();
  await expect(page.locator('.map-row[data-map-match="manual"]')).toHaveCount(1);
  await page.locator('#btn-map-run').click();
  await expect(page.locator('.map-row[data-map-match="manual"]')).toHaveCount(1);
  // やり直せば機械の推測だけに戻る。
  await page.locator('#btn-map-reset').click();
  await expect(page.locator('.map-row[data-map-match="manual"]')).toHaveCount(0);
});

test('決め切った先輩だけの要素は 1 回押すだけで自分の図に入る', async ({ page }) => {
  await openMap(page);
  await decideAll(page);
  const take = page.locator('.map-row[data-map-match="ref-only"][data-map-type="state"] .map-take').first();
  await take.click();
  await page.waitForTimeout(1200);
  const text = await page.evaluate(() =>
    /** @type {HTMLTextAreaElement} */ (document.getElementById('editor')).value);
  expect(text.split('\n').length).toBeGreaterThan(MINE.split('\n').length);
});
