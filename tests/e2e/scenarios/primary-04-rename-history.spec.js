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

// BLK-primary-20260909-0103-wish: 改名履歴と影響プレビューは「文字列としての
// ヒット数」しか出さず、その名前がどの図の何 (状態遷移のイベント名 / クラスの
// メソッド宣言 / シーケンスの participant) に効くかは種類別に出ない。
// 置換後に開いて確かめる図を、意味的な参照の一覧から先に絞り込めることを見る。
test.describe('primary 手順 4: 意味的な参照で確かめる図を絞る', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page);
    await clearDir(page);
    await putFile(page, 'spi_init_sequence', SPI);
    await putFile(page, 'spi_state', SPI_STATE);
    await putFile(page, 'driver_common_class', CLASS);
    await putFile(page, 'adc_init_sequence', ADC);
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForSelector('#preview-svg');
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
  });

  test('部品名を入れると、役割ごとに参照元の図が並ぶ', async ({ page }) => {
    await openRename(page);
    await page.fill('#rename-from', 'SpiDrv');
    // 保存フォルダの読み込みは非同期。開いていない図まで数え終わるのを待つ。
    const head = page.locator('#rename-semantic-head');
    await expect(head).toBeVisible();
    await expect(head).toHaveAttribute('data-sr-docs', '3');
    // participant 宣言・呼び出しの相手・遷移イベント・継承の端点・メソッド宣言
    await expect(page.locator('#rename-semantic-rows .sr-role[data-sr-role="decl"]')).toHaveCount(1);
    await expect(page.locator('#rename-semantic-rows .sr-role[data-sr-role="event"]')).toHaveCount(1);
    await expect(page.locator('#rename-semantic-rows .sr-role[data-sr-role="inherit"]')).toHaveCount(1);
    await expect(page.locator('.sr-role[data-sr-role="event"]'))
      .toHaveAttribute('data-sr-docs', 'spi_state');
  });

  test('「どの図の何から参照されているか」が 1 文で読める', async ({ page }) => {
    await openRename(page);
    await page.fill('#rename-from', 'SpiDrv');
    await expect(page.locator('#rename-semantic-head')).toHaveAttribute('data-sr-docs', '3');
    const sent = page.locator('#rename-semantic-sentence');
    await expect(sent).toContainText('spi_state の遷移イベント');
    await expect(sent).toContainText('driver_common_class');
  });

  test('置換後に開いて確かめる図を先に絞り込める（題・ノートだけの図は挙げない）', async ({ page }) => {
    await openRename(page);
    await page.fill('#rename-from', 'SpiDrv');
    await expect(page.locator('#rename-semantic-head')).toHaveAttribute('data-sr-docs', '3');
    const foot = page.locator('#rename-semantic-check');
    await expect(foot).toHaveAttribute('data-sr-check', '3');
    await expect(foot).toContainText('spi_state');
    await expect(foot).not.toContainText('adc_init_sequence');
  });

  test('参照の行を押すとその図のその行へ運ばれる', async ({ page }) => {
    await openRename(page);
    await page.fill('#rename-from', 'SpiDrv');
    await expect(page.locator('#rename-semantic-head')).toHaveAttribute('data-sr-docs', '3');
    await page.locator('button.sr-ref[data-sr-doc="spi_state"]').first().click();
    await page.waitForTimeout(700);
    const name = await page.evaluate(() => {
      const doc = window.MA.workspace.getActive();
      return doc ? doc.name : '';
    });
    expect(name).toContain('spi_state');
  });

  test('参照が無い名前は黙らず「参照している図はありません」と出る', async ({ page }) => {
    await openRename(page);
    await page.fill('#rename-from', 'CanDrv');
    await expect(page.locator('#rename-semantic-head')).toContainText('参照している図はありません');
    await expect(page.locator('#rename-semantic-head')).toHaveAttribute('data-sr-total', '0');
  });
});

// BLK-primary-20260913-0206-wish: 手順 4 の場面「顧客向け資料に図を組み込む」。
// 社内略語 (SpiDrv / IRQCtrl / DmaCtrl) の洗い出し → 個別に一括置換 → SVG を
// 1 枚ずつ目視、の 3 工程だったものを、📤 提出前チェックの中の対応表 1 枚に寄せる。
// 表を確定すると全図に当たり、当てたあとの残存件数を表が言い切る。
const GL_SPI = '@startuml\ntitle SPI 初期化\nparticipant SpiDrv\nparticipant IRQCtrl\nSpiDrv -> IRQCtrl : enable\n@enduml';
const GL_DMA = '@startuml\ntitle DMA 初期化\nparticipant DmaCtrl\nparticipant SpiDrv\nDmaCtrl -> SpiDrv : ready\n@enduml';
const GL_CLASS = '@startuml\nclass Spi_Driver\nclass Hal\nSpi_Driver --> Hal\n@enduml';

const FILES = [
  ['spi_init_sequence', GL_SPI],
  ['dma_init_sequence', GL_DMA],
  ['driver_common_class', GL_CLASS],
];

test.describe('primary 手順 4: 社内略語の対応表を確定して顧客向けに出す', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page);
    await clearDir(page);
    await putFile(page, 'spi_init_sequence', GL_SPI);
    await putFile(page, 'dma_init_sequence', GL_DMA);
    await putFile(page, 'driver_common_class', GL_CLASS);
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForSelector('#preview-svg');
    // 手順 1 の状態 (14 枚を開いてある) を作る。
    // タブを開くと自動保存がエディタの中身 (前のタブの本文) を新しいタブへ
    // 書き戻すことがあり、図種が変われば名前まで `_sequence` へ回る。
    // 開いた id を控えておいて、落ち着いてから本文と名前を揃え直す。
    const ids = await page.evaluate((files) => {
      const WS = window.MA.workspace;
      const opened = files.map((f) => (WS.open({ name: f[0], dsl: f[1] }) || {}).id);
      window.switchToDoc(opened[0]);
      // 起動時の見本タブは閉じる (見本の略語が今日の 14 枚に混ざらないように)。
      WS.list().filter((d) => opened.indexOf(d.id) === -1).forEach((d) => WS.close(d.id));
      return opened;
    }, FILES);
    await page.waitForTimeout(800);
    await page.evaluate((a) => {
      const WS = window.MA.workspace;
      a.ids.forEach((id, i) => {
        WS.updateDoc(id, { dsl: a.files[i][1] });
        WS.rename(id, a.files[i][0]);
      });
      window.switchToDoc(a.ids[0]);
    }, { ids, files: FILES });
    await page.waitForTimeout(400);
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
  });

  test('表は社内略語だけを挙げ、正式名称が既に入っている（打鍵ゼロで確定できる）', async ({ page }) => {
    await page.locator('#btn-tab-submit').click();
    await page.waitForSelector('#gl-table');

    // 洗い出し: 略語だけが並ぶ。既に正式名称の Spi_Driver と略語でない Hal は挙げない。
    await expect(page.locator('.gl-row[data-term="SpiDrv"]')).toHaveCount(1);
    await expect(page.locator('.gl-row[data-term="IRQCtrl"]')).toHaveCount(1);
    await expect(page.locator('.gl-row[data-term="DmaCtrl"]')).toHaveCount(1);
    await expect(page.locator('.gl-row[data-term="Spi_Driver"]')).toHaveCount(0);
    await expect(page.locator('.gl-row[data-term="Hal"]')).toHaveCount(0);

    // 正式名称の既定値が入っているので、確定までに打つ文字は無い。
    await expect(page.locator('.gl-to[data-to="SpiDrv"]')).toHaveValue('Spi_Driver');
    await expect(page.locator('.gl-to[data-to="IRQCtrl"]')).toHaveValue('IRQ_Controller');
    await expect(page.locator('.gl-to[data-to="DmaCtrl"]')).toHaveValue('Dma_Controller');
  });

  test('表を確定すると全図に当たり、残存略語ゼロを表が言い切る', async ({ page }) => {
    await page.locator('#btn-tab-submit').click();
    await page.waitForSelector('#gl-table');
    await page.locator('#gl-apply').click();

    // 到達条件その1: 目視の代わりになる 1 行が出る。
    const verdict = page.locator('#gl-verdict');
    await expect(verdict).toHaveAttribute('data-remaining', '0');
    await expect(verdict).toContainText('残存略語 0 件');
    await expect(verdict).toContainText('顧客向けに出せます');

    // 到達条件その2: 行ごとの残存も 0 になる (どの略語が残っているかで読める)。
    await expect(page.locator('.gl-left[data-left-of="SpiDrv"]')).toHaveText('0 件');
    await expect(page.locator('.gl-left[data-left-of="IRQCtrl"]')).toHaveText('0 件');

    // 到達条件その3: 3 枚の本文が正式名称に置き換わっている (1 回の確定で全図)。
    const dsls = await page.evaluate(() => window.MA.workspace.list()
      .map((d) => ({ name: d.name, dsl: d.dsl })));
    const spi = dsls.find((d) => d.name === 'spi_init_sequence');
    const dma = dsls.find((d) => d.name === 'dma_init_sequence');
    expect(spi.dsl).toContain('participant Spi_Driver');
    expect(spi.dsl).toContain('IRQ_Controller');
    expect(spi.dsl).not.toContain('SpiDrv');
    expect(dma.dsl).not.toContain('DmaCtrl');
  });

  test('正式名称を空にした略語は「未設定」と名指しされ、0 件に混ぜられない', async ({ page }) => {
    await page.locator('#btn-tab-submit').click();
    await page.waitForSelector('#gl-table');
    await page.locator('.gl-to[data-to="DmaCtrl"]').fill('');
    await page.locator('#gl-apply').click();

    const verdict = page.locator('#gl-verdict');
    await expect(verdict).toContainText('未設定の略語が 1 件');
    await expect(verdict).toContainText('DmaCtrl');
    // 当てなかった略語は図に残る。残っているものを 0 と言わない。
    await expect(page.locator('.gl-left[data-left-of="DmaCtrl"]')).toHaveText('2 件');
    await expect(verdict).toHaveAttribute('data-remaining', '2');
  });

  test('確定は 1 操作。Ctrl+Z 1 回で表を当てる前に戻る', async ({ page }) => {
    await page.locator('#btn-tab-submit').click();
    await page.waitForSelector('#gl-table');
    await page.locator('#gl-apply').click();
    await expect(page.locator('#gl-verdict')).toHaveAttribute('data-remaining', '0');

    await page.locator('#sc-close').click();
    await page.locator('#editor').press('Control+z');
    await page.waitForTimeout(800);
    // 表を当てたのは 1 手なので、Ctrl+Z 1 回で開いている図が元の綴りに戻る。
    expect(await page.locator('#editor').inputValue()).toContain('SpiDrv');
  });
});
