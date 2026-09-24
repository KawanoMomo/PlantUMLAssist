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

test.describe('primary 手順 4: 社内略語の対応表を確定して顧客向けに出す', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page);
    await resetRegistry(page);
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
    await resetRegistry(page).catch(() => {});
    await clearDir(page).catch(() => {});
  });

  test('確定した組は登録簿に入り、次に開いた表からは消える', async ({ page }) => {
    await page.locator('#btn-tab-unify').click();
    await page.waitForSelector('#gl-table');
    await page.locator('#gl-apply').click();
    await expect(page.locator('#gl-verdict')).toHaveAttribute('data-remaining', '0');
    await expect.poll(async () => page.evaluate(async (d) => {
      const r = await fetch('/name-registry?dir=' + encodeURIComponent(d));
      const j = await r.json();
      return (j.entries || []).map((e) => e.canonical + '<' + (e.variants || []).join('|')).sort().join(',');
    }, DIR)).toContain('Spi_Driver<SpiDrv');
    // 提出前チェックには対応表を持たない (道具を 2 つ持たない)。
    await page.locator('#btn-unify-cancel').click();
    await page.locator('#btn-tab-submit').click();
    await expect(page.locator('#sc-modal-content')).toContainText('提出前チェック');
    await expect(page.locator('#sc-modal-content #gl-table')).toHaveCount(0);
    // BLK-owner-20260924-1252-prune: 略語の見分け方は 表記統一 と同じ。登録簿に入った略語は数えない。
    await expect(page.locator('#sc-summary')).toHaveAttribute('data-ready', '1');
    await expect(page.locator('#sc-summary')).toHaveAttribute('data-abbrevs', '0');
    await expect(page.locator('#sc-abbrev-line')).toHaveText('社内略語は残っていません');
  });

  // BLK-owner-20260924-1252-prune: 社内略語の見分け方は glossary の 1 本。同じ保存フォルダなら
  // 📤 提出前チェックの略語の件数と 🔤 表記統一の「N 件の社内略語が全図に残っています」の N が一致し、
  // 前の提出前チェックの辞書に無かった Hdlr も両方に出る。直す先は 表記統一 (提出前チェックに表は無い)。
  test('提出前チェックと表記統一は同じ社内略語を同じ件数で数え、提出前チェックから表記統一へ直しに行ける', async ({ page }) => {
    // 開いている spi_init_sequence の本文に、割り込みハンドラ IsrHdlr の宣言を 1 行足す (エディタで打つのと同じ道)。
    await page.evaluate(() => {
      const WS = window.MA.workspace;
      const d = WS.list().filter((x) => x.name === 'spi_init_sequence')[0];
      window.switchToDoc(d.id);
      const ed = document.getElementById('editor');
      ed.value = ed.value.replace('participant IRQCtrl', 'participant IRQCtrl' + String.fromCharCode(10) + 'participant IsrHdlr');
      ed.dispatchEvent(new Event('input'));
    });
    await page.waitForTimeout(400);
    await page.locator('#btn-tab-unify').click();
    await page.waitForSelector('#gl-table');
    await expect(page.locator('.gl-row[data-term="IsrHdlr"]')).toHaveCount(1);
    const verdict = (await page.locator('#gl-verdict').textContent()) || '';
    const n = Number((verdict.match(/(\d+) 件の社内略語/) || [])[1]);
    expect(n).toBe(4);
    await page.locator('#btn-unify-cancel').click();

    await page.locator('#btn-tab-submit').click();
    await expect(page.locator('#sc-summary')).toHaveAttribute('data-ready', '1');
    await expect(page.locator('#sc-summary')).toHaveAttribute('data-abbrevs', String(n));
    await expect(page.locator('#sc-abbrev-line')).toContainText(n + ' 件の社内略語が全図に残っています');
    await expect(page.locator('#sc-abbrev')).toHaveAttribute('data-terms', /IsrHdlr/);
    await expect(page.locator('.sc-row.sc-flagged').filter({ hasText: 'IsrHdlr' })).toHaveCount(1);
    // 辞書の欄は略語の辞書ではない (前の既定の Drv / Ctrl は入っていない)。
    const dict = (await page.locator('#sc-dict').inputValue()).split(String.fromCharCode(10)).map((l) => l.trim());
    expect(dict).not.toContain('Drv');
    expect(dict).not.toContain('Ctrl');
    // 直す先は 🔤 表記統一。押すとそのパネルが開き、同じ略語が並ぶ。
    await page.locator('#sc-open-unify').click();
    await expect(page.locator('#sc-modal')).toBeHidden();
    await page.waitForSelector('#gl-table');
    await expect(page.locator('.gl-row[data-term="IsrHdlr"]')).toHaveCount(1);
  });

  test('表は社内略語だけを挙げ、正式名称が既に入っている（打鍵ゼロで確定できる）', async ({ page }) => {
    await page.locator('#btn-tab-unify').click();
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
    await page.locator('#btn-tab-unify').click();
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
    await page.locator('#btn-tab-unify').click();
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
    await page.locator('#btn-tab-unify').click();
    await page.waitForSelector('#gl-table');
    await page.locator('#gl-apply').click();
    await expect(page.locator('#gl-verdict')).toHaveAttribute('data-remaining', '0');

    await page.locator('#btn-unify-cancel').click();
    // BLK-owner-20260924-2232-1: 元に戻す履歴はタブごと。途中で新しいタブを 1 枚開いて状態遷移図を書き、
    // 元のタブへ戻ってから Ctrl+Z を押しても、別のタブの本文は入らず、タブ名も変わらない。
    const namesBefore = await page.evaluate(() => window.MA.workspace.list().map((d) => d.name));
    await page.locator('#btn-tab-new').click();
    await page.waitForTimeout(400);
    await page.locator('#editor').fill('@startuml\n[*] --> Idle\nIdle --> Run : start\n@enduml');
    await page.waitForTimeout(600);
    await page.locator('#tab-bar .tab[data-doc-name="spi_init_sequence"]').click();
    await page.waitForTimeout(600);
    await page.locator('#editor').press('Control+z');
    await page.waitForTimeout(800);
    // 表を当てたのは 1 手なので、Ctrl+Z 1 回で開いている図が元の綴りに戻る。
    expect(await page.locator('#editor').inputValue()).toContain('SpiDrv');
    // 押し続けても、このタブの最初の状態で止まる (別のタブの本文・名前は入らない)。
    for (let i = 0; i < 3; i++) {
      await page.locator('#editor').press('Control+z');
      await page.waitForTimeout(300);
    }
    const ed = await page.locator('#editor').inputValue();
    expect(ed).toContain('SpiDrv');
    expect(ed).not.toContain('Idle --> Run');
    await expect(page.locator('#btn-undo')).toBeDisabled();
    const namesAfter = await page.evaluate(() => window.MA.workspace.list().map((d) => d.name));
    expect(namesAfter.slice(0, namesBefore.length)).toEqual(namesBefore);
    await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-doc-name', 'spi_init_sequence');
    // やり直しは表を当てた後へ 1 段だけ進む。
    await page.locator('#editor').press('Control+y');
    await page.waitForTimeout(500);
    expect(await page.locator('#editor').inputValue()).toContain('Spi_Driver');
    expect(await page.locator('#editor').inputValue()).not.toContain('Idle --> Run');
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
// いまの中身。Spi_Driver の行は版 3 と同じ (関係ない note が増えただけ) なので、
// 「今の形になった版」は保存フォルダの控え (版 3) の方になる。
const DV_SPI_4 = DV_SPI_3.replace('@enduml', 'note over PowerCtrl : 電源\n@enduml');
const DV_DMA_1 = '@startuml\nclass DmaCtrl\nDmaCtrl --> Spi_Driver : notify\n@enduml';
// 影響一覧に載るが Spi_Driver を一度も持たない図 (絞り込みで落ちるべき)。
const DV_ADC = '@startuml\nparticipant AdcDrv\nparticipant Hal\nAdcDrv -> Hal : init\n@enduml';

// BLK-primary-20260924-1232: 版の材料は保存フォルダ (_versions/*.puml と今の中身)。
// localStorage は毎回空にして起こす (台本どおり素のブラウザ) — それでも前に積んだ版が並ぶこと。
async function dvBoot(page) {
  await page.addInitScript((a) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-tools-folded', '0');
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: a.dir }));
    } catch (e) {}
  }, { dir: DIR });
  await gotoApp(page);
}

// Ctrl+K「依存グラフ」→ ▤ 影響を見る の上段。不具合対応で primary が実際に通る道
// (BLK-owner-20260923-1949-prune: 依存グラフは ▤ 影響を見る に畳んだ。名前は Ctrl+K に残る)。
async function openDepGraph(page) {
  await runCmd(page, '依存グラフ');
  await page.waitForSelector('#ri-modal #dg-ver-summary[data-rows]');
}

async function pickPart(page, name) {
  await page.selectOption('#dg-name', name);
  await page.waitForFunction((n) => {
    const el = document.getElementById('dg-ver-kw');
    const sum = document.getElementById('dg-ver-summary');
    return !!el && el.value === n && !!sum && sum.hasAttribute('data-rows');
  }, name);
}

test.describe('primary 手順 4: 症状に関わる部品がいつの版から今の形になったかを探す', () => {
  test.beforeEach(async ({ page }) => {
    await dvBoot(page);
    await clearDir(page);
    // dma_class は先に書いておく (Spi_Driver を持ったのは spi の書き換えより前)。
    await putFile(page, 'dma_class', DV_DMA_1);
    await page.waitForTimeout(1100);
    // 版を 4 世代積む。server は上書きの手前で前の中身を _versions へ控える。
    await putFile(page, 'spi_init_sequence', DV_SPI_1);
    await putFile(page, 'spi_init_sequence', DV_SPI_2);
    await putFile(page, 'spi_init_sequence', DV_SPI_3);
    await putFile(page, 'spi_init_sequence', DV_SPI_4);
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
    // localStorage は空のまま起こしたのに、保存フォルダの控え (刻印つきの版) が並ぶ。
    expect(await page.evaluate(() => window.localStorage.getItem('plantuml-version-timeline') || ''))
      .not.toContain('PowerCtrl');
    await expect(page.locator('#dg-ver-list .dgv-row[data-doc="spi_init_sequence"]:not([data-stamp=""])'))
      .not.toHaveCount(0);
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
    await page.waitForSelector('#ri-modal', { state: 'hidden' });
    // 開き方は ◉ 混入点の「開く」と同じ: 控えは刻印つきの別タブ。
    await expect(page.locator('.tab .tab-label', { hasText: /^spi_init_sequence@\d{8}-\d{6}/ }))
      .toHaveCount(1);
    // 開いた中身はその版 (版 3) のもの。いまの中身 (版 4) ではない。
    await expect(page.locator('#editor')).toHaveValue(/Spi_Driver -> PowerCtrl/);
    await expect(page.locator('#editor')).not.toHaveValue(/電源/);
  });

  // BLK-primary-20260924-2132-wish: 不具合の語から「今その語を含む図」と「その語が書き換わった過去の版」を
  // 追うのに、📂 一覧と ▤ 影響を見る を往復し、版履歴は部品名のプルダウンを先に選ばないと出なかった。
  // ▤ を開いて語を 1 か所に 1 回打つだけで、上段の版履歴と下段の出てくる行が同じ語で並ぶことを見る。
  async function dvRows(page) {
    await page.waitForFunction(() => {
      const el = document.getElementById('dg-ver-summary');
      return !!el && Number(el.getAttribute('data-rows')) > 0;
    });
  }

  test('▤ を開いて語を 1 回打つだけで、今の図と過去の版が同じ語で並ぶ（部品名を先に選ばない）', async ({ page }) => {
    await openDepGraph(page);
    // 開いた直後は語が空 (依存グラフが先頭に出す部品名を版履歴の語に勝手に入れない)。
    await expect(page.locator('#dg-ver-kw')).toHaveValue('');
    await page.locator('#ns-q').click();
    await page.keyboard.type('Spi_Driver');
    // 下段に打った語が上段の語にも入り、部品名のプルダウンも合う (選び直さない)。
    await expect(page.locator('#dg-ver-kw')).toHaveValue('Spi_Driver');
    await expect(page.locator('#dg-name')).toHaveValue('Spi_Driver');
    await dvRows(page);
    const sum = page.locator('#dg-ver-summary');
    await expect(sum).toHaveAttribute('data-docs', '2');
    await expect(page.locator('#dg-ver-list .dgv-row[data-doc="spi_init_sequence"][data-current="1"]'))
      .toHaveCount(1);
    // 下段: 今その語を含む図と行。
    await expect(page.locator('#ns-rows .ns-row[data-name="spi_init_sequence"]')).toHaveCount(1);
    await expect(page.locator('#ns-rows .ns-row[data-name="dma_class"]')).toHaveCount(1);
    await expect(page.locator('#ns-rows .ns-row[data-name="adc_init_sequence"]')).toHaveCount(0);
  });

  test('部品名でない語は、保存フォルダの版全体から引く（影響が届かない図の版も並ぶ）', async ({ page }) => {
    await openDepGraph(page);
    await pickPart(page, 'Spi_Driver');
    // 上段の語に打っても、下段の名前欄が同じ語になる。
    await page.locator('#dg-ver-kw').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('init');
    await expect(page.locator('#ns-q')).toHaveValue('init');
    await dvRows(page);
    const sum = page.locator('#dg-ver-summary');
    await expect(sum).toHaveAttribute('data-scope', 'folder');
    await expect(sum).toContainText('保存フォルダ');
    // adc_init_sequence は Spi_Driver の影響一覧に載らないが、init を含むので並ぶ。
    const adc = page.locator('#dg-ver-list .dgv-row[data-doc="adc_init_sequence"]');
    await expect(adc.first()).toBeVisible();
    await expect(adc.first().locator('td.dgv-hop')).toHaveText('保存フォルダ');
    await expect(page.locator('#dg-ver-list .dgv-row[data-doc="spi_init_sequence"] td.dgv-hop').first())
      .toHaveText('直接');
    // 下段も同じ語で、今その語を含む図が並ぶ。
    await expect(page.locator('#ns-rows .ns-row[data-name="adc_init_sequence"]')).toHaveCount(1);
    await expect(page.locator('#ns-rows .ns-row[data-name="spi_init_sequence"]')).toHaveCount(1);
    // 部品名に戻すと、今までどおり影響が届く図に絞る。
    await page.locator('#dg-ver-kw').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Spi_Driver');
    await expect(sum).toHaveAttribute('data-scope', 'impact');
    await expect(sum).toHaveAttribute('data-docs', '2');
  });

  test('⇄ 症状検索で当たった語の行から、同じ語で ▤ 影響を見る が開く', async ({ page }) => {
    await page.locator('#btn-tab-symptom').click();
    await expect(page.locator('#symptom-panel')).toHaveClass(/open/);
    await page.locator('#symptom-scan-folder').check();
    await page.locator('#symptom-text').click();
    await page.keyboard.type('Spi_Driver の初期化が返らない');
    const head = page.locator('#symptom-systems .sym-sys[data-term="Spi_Driver"] .sym-sys-head');
    await expect(head).toBeVisible();
    await head.click();
    await expect(page.locator('#ri-modal')).toBeVisible();
    await expect(page.locator('#ns-q')).toHaveValue('Spi_Driver');
    await expect(page.locator('#dg-ver-kw')).toHaveValue('Spi_Driver');
    await dvRows(page);
    await expect(page.locator('#dg-ver-list .dgv-row[data-doc="spi_init_sequence"]').first()).toBeVisible();
    await expect(page.locator('#ns-rows .ns-row[data-name="spi_init_sequence"]')).toHaveCount(1);
  });
});

// BLK-primary-20260917-0323-wish: 新人に引き継ぐ場面の手順 4。統一を終えた図を
// junior に渡してよいかの確認が、⇄一括置換の履歴・図を 1 枚ずつ開いての note 読み・
// 📂一覧の SVG 印、と 3 つの画面に散っていた。1 画面の表 (置換済み / note最新 /
// SVG最新 / 指摘と符合する欠落) だけで合否が読め、揃わない行が赤く残ることを見る。
const HB_CLEAN = '@startuml\ntitle SPI 初期化\nparticipant Spi_Driver\nparticipant Hal\n'
  + 'Spi_Driver -> Hal : init\nnote over Spi_Driver : Spi_Driver に統一済み\n@enduml';
// 宣言も呼び出しも直っているのに、note の文だけ統一前の名前が残っている図。
// 前回はこれを見つけるために driver_common_class を個別に開いて本文を読んでいた。
const HB_STALE_NOTE = '@startuml\nclass Spi_Driver {\n  +Start() : void\n}\n'
  + 'note top of Spi_Driver : SpiDrv の初期化は Start() から\n@enduml';
// 置換そのものが届いていない図。
const HB_LEFT = '@startuml\n[*] --> Idle\nIdle --> Busy : SpiDrv.start\n@enduml';

const HB_HISTORY = {
  from: 'SpiDrv', to: 'Spi_Driver', at: '2026-09-17T02:00:00.000Z',
  docs: [{ name: 'spi_init_sequence', count: 2 }], total: 2,
};

async function hbBoot(page) {
  await page.addInitScript((a) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-tools-folded', '0');
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: a.dir }));
      // 手順 2 で打った組。「何から何へ直したか」はここが正本で、表の列 2 つはこれを基準に数える。
      const hist = {}; hist[a.dir] = [a.entry];
      window.localStorage.setItem('plantuml-rename-history', JSON.stringify(hist));
    } catch (e) {}
  }, { dir: DIR, entry: HB_HISTORY });
  await gotoApp(page);
}

// Ctrl+K から 1 件走らせる (_scenario.runCommand と同じ経路)。
async function runCmd(page, query) {
  await page.keyboard.press('Control+k');
  await page.waitForSelector('#cp-modal');
  await page.locator('#cp-input').fill(query);
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
}

async function openHandoverBoard(page) {
  await runCmd(page, '引き継ぎ');
  await page.waitForSelector('#hb-modal #hb-sum[data-total]');
  // 材料 (本文・SVG 印・指摘.md) を読み終えるまで待つ。
  await page.waitForFunction(() => {
    const el = document.querySelector('#hb-sum');
    return !!el && Number(el.getAttribute('data-total')) > 0;
  });
}

test.describe('primary 手順 4: 14 枚を新人に渡してよいかを 1 画面で確かめる', () => {
  test.beforeEach(async ({ page }) => {
    await hbBoot(page);
    await clearDir(page);
    await putFile(page, 'spi_init_sequence', HB_CLEAN);
    await putFile(page, 'driver_common_class', HB_STALE_NOTE);
    await putFile(page, 'spi_state', HB_LEFT);
    await page.reload();
    await page.waitForSelector('#preview-svg');
  });

  test('引き継ぎチェックリストが 1 画面で開き、図ごとに 4 列の答えが並ぶ', async ({ page }) => {
    await openHandoverBoard(page);

    // 到達条件その1: 図を 1 枚も開かずに、渡した 3 枚が行として並ぶ。
    const rows = page.locator('#hb-rows tr[data-doc-name]');
    await expect(rows).toHaveCount(3);

    // 到達条件その2: 置換が届いていない図は、置換列で名指しされる。
    const left = page.locator('#hb-rows tr[data-doc-name="spi_state"]');
    await expect(left.locator('td').nth(1)).toHaveAttribute('data-state', 'left');
    await expect(left.locator('td').nth(1)).toContainText('旧称');

    // 到達条件その3: 置換は済んだが note だけ統一前のまま、が別の列で分かれて出る
    // (前回はこれを見るために図を個別に開いて本文を読んでいた)。
    const stale = page.locator('#hb-rows tr[data-doc-name="driver_common_class"]');
    await expect(stale.locator('td').nth(1)).toHaveAttribute('data-state', 'done');
    await expect(stale.locator('td').nth(2)).toHaveAttribute('data-state', 'stale');
    await expect(stale.locator('td').nth(2)).toContainText('note');
  });

  test('渡す前に見る図だけが赤く残り、その行から図を開いて直せる', async ({ page }) => {
    await openHandoverBoard(page);

    // 到達条件その1: 合否はこの 1 画面の色だけで決まる。揃わない行が赤 (ready=0)。
    await expect(page.locator('#hb-rows tr[data-ready="0"]')).toHaveCount(3);
    const sum = page.locator('#hb-sum');
    await expect(sum).toHaveAttribute('data-tone', 'ng');
    await expect(sum).toContainText('渡す前に見る図');

    // 到達条件その2: 赤い行は「なぜ渡せないか」を列の名前で持つ。
    await expect(page.locator('#hb-rows tr[data-doc-name="driver_common_class"]'))
      .toHaveAttribute('data-blockers', /note が統一前のまま/);

    // 到達条件その3: その行からそのまま直しに行ける (一覧を開き直さない)。
    await page.locator('#hb-rows tr[data-doc-name="driver_common_class"] button.hb-open').click();
    await expect(page.locator('#hb-modal')).toBeHidden();
    await page.waitForTimeout(1500);
    await expect(page.locator('#editor')).toHaveValue(/SpiDrv の初期化/);
  });

  test('docset 出力の前に、未確認のまま渡そうとしている図が名指しされる', async ({ page }) => {
    await openHandoverBoard(page);
    await page.locator('#hb-close').click();

    await runCmd(page, 'docset');
    await page.waitForSelector('#docset-modal', { state: 'visible' });

    // 到達条件: 書き出すボタンを押す前に、渡せない図がその場で出る。
    const warn = page.locator('#docset-handover');
    await expect(warn).toContainText('未確認のまま渡そうとしています');
    await expect(warn).toContainText('spi_state');
  });
});

// BLK-primary-20260917-0523-wish: 仕様変更「SPI 初期化にクロック確認手順を追加する」の
// 影響範囲を洗うとき、メソッド名/部品名から「その名前を使っている図の一覧」を引く画面が
// 無く、指摘.md で対象名を絞ってから該当しそうな図を 1 枚ずつタブで開いて本文を読む、
// という手順になっていた。名前を 1 回打てば一覧が出て、行からその図のその行へ運ばれる。
const NS_SPI = '@startuml\ntitle SPI 初期化\nparticipant Spi_Driver\nparticipant ClockCtrl\nSpi_Driver -> ClockCtrl : EnableClock()\n@enduml';
const NS_CAN = '@startuml\ntitle CAN 初期化\nparticipant Can_Driver\nparticipant ClockCtrl\nCan_Driver -> ClockCtrl : EnableClock()\n@enduml';
const NS_GPIO = '@startuml\ntitle GPIO 初期化\nparticipant Gpio_Driver\nparticipant ClockCtrl\nGpio_Driver -> ClockCtrl : EnableClock()\n@enduml';
const NS_UART = '@startuml\ntitle UART 初期化\nparticipant Uart_Driver\nparticipant Hal\nUart_Driver -> Hal : init()\n@enduml';
const NS_CLASS = '@startuml\nclass ClockCtrl {\n  +EnableClock() : void\n}\nclass Spi_Driver\n@enduml';
const NS_STATE = '@startuml\n[*] --> Idle\nIdle --> Ready : ClockCtrl.EnableClock\n@enduml';

test.describe('primary 手順 4: 名前から影響する図を 1 回で引く', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page);
    await clearDir(page);
    await putFile(page, 'spi_init_sequence', NS_SPI);
    await putFile(page, 'can_init_sequence', NS_CAN);
    await putFile(page, 'gpio_init_sequence', NS_GPIO);
    await putFile(page, 'uart_init_sequence', NS_UART);
    await putFile(page, 'driver_common_class', NS_CLASS);
    await putFile(page, 'spi_state', NS_STATE);
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForSelector('#preview-svg');
  });

  test.afterEach(async ({ page }) => {
    await clearDir(page).catch(() => {});
  });

  // BLK-owner-20260923-1949-prune: 「名前で図を探す」は ▤ 影響を見る の下段 (置換後が空のときの出現箇所の一覧)。
  async function openNameSearch(page, q) {
    await runCmd(page, '名前で図を探す');
    await page.waitForSelector('#ri-modal', { state: 'visible' });
    if (q != null) {
      await page.fill('#ns-q', q);
      await page.waitForTimeout(300);
    }
  }

  test('メソッド名 1 回で、使っている図が一覧で出る（1 枚ずつ開かない）', async ({ page }) => {
    await openNameSearch(page, 'EnableClock');
    // 到達条件: 6 枚のうち当たった 5 枚が名前で並ぶ。開かなかった図は出ない。
    await expect(page.locator('#ns-rows')).toHaveAttribute('data-hit-docs', '5');
    for (const n of ['spi_init_sequence', 'can_init_sequence', 'gpio_init_sequence',
                     'driver_common_class', 'spi_state']) {
      await expect(page.locator(`#ns-rows .ns-row[data-name="${n}"]`)).toHaveCount(1);
    }
    await expect(page.locator('#ns-rows .ns-row[data-name="uart_init_sequence"]')).toHaveCount(0);
  });

  test('一覧の 1 行で「何枚開く必要があるか」まで読める', async ({ page }) => {
    await openNameSearch(page, 'EnableClock');
    const sum = page.locator('#ns-summary');
    // 枚数は「保存フォルダ + 開いているタブ」なので、下書きのタブがある分だけ動く。
    // 読めることが要るのは「当たった枚数」と「開かないと読めない枚数」。
    await expect(sum).toContainText('枚に 5 件');
    await expect(sum).toContainText('開いていない図');
    await expect(sum).toHaveAttribute('data-hit-docs', '5');
  });

  test('部品名でも引ける / 宣言している図が先頭に来る', async ({ page }) => {
    await openNameSearch(page, 'ClockCtrl');
    await expect(page.locator('#ns-rows')).toHaveAttribute('data-hit-docs', '5');
    const first = page.locator('#ns-rows .ns-row').first();
    await expect(first).toHaveAttribute('data-declared', '1');
  });

  test('修飾を付けるとその書き方の行だけに絞れる', async ({ page }) => {
    await openNameSearch(page, 'ClockCtrl.EnableClock');
    await expect(page.locator('#ns-rows')).toHaveAttribute('data-hit-docs', '1');
    await expect(page.locator('#ns-rows .ns-row[data-name="spi_state"]')).toHaveCount(1);
  });

  test('出現行を押すと、その図のその行へ運ばれる（開き直さない）', async ({ page }) => {
    await openNameSearch(page, 'EnableClock');
    await page.locator('#ns-rows .ns-row[data-name="can_init_sequence"] button.ns-at').first().click();
    await expect(page.locator('#ri-modal')).toBeHidden();
    await page.waitForTimeout(1200);
    const name = await page.evaluate(() => {
      const doc = window.MA.workspace.getActive();
      return doc ? doc.name : '';
    });
    expect(name).toContain('can_init_sequence');
    await expect(page.locator('#editor')).toHaveValue(/CAN 初期化/);
  });

  test('使われていない名前は「ありません」と言い切る（黙らない）', async ({ page }) => {
    await openNameSearch(page, 'NoSuchName');
    await expect(page.locator('#ns-rows')).toHaveAttribute('data-hit-docs', '0');
    await expect(page.locator('#ns-summary')).toContainText('どれにも出てきません');
  });

  test('引いた名前をそのまま一括置換の「置換前」に渡せる', async ({ page }) => {
    await openNameSearch(page, 'ClockCtrl');
    await page.locator('#dg-use').click();
    await expect(page.locator('#ri-modal')).toBeHidden();
    await page.waitForSelector('#rename-panel.open');
    await expect(page.locator('#rename-from')).toHaveValue('ClockCtrl');
  });
});

// BLK-primary-20260924-1432-wish: 新人に渡す前に、相手 (junior) のフォルダの同名図と食い違っていないかを
// 引き継ぎチェックリストの中で読む。以前は保存先を junior に切り替え、1 枚ずつ開いて本文を読み比べていた。
const HB_PEER_DIR = HB_PEER_DIR_OF(DIR);
function HB_PEER_DIR_OF(d) { return d.replace(/\/+$/, '') + '-junior'; }
const HB_TIMER_MINE = '@startuml\n[*] --> Idle\nstate Idle\nstate Configured\nstate Running\n'
  + 'Idle --> Configured : config\nConfigured --> Running : start\nRunning --> Idle : stop\n@enduml';
const HB_TIMER_PEER = '@startuml\n[*] --> Idle\nstate Idle\nstate Configured {\n  state Sub\n  state Sub2\n  state Sub3\n  state Sub4\n}\n'
  + 'state Running\nIdle --> Configured : config\nConfigured --> Running : start\nRunning --> Idle : stop\n@enduml';

test.describe('primary 手順 4: 渡す相手のフォルダの同名図と食い違っていないかを同じ表で読む', () => {
  test.beforeEach(async ({ page }) => {
    await hbBoot(page);
    await clearDir(page);
    await page.evaluate(async (a) => {
      await fetch('/autosave?dir=' + encodeURIComponent(a.peer), { method: 'DELETE' });
      const put = (dir, type, dsl) => fetch('/autosave', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, dir, dsl }),
      });
      await put(a.dir, 'spi_init_sequence', a.clean);
      await put(a.dir, 'TIMERドライバ状態遷移', a.mine);
      await put(a.peer, 'TIMERドライバ状態遷移', a.peerText);
    }, { dir: DIR, peer: HB_PEER_DIR, clean: HB_CLEAN, mine: HB_TIMER_MINE, peerText: HB_TIMER_PEER });
    await page.reload();
    await page.waitForSelector('#preview-svg');
  });

  test('渡す相手 = junior を選ぶと、相手の同名図との食い違いが 5 列目に赤く名指しされ、押すと並べて比較が開く', async ({ page }) => {
    await openHandoverBoard(page);
    // 選ばない間は今の 4 列のまま。
    await expect(page.locator('#hb-peer-th')).toBeHidden();

    // 相手の候補は隣のフォルダ (保存先は動かさない)。-junior のフォルダを選ぶ。
    const value = await page.locator('#hb-peer option').evaluateAll((os) =>
      (os.find((o) => /primary-04-rename-history-junior$/.test(o.value.replace(/[\/]+$/, ''))) || {}).value || '');
    expect(value).not.toBe('');
    await page.locator('#hb-peer').selectOption(value);

    await expect(page.locator('#hb-peer-th')).toBeVisible();
    const timer = page.locator('#hb-rows tr[data-doc-name="TIMERドライバ状態遷移"]');
    await expect(timer.locator('td.hb-peer')).toContainText('Sub, Sub2, Sub3', { timeout: 15000 });
    await expect(timer).toHaveAttribute('data-ready', '0');
    await expect(timer).toHaveAttribute('data-blockers', /相手の同名図と食い違い/);
    // 相手に同名図が無い図は「相手に無い」。保存先は primary のまま (行は自分のフォルダの 2 枚)。
    await expect(page.locator('#hb-rows tr[data-doc-name="spi_init_sequence"] td.hb-peer')).toHaveText('相手に無い');
    await expect(page.locator('#hb-rows tr[data-doc-name]')).toHaveCount(2);

    // 選んだ相手は閉じても覚えている。
    await page.locator('#hb-close').click();
    await openHandoverBoard(page);
    await expect(page.locator('#hb-peer')).toHaveValue(value);
    await expect(timer.locator('td.hb-peer')).toContainText('Sub, Sub2, Sub3', { timeout: 15000 });

    // 5 列目を押すと、自分の図を開き相手の同名図を右の枠に並べる。
    await timer.locator('td.hb-peer button.hb-peer-go').click();
    await expect(page.locator('#hb-modal')).toBeHidden();
    await expect(page.locator('#editor')).toHaveValue(/state Configured\n/, { timeout: 10000 });
    await expect(page.locator('#senior-pane')).toBeVisible();
    await expect(page.locator('#senior-dsl')).toContainText('state Sub4', { timeout: 10000 });
  });
});
