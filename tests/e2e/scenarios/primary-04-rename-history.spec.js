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

// BLK-primary-20260915-0506-wish: 不具合対応で「この部品名がいつの版から入ったか」
// を特定する場面。今までは 📂一覧の「履歴N」を 1 版ずつ開いて前の版と見比べるしか
// なく、開く回数が図の枚数 × 版数で増えていた。◉ 混入点は保存フォルダの全図の版を
// 1 回で走査し、増えた版・消えた版と、表記が混在し始めた版を時系列で出す。
test.describe('primary 手順 4: 部品名の混入点を過去版から特定する', () => {
  const CLEAN = '@startuml\ntitle SPI 初期化\nparticipant Spi_Driver\nSpi_Driver -> Hal : init\n@enduml';
  const MIXED = '@startuml\ntitle SPI 初期化\nparticipant Spi_Driver\nparticipant SpiDrv\nSpi_Driver -> Hal : init\n@enduml';
  const MIXED2 = '@startuml\ntitle SPI 初期化\nparticipant Spi_Driver\nparticipant SpiDrv\nSpi_Driver -> Hal : init\nSpiDrv -> Hal : reset\n@enduml';

  test.beforeEach(async ({ page }) => {
    await boot(page);
    await clearDir(page);
    // 版を 3 世代積む。server は上書きの手前で前の中身を _versions へ控えるので、
    // 「混在の無い版 → 混在の入った版 → 増えた版」がそのまま時系列になる。
    await putFile(page, 'spi_init_sequence', CLEAN);
    await page.waitForTimeout(1100);
    await putFile(page, 'spi_init_sequence', MIXED);
    await page.waitForTimeout(1100);
    await putFile(page, 'spi_init_sequence', MIXED2);
    await putFile(page, 'adc_init_sequence', ADC);
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForSelector('#preview-svg');
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
  });

  async function search(page, q) {
    await page.locator('#btn-tab-blame').click();
    await page.waitForSelector('#blame-panel.open');
    await page.fill('#blame-term', q);
    await page.locator('#btn-blame-run').click();
    await page.waitForSelector('#blame-head[data-bp-rows]');
  }

  test('2 語を 1 回入れるだけで、混在が始まった版が名指しされる', async ({ page }) => {
    await search(page, 'SpiDrv Spi_Driver');
    // 版を 1 つも開かずに、混在の始まりが見出しに出る。
    await expect(page.locator('#blame-head')).toContainText('混在の始まり');
    await expect(page.locator('#blame-head')).toContainText('spi_init_sequence');
    const mix = page.locator('#blame-results .bp-row[data-bp-mix]');
    await expect(mix).toHaveCount(1);
    // 混入した行そのものが、開かずにその場に出る。
    await expect(mix.locator('.bp-line.bp-add')).toContainText('participant SpiDrv');
    await expect(mix.locator('.bp-delta')).toContainText('SpiDrv +1');
  });

  test('語ごとの出所が出る (旧称は途中から、新称は最古の版から)', async ({ page }) => {
    await search(page, 'SpiDrv Spi_Driver');
    const orig = page.locator('#blame-origin');
    await expect(orig).toContainText('SpiDrv: ');
    await expect(orig).toContainText('spi_init_sequence');
    // 最古の控えに既に居た語は「その版から」と言い切らない (増えた瞬間は見ていない)。
    await expect(orig).toContainText('残っている最古の版');
  });

  test('当たらない語は黙らずに「どの版にも無い」と言う', async ({ page }) => {
    await search(page, 'NoSuchPart');
    await expect(page.locator('#blame-head')).toContainText('どの版にも出てきません');
    await expect(page.locator('#blame-head')).toHaveAttribute('data-bp-rows', '0');
  });

  test('混入した版は 1 クリックで別タブに開ける (今の図は変わらない)', async ({ page }) => {
    await search(page, 'SpiDrv Spi_Driver');
    const mix = page.locator('#blame-results .bp-row[data-bp-mix]');
    const stamp = await mix.getAttribute('data-bp-stamp');
    expect(stamp).toBeTruthy();
    await mix.locator('button.bp-open').click();
    // 刻印つきの名前で開くので、開いたまま自動保存が走っても今の図を塗り潰さない。
    await page.waitForFunction((s) => {
      const a = window.MA.workspace.getActive();
      return !!a && a.name === 'spi_init_sequence@' + s;
    }, stamp);
    expect(await page.locator('#editor').inputValue()).toContain('participant SpiDrv');
  });

  // BLK-primary-20260915-0606-wish: 混入点は当たった行しか出さないので、原因を
  // 直すのに要る前後の文脈 (その participant がどこで呼ばれ始めたか) が読めず、
  // 版を開く → 前の版も開いて目で照合、の 2 手が部品数 × 該当版数ぶん積み上がる。
  // 行の「差分」からその 2 手を挟まずに全文差分へ進めることを見る。
  test('混入点の行から 1 クリックで「その版 vs 直前の版」の全文差分が出る', async ({ page }) => {
    await search(page, 'SpiDrv Spi_Driver');
    const mix = page.locator('#blame-results .bp-row[data-bp-mix]');
    await mix.locator('button.bp-diff').click();
    await page.waitForSelector('#vdiff-panel.open');
    await page.waitForSelector('#vdiff-head[data-vd-added]');
    // 版を 1 枚も個別に開いていない (今の図はそのまま)。
    expect(await page.evaluate(() => window.MA.workspace.getActive().name)).not.toContain('@');
    // 前の版 → この版、と何と何を並べているかが見出しで分かる。
    await expect(page.locator('#vdiff-title')).toContainText('spi_init_sequence');
    await expect(page.locator('#vdiff-title')).toContainText('→');
    await expect(page.locator('#vdiff-head')).toHaveAttribute('data-vd-added', '1');
    await expect(page.locator('#vdiff-head')).toHaveAttribute('data-vd-removed', '0');
    // 増えた行と、その前後の文脈 (変わっていない行) が同じ画面に出る。
    await expect(page.locator('#vdiff-body .vd-add')).toContainText('participant SpiDrv');
    await expect(page.locator('#vdiff-body .vd-line.vd-same')
      .filter({ hasText: 'participant Spi_Driver' })).toHaveCount(1);
    // 探していた語が動いた行は名指しされ、枠が付く (全文を上から読まない)。
    await expect(page.locator('#vdiff-jump')).toHaveAttribute('data-vd-hits', '1');
    await expect(page.locator('#vdiff-body .vd-hit')).toHaveCount(1);
  });

  test('全文差分から、その版を開くところへそのまま進める', async ({ page }) => {
    await search(page, 'SpiDrv Spi_Driver');
    const mix = page.locator('#blame-results .bp-row[data-bp-mix]');
    const stamp = await mix.getAttribute('data-bp-stamp');
    await mix.locator('button.bp-diff').click();
    await page.waitForSelector('#vdiff-head[data-vd-added]');
    await page.locator('#btn-vdiff-open').click();
    await page.waitForFunction((s) => {
      const a = window.MA.workspace.getActive();
      return !!a && a.name === 'spi_init_sequence@' + s;
    }, stamp);
  });

  test('変わらない行が長く続く版でも、既定は変更の周りだけ (「全文を出す」で開く)', async ({ page }) => {
    // 40 行の本体に 1 行だけ挿した版を積む。畳まないと 1 行の変更を探して
    // 全文を目で追うことになる。
    const body = Array.from({ length: 40 }, (_, i) => `Spi_Driver -> Hal : step${i}`).join('\n');
    const base = `@startuml\ntitle SPI 長い\n${body}\n@enduml`;
    const after = base.replace('step20', 'step20\nparticipant SpiDrv');
    await putFile(page, 'spi_long_sequence', base);
    await page.waitForTimeout(1100);
    await putFile(page, 'spi_long_sequence', after);
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForSelector('#preview-svg');
    await search(page, 'SpiDrv');
    const row = page.locator('#blame-results .bp-row[data-bp-file="spi_long_sequence"]').first();
    await row.locator('button.bp-diff').click();
    await page.waitForSelector('#vdiff-head[data-vd-added]');
    const folded = Number(await page.locator('#vdiff-body').getAttribute('data-vd-lines'));
    expect(folded).toBeLessThan(15);
    await expect(page.locator('#vdiff-body .vd-gap')).toHaveCount(2);
    await page.locator('#btn-vdiff-all').click();
    const all = Number(await page.locator('#vdiff-body').getAttribute('data-vd-lines'));
    expect(all).toBeGreaterThan(40);
    await expect(page.locator('#vdiff-body .vd-gap')).toHaveCount(0);
  });
});

// BLK-primary-20260917-0123-wish: 不具合対応の場面の手順 4。◈依存グラフは
// 「今どの図が絡むか」までは出すが、「いつこの記述に変わったか」は答えなかった。
// 影響が届く図の版履歴を 1 本の時系列に混ぜ、症状の語で絞って
// 「ここで書き換わった版」を名指しし、その版をそのまま開けることを見る。
const DV_SPI_1 = '@startuml\nparticipant Spi_Driver\nparticipant Hal\nSpi_Driver -> Hal : init\n@enduml';
const DV_SPI_2 = DV_SPI_1.replace('@enduml', 'note over Hal : 見出し\n@enduml');
const DV_SPI_3 = DV_SPI_2.replace('Spi_Driver -> Hal : init', 'Spi_Driver -> PowerCtrl : init');
const DV_DMA_1 = '@startuml\nclass DmaCtrl\nDmaCtrl --> Spi_Driver : notify\n@enduml';
// 影響一覧に載るが Spi_Driver を一度も持たない図 (絞り込みで落ちるべき)。
const DV_ADC = '@startuml\nparticipant AdcDrv\nparticipant Hal\nAdcDrv -> Hal : init\n@enduml';

// version-timeline の控え (localStorage)。保存のたびに積まれる形をそのまま置く。
const DV_TIMELINE = {
  files: {
    spi_init_sequence: [
      { dsl: DV_SPI_1, at: '2026-09-14T10:00:00.000Z', label: '' },
      { dsl: DV_SPI_2, at: '2026-09-15T10:00:00.000Z', label: '' },
      { dsl: DV_SPI_3, at: '2026-09-16T10:00:00.000Z', label: '' },
    ],
    dma_class: [
      { dsl: DV_DMA_1, at: '2026-09-13T08:00:00.000Z', label: '' },
    ],
    adc_init_sequence: [
      { dsl: DV_ADC, at: '2026-09-15T12:00:00.000Z', label: '' },
    ],
  },
};

async function dvBoot(page) {
  await page.addInitScript((a) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-tools-folded', '0');
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: a.dir }));
      window.localStorage.setItem('plantuml-version-timeline', JSON.stringify(a.timeline));
    } catch (e) {}
  }, { dir: DIR, timeline: DV_TIMELINE });
  await gotoApp(page);
}

// ⇄一括置換 → ◈依存グラフ。不具合対応で primary が実際に通る道。
async function openDepGraph(page) {
  await openRename(page);
  await page.locator('#btn-rename-depgraph').click();
  await page.waitForSelector('#dg-modal #dg-ver-summary[data-rows]');
}

async function pickPart(page, name) {
  await page.selectOption('#dg-name', name);
  await page.waitForFunction((n) => {
    const el = document.getElementById('dg-ver-kw');
    return !!el && el.value === n;
  }, name);
}

test.describe('primary 手順 4: 症状に関わる部品がいつの版から今の形になったかを探す', () => {
  test.beforeEach(async ({ page }) => {
    await dvBoot(page);
    await clearDir(page);
    await putFile(page, 'spi_init_sequence', DV_SPI_3);
    await putFile(page, 'dma_class', DV_DMA_1);
    await putFile(page, 'adc_init_sequence', DV_ADC);
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForSelector('#preview-svg');
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
  });

  test('依存グラフで部品名を選ぶと、症状の語が既定で入り版履歴が並ぶ', async ({ page }) => {
    await openDepGraph(page);
    await pickPart(page, 'Spi_Driver');
    // 名前を選んだだけで語が入る = 打ち直さない。
    await expect(page.locator('#dg-ver-kw')).toHaveValue('Spi_Driver');
    const sum = page.locator('#dg-ver-summary');
    await expect(sum).toContainText('Spi_Driver');
    // 当たるのは spi_init_sequence と dma_class の 2 図。adc は落ちる。
    await expect(sum).toHaveAttribute('data-docs', '2');
    await expect(page.locator('#dg-ver-list .dgv-row[data-doc="adc_init_sequence"]')).toHaveCount(0);
    await expect(page.locator('#dg-ver-list .dgv-row[data-doc="spi_init_sequence"]').first())
      .toBeVisible();
  });

  test('「今の形になった版」が図ごとに 1 つ名指しされる', async ({ page }) => {
    await openDepGraph(page);
    await pickPart(page, 'Spi_Driver');
    // 名指しは図ごとに 1 つ。どの図も「その図が今の形になった版」を 1 つ持つ
    // (2 図が当たっているので 2 行。1 図あたり 2 行にはならない)。
    const current = page.locator('#dg-ver-list .dgv-row[data-current="1"]');
    await expect(current).toHaveCount(2);
    const spi = page.locator(
      '#dg-ver-list .dgv-row[data-current="1"][data-doc="spi_init_sequence"]');
    await expect(spi).toHaveCount(1);
    await expect(spi).toHaveAttribute('data-rev', '3');
    await expect(spi.locator('td.dgv-what')).toContainText('今の形');
    // 当たった行がその場に出る (図を開いて探し直さない)。
    await expect(spi.locator('td.dgv-hits mark').first()).toContainText('Spi_Driver');
  });

  test('既定は「書き換わった版だけ」。外すと読むだけの版も出る', async ({ page }) => {
    await openDepGraph(page);
    await pickPart(page, 'Spi_Driver');
    const sum = page.locator('#dg-ver-summary');
    const folded = Number(await sum.getAttribute('data-rows'));
    await page.locator('#dg-ver-changed').uncheck();
    await page.waitForFunction((n) => {
      const el = document.getElementById('dg-ver-summary');
      return !!el && Number(el.getAttribute('data-rows')) > n;
    }, folded);
    const all = Number(await sum.getAttribute('data-rows'));
    expect(all).toBeGreaterThan(folded);
    // 畳んで外れていたのは「変化なし」の版。
    await expect(page.locator('#dg-ver-list .dgv-row[data-changed="0"]').first()).toBeVisible();
  });

  test('当たらない語では黙らず、次の手を言う', async ({ page }) => {
    await openDepGraph(page);
    await pickPart(page, 'Spi_Driver');
    await page.fill('#dg-ver-kw', 'NoSuchSymptom');
    await page.waitForFunction(() => {
      const el = document.getElementById('dg-ver-summary');
      return !!el && el.getAttribute('data-rows') === '0';
    });
    await expect(page.locator('#dg-ver-summary')).toContainText('ありません');
    await expect(page.locator('#dg-ver-open')).toBeDisabled();
  });

  test('「最初の 1 枚を開く」で、その版の中身が別タブで開く', async ({ page }) => {
    await openDepGraph(page);
    await pickPart(page, 'Spi_Driver');
    await page.locator('#dg-ver-open').click();
    // 版番号つきのタブ名で開く = 今の図を上書きしない。
    await page.waitForSelector('#dg-modal', { state: 'hidden' });
    await expect(page.locator('.tab .tab-label', { hasText: 'spi_init_sequence@版3' }))
      .toHaveCount(1);
    // 開いた中身はその版のもの。
    await expect(page.locator('#editor')).toHaveValue(/Spi_Driver -> PowerCtrl/);
  });
});
