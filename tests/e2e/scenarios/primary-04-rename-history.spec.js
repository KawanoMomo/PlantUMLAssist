// @ts-check
// primary 台本 手順 4 (c)④「共通の定義を !include の共通ファイルに分け、2 つ以上の図から参照する」。
//
// この spec にあった「改名の時系列」(いつ・どの図で・何件) の 7 本は、その道具を
// TICKET-owner-20261116-0621-prune で外したので一緒に外した (過去の置換の組は primary-02-bulk-rename と
// tests/scenarios/owner-20261116-0621.spec.js が守る)。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

const DIR = saveDirFor(__filename);

async function boot(page) {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-tools-folded', '0');
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page);
}

async function putFile(page, name, dsl) {
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl, dir: DIR });
}

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

// BLK-primary-20260929-1108: 台本 (c)④「共通の定義を !include の共通ファイルに分け、2 つ以上の図から参照する形で手順 4 を行う」。
// 保存先に common_defs.puml を置き、隣の 2 枚に `!include common_defs.puml` を書くと、どちらも「cannot include」で
// 描けなかった (本文は文字列で PlantUML に渡るので、server の作業フォルダを探していた)。
test.describe('primary 手順 4 (c)④: 共通定義を !include の共通ファイルに分けて 2 枚から参照する', () => {
  const fs = require('fs');
  const path = require('path');
  const ABS = path.resolve(__dirname, '..', '..', '..', DIR);
  const COMMON = 'skinparam monochrome true\nskinparam shadowing false\n';
  const withInclude = (who) => '@startuml\n!include common_defs.puml\nparticipant ' + who + '\nparticipant Hal\n' + who + ' -> Hal : init\n@enduml\n';

  test.beforeEach(async ({ page }) => {
    await boot(page);
    await clearDir(page);
    fs.mkdirSync(ABS, { recursive: true });
    fs.writeFileSync(path.join(ABS, 'common_defs.puml'), COMMON, 'utf8');
    await putFile(page, 'spi_init_sequence', withInclude('SpiDrv'));
    await putFile(page, 'can_init_sequence', withInclude('CanDrv'));
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForSelector('html[data-app-ready="1"]', { state: 'attached' });
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
    try { fs.rmSync(path.join(ABS, 'common_defs.puml'), { force: true }); } catch (e) {}
  });

  async function openSaved(page, part, name) {
    // 保存先の図は直下に並ぶ (部品のフォルダは TICKET-owner-20261116-0321-prune で外した)。
    const row = page.locator('#files-parts .files-part-file[data-file-name="' + name + '"]');
    await row.click();
    await expect(page.locator('#editor')).toHaveValue(new RegExp('participant ' + (part === 'spi' ? 'SpiDrv' : 'CanDrv')));
  }

  test('保存先の 2 枚が、同じフォルダの common_defs.puml を include して描ける (本文は書き換えない)', async ({ page }) => {
    for (const [part, name, who] of [['spi', 'spi_init_sequence', 'SpiDrv'], ['can', 'can_init_sequence', 'CanDrv']]) {
      await openSaved(page, part, name);
      await expect(page.locator('#preview-svg svg text', { hasText: who }).first()).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#render-error-overlay')).not.toContainText('cannot include');
      await expect(page.locator('#editor')).toHaveValue(/^@startuml\n!include common_defs\.puml\n/);
    }
    // 共通ファイルの定義 (monochrome) が効いている: 参加者の箱に色が付かない。
    const fills = await page.$$eval('#preview-svg svg rect', (els) => els.map((e) => (e.getAttribute('fill') || '').toUpperCase()));
    expect(fills.filter((f) => f === '#E2E2F0').length).toBe(0);
  });

  test('共通ファイルが無いと、帯が探したフォルダを言う', async ({ page }) => {
    fs.rmSync(path.join(ABS, 'common_defs.puml'), { force: true });
    // TICKET-releaser-20261116-0945-1: 帯は「直前の図の上に重ねる」もの。起動直後の最初の図がまだ描けていない
    // (プレビューが空の) うちに開くと、理由は帯ではなく図の場所そのものに出る (render-error の設計どおり)。
    // どちらに出るかが最初の描画との競争で揺れていたので、利用者と同じく起動した図が描けてから開く。
    await expect(page.locator('#preview-svg svg').first()).toBeVisible({ timeout: 15000 });
    await openSaved(page, 'spi', 'spi_init_sequence');
    const band = page.locator('#render-error-overlay');
    await expect(band).toContainText('cannot include common_defs.puml', { timeout: 15000 });
    await expect(band).toContainText('探したフォルダ:');
    await expect(band).toContainText(path.basename(ABS));
  });
});
