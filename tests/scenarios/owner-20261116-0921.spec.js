// @ts-check
// TICKET-owner-20261116-0921-prune: 編集画面の補助 (エディタペインの「構造 / Outline」・状態遷移図の「入れ子ツリー / Hierarchy」帯・
// ⚙ 設定の「UML 要素の網羅一覧」タブ・コンポーネント図の無選択右ペインの「要素名をまとめて付け替え」表と依存チェック) を外した後も、
// (1) 前に網羅一覧のタブを開いていた設定 (`plantuml-settings-tab` = coverage) でも ⚙ 設定は既定のタブで開き、網羅一覧は無い。
// (2) 入れ子の状態遷移図を保存先から開くとエラー 0 で全体が描け、入れ子ツリーの帯は無く、状態遷移表は出る。無変更の保存はバイト一致。
// (3) コンポーネント図の無選択右ペインは「末尾に追加」だけで、付け替え表・依存チェックが無い。エディタペインに構造タブは無い。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./_helpers');
const S = require('../e2e/scenarios/_scenario');

const STATE = ['@startuml', 'state Uninit', 'state Configured {', '  state Counting', '  state Paused',
  '  Counting --> Paused : Timer_Pause', '}', '[*] --> Uninit', 'Uninit --> Configured : Timer_Init', '@enduml', ''].join('\n');
const COMP = ['@startuml', 'component WebApp', 'interface IAuth', 'WebApp -() IAuth', '@enduml', ''].join('\n');
const GONE = ['構造 / Outline', '入れ子ツリー', 'Hierarchy', 'UML 要素の網羅一覧', 'まとめて付け替え', '依存チェック'];

test('owner 0921 外した補助の無い画面で、入れ子の図とコンポーネント図を開いて描け、設定は既定のタブで開く', async ({ page }, testInfo) => {
  test.setTimeout(90 * 1000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  const dir = S.absDirFor(__filename);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const statePath = path.join(dir, 'timer_state.puml');
  fs.writeFileSync(statePath, STATE, 'utf8');
  fs.writeFileSync(path.join(dir, 'gpio_component.puml'), COMP, 'utf8');

  await H.bootWithSaveDir(page, S.dirFor(__filename));
  // 外したタブを覚えていた設定。
  await page.evaluate(() => { localStorage.setItem('plantuml-settings-tab', 'coverage'); });

  // (1) ⚙ 設定は既定のタブで開き、網羅一覧のタブもペインも無い。
  await page.locator('#rail-config').click();
  await expect(page.locator('#cfg-modal')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('settings.png') });
  await expect(page.locator('#cfg-tabs .cfg-tab')).toHaveCount(6);
  await expect(page.locator('#cfg-tab-coverage')).toHaveCount(0);
  await expect(page.locator('#cfg-pane-coverage')).toHaveCount(0);
  await expect(page.locator('#cfg-tab-autosave')).toHaveClass(/active/);
  await page.keyboard.press('Escape');
  if (await page.locator('#cfg-modal').isVisible()) await page.locator('#cfg-cancel').click();
  await expect(page.locator('#cfg-modal')).toBeHidden();

  // (2) 入れ子の状態遷移図。帯は無く、表は出る。全体が描け、無変更の保存でバイト一致。
  await S.openFolderItem(page, 'timer_state', { pin: true });
  await S.closeFolderList(page);
  await expect(page.locator('#preview-svg svg')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#state-tree-panel')).toHaveCount(0);
  await expect(page.locator('#state-table-panel')).toBeVisible();
  const svgText = await page.locator('#preview-svg').innerText();
  for (const w of ['Uninit', 'Counting', 'Paused']) expect(svgText).toContain(w);
  await page.screenshot({ path: testInfo.outputPath('state.png') });
  await page.locator('#editor').click();
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(1200);
  expect(fs.readFileSync(statePath, 'utf8')).toBe(STATE);

  // (3) コンポーネント図の無選択右ペイン。エディタペインは DSL だけ。
  await S.openFolderItem(page, 'gpio_component', { pin: true });
  await S.closeFolderList(page);
  await expect(page.locator('#preview-svg svg')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#co-tail-kind')).toBeVisible();
  for (const sel of ['#co-rename-list', '#co-rename-apply', '#co-deps-summary', '#btn-editor-tab-outline', '#outline-pane']) {
    await expect(page.locator(sel), sel).toHaveCount(0);
  }
  await page.screenshot({ path: testInfo.outputPath('component.png') });

  const bodyText = await page.locator('body').innerText();
  for (const w of GONE) expect(bodyText, w).not.toContain(w);
  await H.expectRendered(page);
  H.annotate(testInfo, 'diffLines', 0);
  expect(errors, errors.join('\n')).toEqual([]);
  fs.rmSync(dir, { recursive: true, force: true });
});
