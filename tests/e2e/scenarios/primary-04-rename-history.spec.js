// @ts-check
// primary 台本 手順 4「置換前後をレビューで見せる / 過去の図に旧称が残っていないか確かめる」。
//
// BLK-primary-20260908-2103-wish: ⇄ 一括置換の影響プレビューは「今」のヒット数しか
// 出さないので、0 件が「置換済みだから 0」なのか「元から無いから 0」なのか分からず、
// 旧称の残りを確かめるには図を 1 枚ずつ開いて中身を読むしかなかった。改名履歴が
// 「いつ・どの図で・何件」を答え、開く図をその名前が挙がった枚数に絞れることを見る。
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

const DIR = saveDirFor(__filename);
const SPI = '@startuml\ntitle SPI 初期化\nparticipant SpiDrv\nparticipant Hal\nSpiDrv -> Hal : init\n@enduml';
const SPI_STATE = '@startuml\n[*] --> Idle\nIdle --> Busy : SpiDrv.start\n@enduml';
const ADC = '@startuml\ntitle ADC 初期化\nparticipant AdcDrv\nparticipant Hal\nAdcDrv -> Hal : init\n@enduml';
// BLK-primary-20260909-0103-wish: 同じ綴りが「クラスのメソッド宣言・継承の端点」
// 「状態遷移のイベント名」「シーケンスの participant」として現れる一式。
// 文字列のヒット数ではこの 3 つが混ざるので、役割で分かれることを見る材料にする。
const CLASS = '@startuml\nclass SpiDrv {\n  +SpiDrv_Start() : void\n}\nDriverBase <|-- SpiDrv\n@enduml';

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

async function openRename(page) {
  await page.locator('#btn-tab-rename').click();
  await page.waitForSelector('#rename-panel.open #rename-history-summary');
}

async function closeRename(page) {
  await page.locator('#btn-rename-cancel').click();
  await page.waitForSelector('#rename-panel.open', { state: 'detached' }).catch(() => {});
}

// 置換を 1 回通す。開いていない図 (保存フォルダのみ) にも当てる。
async function doRename(page, from, to) {
  await openRename(page);
  await page.fill('#rename-from', from);
  await page.fill('#rename-to', to);
  await page.waitForFunction(() => {
    const b = document.getElementById('btn-rename-apply');
    return !!b && !b.disabled;
  });
  await page.locator('#btn-rename-apply').click();
  await page.waitForSelector('#rename-summary[data-applied]');
  await closeRename(page);
}

test.describe('primary 手順 4: 旧称が残っていないかを確かめる', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page);
    await clearDir(page);
    await putFile(page, 'spi_init_sequence', SPI);
    await putFile(page, 'spi_state', SPI_STATE);
    await putFile(page, 'adc_init_sequence', ADC);
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForSelector('#preview-svg');
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
  });

  test('置換をする前は「記録はまだありません」と出る（黙らない）', async ({ page }) => {
    await openRename(page);
    await expect(page.locator('#rename-history-summary')).toContainText('まだありません');
    await expect(page.locator('#rename-history-summary')).toHaveAttribute('data-rh-entries', '0');
  });

  test('置換すると いつ・どの図で・何件 が履歴に残る', async ({ page }) => {
    await doRename(page, 'SpiDrv', 'Spi_Driver');
    await openRename(page);
    await expect(page.locator('#rename-history-summary')).toHaveAttribute('data-rh-entries', '1');
    const entry = page.locator('.rh-entry[data-rh-from="SpiDrv"][data-rh-to="Spi_Driver"]');
    await expect(entry).toHaveCount(1);
    await expect(entry.locator('.rh-line')).toContainText('SpiDrv → Spi_Driver');
    // 当たった 2 枚だけが名前として挙がる。当たっていない adc は出さない。
    await expect(entry.locator('button.rh-doc')).toHaveCount(2);
    await expect(entry.locator('button.rh-doc[data-rh-doc="adc_init_sequence"]')).toHaveCount(0);
  });

  test('旧称で引くと「何回・何枚・何件」が出る（置換済みだと分かる）', async ({ page }) => {
    await doRename(page, 'SpiDrv', 'Spi_Driver');
    await openRename(page);
    await page.fill('#rename-from', 'SpiDrv');
    const sum = page.locator('#rename-history-summary');
    await expect(sum).toHaveAttribute('data-rh-entries', '1');
    await expect(sum).toHaveAttribute('data-rh-docs', '2');
    await expect(sum).toContainText('1 回・2 枚');
    await expect(sum).toHaveClass(/rh-found/);
  });

  test('新称で引いても同じ改名に当たる', async ({ page }) => {
    await doRename(page, 'SpiDrv', 'Spi_Driver');
    await openRename(page);
    await page.fill('#rename-from', 'Spi_Driver');
    await expect(page.locator('#rename-history-summary')).toHaveAttribute('data-rh-entries', '1');
  });

  test('置換していない名前は「置換されていません」と言い切る', async ({ page }) => {
    await doRename(page, 'SpiDrv', 'Spi_Driver');
    await openRename(page);
    await page.fill('#rename-from', 'CanDrv');
    const sum = page.locator('#rename-history-summary');
    await expect(sum).toContainText('置換されていません');
    await expect(sum).toHaveClass(/rh-none/);
  });

  test('履歴の図名を押すとその図が開く（開くのは名前が挙がった枚数だけ）', async ({ page }) => {
    await doRename(page, 'SpiDrv', 'Spi_Driver');
    await openRename(page);
    await page.fill('#rename-from', 'SpiDrv');
    await page.locator('button.rh-doc[data-rh-doc="spi_state"]').click();
    await page.waitForTimeout(700);
    const name = await page.evaluate(() => {
      const doc = window.MA.workspace.getActive();
      return doc ? doc.name : '';
    });
    expect(name).toContain('spi_state');
  });

  test('2 回目の改名は新しいものが先頭に積まれる', async ({ page }) => {
    await doRename(page, 'SpiDrv', 'Spi_Driver');
    await doRename(page, 'AdcDrv', 'Adc_Driver');
    await openRename(page);
    await expect(page.locator('#rename-history-summary')).toHaveAttribute('data-rh-entries', '2');
    const first = page.locator('#rename-history-rows .rh-entry').first();
    await expect(first).toHaveAttribute('data-rh-from', 'AdcDrv');
  });
});

async function resetRegistry(page) {
  await page.evaluate(async (d) => {
    await fetch('/name-registry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir: d, entries: [] }),
    });
  }, DIR);
}

// BLK-primary-20260913-0206-wish: 手順 4 の場面「顧客向け資料に図を組み込む」。
// 社内略語 (SpiDrv / IRQCtrl / DmaCtrl) の洗い出し → 個別に一括置換 → SVG を
// 1 枚ずつ目視、の 3 工程だったものを、対応表 1 枚に寄せる。BLK-owner-20260917-2329-prune で
// 表は 📤 提出前チェックから 🔤 表記統一 (登録簿) へ移った。確定した組は登録簿に入る。
// 表を確定すると全図に当たり、当てたあとの残存件数を表が言い切る。
const GL_SPI = '@startuml\ntitle SPI 初期化\nparticipant SpiDrv\nparticipant IRQCtrl\nSpiDrv -> IRQCtrl : enable\n@enduml';
const GL_DMA = '@startuml\ntitle DMA 初期化\nparticipant DmaCtrl\nparticipant SpiDrv\nDmaCtrl -> SpiDrv : ready\n@enduml';
const GL_CLASS = '@startuml\nclass Spi_Driver\nclass Hal\nSpi_Driver --> Hal\n@enduml';

const FILES = [
  ['spi_init_sequence', GL_SPI],
  ['dma_init_sequence', GL_DMA],
  ['driver_common_class', GL_CLASS],
];


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
    const head = page.locator('#files-parts .files-part-head[data-part="' + part + '"]');
    const row = page.locator('#files-parts .files-part-file[data-file-name="' + name + '"]');
    if (!(await row.isVisible())) await head.click();
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
    await openSaved(page, 'spi', 'spi_init_sequence');
    const band = page.locator('#render-error-overlay');
    await expect(band).toContainText('cannot include common_defs.puml', { timeout: 15000 });
    await expect(band).toContainText('探したフォルダ:');
    await expect(band).toContainText(path.basename(ABS));
  });
});
