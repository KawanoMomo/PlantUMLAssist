// @ts-check
// BLK-junior-20260908-1203-wish: クラス図でも「🔀 対応表」から先輩の変更を
// 1 クリックで取り込めること。継承は向きを保ったまま入り、Relation フォームで
// From/To を選び直す (逆向きに張ってしまう) 場面が無くなる。
const { test, expect } = require('@playwright/test');
const { gotoApp, getEditorText, openCompareTabs } = require('../helpers');

// 先輩のクラス図。共通基底クラス DriverBase とそこからの継承が 2 本ある。
const SENIOR = [
  '@startuml',
  'abstract class DriverBase',
  'class GpioDrv',
  'class AdcDrv',
  'DriverBase <|-- GpioDrv',
  'DriverBase <|-- AdcDrv',
  '@enduml',
].join('\n');

// 自分のクラス図。DriverBase も継承も無い。
const MINE = [
  '@startuml',
  'class GpioDrv',
  'class AdcDrv',
  '@enduml',
].join('\n');

async function typeDsl(page, text) {
  await page.evaluate((t) => {
    const ed = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
    ed.value = t;
    ed.dispatchEvent(new Event('input'));
  }, text);
  await page.waitForTimeout(1500);
}

async function openMap(page, mine) {
  await gotoApp(page);
  await typeDsl(page, SENIOR);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(600);
  await typeDsl(page, mine == null ? MINE : mine);
  await openCompareTabs(page);
  await expect(page.locator('#compare-pane')).toBeVisible();
  await page.locator('#btn-map-run').click();
  await expect(page.locator('#map-list')).toBeVisible();
}

function refOnlyRow(page, type, text) {
  return page.locator('.map-row[data-map-match="ref-only"][data-map-type="' + type + '"]',
    { hasText: text }).first();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.clear(); } catch (e) {} });
});

test('クラス図でも対応表が出て、見出しがクラスと関係になる', async ({ page }) => {
  await openMap(page);
  await expect(page.locator('#map-list')).toContainText('クラス (参照図 / 自分の図)');
  await expect(page.locator('#map-list')).toContainText('関係 (参照図 / 自分の図)');
  // 先輩にしか無いのは DriverBase と継承 2 本。
  await expect(page.locator('.map-row[data-map-match="ref-only"] .map-take')).toHaveCount(3);
  await expect(page.locator('#map-summary')).toContainText('参照図だけ 3');
});

test('関係の行は矢印でなく親子で読める', async ({ page }) => {
  await openMap(page);
  await expect(refOnlyRow(page, 'relation', '子 GpioDrv'))
    .toContainText('継承: 親 DriverBase ← 子 GpioDrv');
});

test('先輩にしか無いクラスは 1 回押すだけで入る (種別も写る)', async ({ page }) => {
  await openMap(page);
  await refOnlyRow(page, 'class', 'DriverBase').locator('.map-take').click();
  await page.waitForTimeout(600);

  const dsl = await getEditorText(page);
  expect(dsl).toContain('abstract class DriverBase');
  expect(dsl.indexOf('abstract class DriverBase')).toBeLessThan(dsl.indexOf('@enduml'));
  await expect(page.locator('.map-row[data-map-match="ref-only"][data-map-type="class"]')).toHaveCount(0);
});

test('継承は向きを保って入る (親 <|-- 子。逆向きにならない)', async ({ page }) => {
  await openMap(page);
  await refOnlyRow(page, 'class', 'DriverBase').locator('.map-take').click();
  await page.waitForTimeout(600);
  await refOnlyRow(page, 'relation', '子 GpioDrv').locator('.map-take').click();
  await page.waitForTimeout(600);

  await expect(page.locator('#map-confirm')).toHaveCount(0);
  const dsl = await getEditorText(page);
  expect(dsl).toContain('DriverBase <|-- GpioDrv');
  expect(dsl).not.toContain('GpioDrv <|-- DriverBase');
});

test('クラスを足す前に継承を押すと、親をどれにするかだけ聞く', async ({ page }) => {
  await openMap(page);
  await refOnlyRow(page, 'relation', '子 GpioDrv').locator('.map-take').click();
  await expect(page.locator('#map-confirm')).toBeVisible();
  // 聞かれるのは対応の付かない親だけ。子 GpioDrv は自分の図にあるので聞かれない。
  await expect(page.locator('#map-confirm-from')).toBeVisible();
  await expect(page.locator('#map-confirm-to')).toHaveCount(0);
  await expect(page.locator('.map-confirm-row[data-side="from"]')).toContainText('親');
});

test('聞き返しで「新しく作る」を選ぶと、クラスと継承の両方が入る', async ({ page }) => {
  await openMap(page);
  await refOnlyRow(page, 'relation', '子 GpioDrv').locator('.map-take').click();
  await page.locator('#btn-map-confirm-ok').click();
  await page.waitForTimeout(600);

  const dsl = await getEditorText(page);
  expect(dsl).toContain('class DriverBase');
  expect(dsl).toContain('DriverBase <|-- GpioDrv');
});

test('3 回押すと先輩との差が無くなる', async ({ page }) => {
  await openMap(page);
  await refOnlyRow(page, 'class', 'DriverBase').locator('.map-take').click();
  await page.waitForTimeout(600);
  await refOnlyRow(page, 'relation', '子 GpioDrv').locator('.map-take').click();
  await page.waitForTimeout(600);
  await refOnlyRow(page, 'relation', '子 AdcDrv').locator('.map-take').click();
  await page.waitForTimeout(600);

  await expect(page.locator('#map-summary')).toContainText('片方だけ 0 件');
  const dsl = await getEditorText(page);
  expect(dsl).toContain('DriverBase <|-- GpioDrv');
  expect(dsl).toContain('DriverBase <|-- AdcDrv');
});

test('状態遷移図では今までどおり状態・遷移の対応表が出る', async ({ page }) => {
  const senior = '@startuml\n[*] --> Idle\nstate Idle\nstate Configured\nIdle --> Configured : configure\n@enduml';
  await gotoApp(page);
  await typeDsl(page, senior);
  await page.locator('#btn-tab-new').click();
  await page.waitForTimeout(600);
  await typeDsl(page, '@startuml\n[*] --> Idle\nstate Idle\n@enduml');
  await openCompareTabs(page);
  await page.locator('#btn-map-run').click();
  await expect(page.locator('#map-list')).toContainText('状態 (参照図 / 自分の図)');
  await expect(page.locator('#map-list')).toContainText('遷移 (参照図 / 自分の図)');
});
