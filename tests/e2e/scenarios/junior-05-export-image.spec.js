// @ts-check
// junior 台本 手順5: Export メニューから資料に貼る画像を書き出す。
// 状態遷移図は「SVGとして保存」、他の図種は「PNG(透過背景)」。
//
// BLK-junior-20260908-2303-wish: 形式の決まりを利用者が覚えて選ぶのをやめ、
// 「資料化」で部品と図種を選ぶだけで、形式・題名の (資料用)・保存・庫までを 1 回で行う。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');
const path = require('path');

const DIR = S.dirFor(__filename);

test('手順5(状態遷移図) SVG として書き出せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, S.GPIO_STATE);
  await S.renameActive(page, 'gpio_state_doc');

  const download = await (await S.exportVia(page, 'exp-svg'));
  // 到達条件: SVG が 1 本書き出される。
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.svg$/);
  // BLK-junior-20260915-0406: 書き出し名は title (title GPIOドライバ状態遷移) ではなく
  // .puml の保存名 (図の名前) に揃うので、保存フォルダで .puml と対になる。
  expect(download.suggestedFilename()).toBe('gpio_state_doc.svg');
});

test('手順5(他の図種) PNG(透過背景)も同じメニューから選べる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, S.GPIO_SEQ);
  await S.renameActive(page, 'gpio_seq_doc');

  const download = await (await S.exportVia(page, 'exp-png-transparent'));
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  expect(download.suggestedFilename()).toBe('gpio_seq_doc.png');
});

// 「資料化」— 部品と図種を選ぶだけで、正しい形式が自動で決まる。
test('手順5 資料化: 状態遷移図を選ぶと SVG で出て、(資料用) が付いて保存フォルダにも入る', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'GPIOドライバ状態遷移', S.GPIO_STATE);
  await S.putDoc(page, DIR, 'GPIOドライバ初期化シーケンス', S.GPIO_SEQ);
  await page.reload();
  await page.waitForTimeout(800);

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-material').click();
  await page.waitForSelector('#mexp-modal', { state: 'visible' });
  await page.waitForTimeout(600);

  await page.locator('#mexp-component').selectOption('GPIOドライバ');
  await page.locator('#mexp-kind').selectOption('状態遷移図');
  await page.waitForTimeout(200);

  // 押す前に、形式と出力名が読める (覚えていなくてよい)。
  const plan = await page.locator('#mexp-plan').textContent();
  expect(plan).toContain('SVG');
  expect(plan).toContain('(資料用)');

  const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await page.locator('#mexp-run').click();
  const download = await dl;

  // 到達条件: 図種に決まった形式 (SVG) で、(資料用) の名前の 1 枚が出る。
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toBe('GPIOドライバ状態遷移(資料用).svg');

  // 保存フォルダにも資料用の版が残る (次の周に開き直せる)。
  await page.waitForTimeout(1200);
  const saved = await S.readDoc(page, DIR, 'GPIOドライバ状態遷移(資料用)');
  expect(saved).not.toBeNull();
  expect(saved).toContain('(資料用)');
});

test('手順5 資料化: シーケンス図を選ぶと PNG(透過背景)に切り替わる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'GPIOドライバ状態遷移', S.GPIO_STATE);
  await S.putDoc(page, DIR, 'GPIOドライバ初期化シーケンス', S.GPIO_SEQ);
  await page.reload();
  await page.waitForTimeout(800);

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-material').click();
  await page.waitForSelector('#mexp-modal', { state: 'visible' });
  await page.waitForTimeout(600);

  await page.locator('#mexp-component').selectOption('GPIOドライバ');
  await page.locator('#mexp-kind').selectOption('シーケンス図');
  await page.waitForTimeout(200);
  expect(await page.locator('#mexp-plan').textContent()).toContain('PNG');

  const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await page.locator('#mexp-run').click();
  const download = await dl;

  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toBe('GPIOドライバ初期化シーケンス(資料用).png');
});

// 資料化の残りが部品をまたいで見える (BLK-junior-20260914-2006-wish)。
// 部品を 1 つ選ぶまで図種の残りが見えないと、GPIO がほぼ済んでいて TIMER が
// 丸ごと未着手でも、部品欄を選び直すまで分からなかった。
test('手順4 資料化: 開いた時点で部品をまたいだ残りが読め、マスを押すと選択が合う', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'GPIOドライバ状態遷移', S.GPIO_STATE);
  await S.putDoc(page, DIR, 'GPIOドライバ状態遷移(資料用)', S.GPIO_STATE);
  await S.putDoc(page, DIR, 'TIMERドライバ状態遷移', S.GPIO_STATE);
  await S.putDoc(page, DIR, 'TIMERドライバ初期化シーケンス', S.GPIO_SEQ);
  await page.reload();
  await page.waitForTimeout(800);

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-material').click();
  await page.waitForSelector('#mexp-modal', { state: 'visible' });
  await page.waitForTimeout(800);

  // 到達条件その1: 部品を選ばなくても 2 部品の残りが 1 枚で読める。
  await expect(page.locator('#mexp-matrix-rows tr.mexp-mrow')).toHaveCount(2);
  await expect(page.locator('#mexp-matrix-summary')).toContainText('残り 2 件');
  // 残りのある TIMER が上に来る (次に着手する順)。
  await expect(page.locator('#mexp-matrix-rows tr.mexp-mrow').first())
    .toHaveAttribute('data-component', 'TIMERドライバ');
  await expect(page.locator('tr[data-component="TIMERドライバ"] td[data-kind="シーケンス図"]'))
    .toHaveAttribute('data-status', 'none');
  await expect(page.locator('tr[data-component="GPIOドライバ"] td[data-kind="状態遷移図"]'))
    .toHaveAttribute('data-status', 'fresh');

  // 到達条件その2: 未着手のマスを押すと部品欄・図種欄がそこに合う
  // (GPIO → TIMER と選び直す往復が要らない)。
  await page.locator('tr[data-component="TIMERドライバ"] td[data-kind="シーケンス図"]').click();
  await page.waitForTimeout(300);
  await expect(page.locator('#mexp-component')).toHaveValue('TIMERドライバ');
  await expect(page.locator('#mexp-kind')).toHaveValue('シーケンス図');
  await expect(page.locator('#mexp-plan')).toContainText('(資料用)');
  await expect(page.locator('#mexp-run')).toBeEnabled();
});

// 貼付先の見出し (BLK-junior-20260914-2106-wish)。資料化した画像が設計書のどの
// 見出しに貼るものかを GUI が覚えないため、ファイル名から毎回思い出していた。
// マスに 1 回登録すれば残り、設計書側から「この見出しの最新画像はどれか」を引ける。
test('手順5 資料化: マスに貼付先の見出しを登録すると、見出しから最新画像を逆引きできる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'GPIOドライバ状態遷移', S.GPIO_STATE);
  await S.putDoc(page, DIR, 'GPIOドライバ状態遷移(資料用)', S.GPIO_STATE);
  await S.putDoc(page, DIR, 'TIMERドライバ状態遷移', S.GPIO_STATE.replace(/Gpio/g, 'Timer'));
  await page.reload();
  await page.waitForTimeout(800);

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-material').click();
  await page.waitForSelector('#mexp-modal', { state: 'visible' });
  await page.waitForTimeout(900);

  // 開いた時点では 1 マスも登録されていない (何マス残っているかが読める)。
  await expect(page.locator('#mexp-anchor-summary')).toContainText('未登録');

  // 到達条件その1: マスを押して見出しを入れると、そのマスに残る。
  await page.locator('tr[data-component="GPIOドライバ"] td[data-kind="状態遷移図"]').click();
  await page.waitForTimeout(300);
  await page.locator('#mexp-anchor').fill('4.3 状態遷移');
  await page.locator('#mexp-anchor').blur();
  await page.waitForTimeout(400);
  await expect(page.locator('tr[data-component="GPIOドライバ"] td[data-kind="状態遷移図"]'))
    .toHaveAttribute('data-anchored', '1');
  // 押す前に「どの節に貼る画像を作るのか」が計画の行から読める。
  await expect(page.locator('#mexp-plan')).toContainText('貼付先 4.3 状態遷移');

  await page.locator('tr[data-component="TIMERドライバ"] td[data-kind="状態遷移図"]').click();
  await page.waitForTimeout(300);
  await expect(page.locator('#mexp-anchor')).toHaveValue('');   // マスごとに別の貼付先
  await page.locator('#mexp-anchor').fill('4.2 タイマ状態遷移');
  await page.locator('#mexp-anchor').blur();
  await page.waitForTimeout(400);
  await expect(page.locator('#mexp-anchor-summary')).toContainText('2 マスすべて登録済み');

  // 到達条件その2: 設計書の見出しの順に「そこへ貼る画像」が引ける。
  await page.locator('#mexp-anchor-toggle').click();
  await page.waitForTimeout(400);
  const rows = page.locator('#mexp-lookup-rows tr.mexp-lrow');
  await expect(rows).toHaveCount(2);
  await expect(rows.first().locator('td.mexp-lhead')).toHaveText('4.2 タイマ状態遷移');
  // 画像がまだ無い見出しは、貼ってから気付かないようにそう書く。
  await expect(rows.first()).toHaveAttribute('data-status', 'none');
  await expect(rows.first().locator('td.mexp-lfile')).toHaveText('まだありません');
  await expect(rows.nth(1).locator('td.mexp-lfile')).toHaveText('GPIOドライバ状態遷移(資料用).svg');

  // 到達条件その3: 対応はこの端末に残り、開き直しても思い出し直しが要らない
  // (spec の起動は毎回 localStorage を消して開くので、残っていることは
  //  保存の中身と、閉じて開き直した画面の両方で確かめる)。
  const stored = await page.evaluate(() => window.localStorage.getItem('plantuml-material-anchors'));
  expect(stored).toContain('4.2 タイマ状態遷移');
  expect(stored).toContain('4.3 状態遷移');

  await page.locator('#mexp-close').click();
  await page.waitForTimeout(300);
  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-material').click();
  await page.waitForSelector('#mexp-modal', { state: 'visible' });
  await page.waitForTimeout(900);
  await expect(page.locator('#mexp-anchor-summary')).toContainText('2 マスすべて登録済み');
  await expect(page.locator('tr[data-component="TIMERドライバ"] td[data-kind="状態遷移図"]'))
    .toHaveAttribute('data-heading', '4.2 タイマ状態遷移');
});

// 「部品の資料一式」— 設計書に貼る資料は 1 部品の複数図種で 1 組。
// BLK-junior-20260909-0003-wish: どの図種の資料用がまだ無いか・元の図が資料用より
// 新しくないかを一覧で見せ、手当ての要る図種だけをまとめて 1 回で書き出す。
const GPIO_CLASS = [
  '@startuml',
  'title GPIOドライバ派生クラス',
  'class Gpio_Driver {',
  '  + Init() : void',
  '}',
  'class Gpio_PortDrv',
  'Gpio_Driver <|-- Gpio_PortDrv',
  '@enduml',
].join('\n');

async function openMaterialBoard(page) {
  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-material-board').click();
  await page.waitForSelector('#mboard-modal', { state: 'visible' });
  await page.waitForTimeout(700);
  await page.locator('#mboard-component').selectOption('GPIOドライバ');
  await page.waitForTimeout(200);
}

// 前周までの成果物の並び: 状態遷移は資料用が最新、シーケンスは元のほうが新しい、
// クラス図は資料用がまだ無い。mtime は 1 秒刻みなので、間を置いて置き直す。
async function setupBoardFixture(page) {
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'GPIOドライバ初期化シーケンス(資料用)', S.GPIO_SEQ);
  await S.putDoc(page, DIR, 'GPIOドライバ状態遷移', S.GPIO_STATE);
  await page.waitForTimeout(1500);
  await S.putDoc(page, DIR, 'GPIOドライバ初期化シーケンス', S.GPIO_SEQ);
  await S.putDoc(page, DIR, 'GPIOドライバ状態遷移(資料用)', S.GPIO_STATE);
  await S.putDoc(page, DIR, 'GPIOドライバ派生クラス', GPIO_CLASS);
  await page.reload();
  await page.waitForTimeout(800);
}

test('手順1 資料一式: 部品を選ぶと、資料用が無い図種・元が新しい図種が一覧で分かる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await setupBoardFixture(page);
  await openMaterialBoard(page);

  // 到達条件: 3 図種が並び、状態が行ごとに読める (名前と日時を読み比べなくてよい)。
  await expect(page.locator('#mboard-rows tr.mboard-row')).toHaveCount(3);
  await expect(page.locator('tr.mboard-row[data-kind="クラス図"]')).toHaveAttribute('data-status', 'none');
  await expect(page.locator('tr.mboard-row[data-kind="シーケンス図"]')).toHaveAttribute('data-status', 'stale');
  await expect(page.locator('tr.mboard-row[data-kind="状態遷移図"]')).toHaveAttribute('data-status', 'fresh');
  await expect(page.locator('#mboard-summary')).toContainText('2 図種の資料化が要ります');

  // 形式は図種で決まっている (利用者は覚えなくてよい)。
  await expect(page.locator('tr.mboard-row[data-kind="状態遷移図"] td.mboard-format')).toHaveText('SVG');
  await expect(page.locator('tr.mboard-row[data-kind="クラス図"] td.mboard-format')).toContainText('PNG');

  // 既定で選ばれているのは手当ての要る 2 図種だけ (最新の図は描き直さない)。
  await expect(page.locator('tr.mboard-row[data-kind="クラス図"] input.mboard-check')).toBeChecked();
  await expect(page.locator('tr.mboard-row[data-kind="シーケンス図"] input.mboard-check')).toBeChecked();
  await expect(page.locator('tr.mboard-row[data-kind="状態遷移図"] input.mboard-check')).not.toBeChecked();
  await expect(page.locator('#mboard-run')).toContainText('2 図種');
});

test('手順3〜5 資料一式: 選んだ図種をまとめて 1 回で資料化できる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await setupBoardFixture(page);
  await openMaterialBoard(page);

  const files = [];
  page.on('download', (d) => files.push(d.suggestedFilename()));
  await page.locator('#mboard-run').click();
  await expect(page.locator('#mboard-state')).toContainText('資料化しました', { timeout: 90000 });

  // 到達条件その1: 図種ごとに決まった形式で 2 枚が出る (クラス図=PNG、シーケンス=PNG)。
  expect(files.sort()).toEqual([
    'GPIOドライバ初期化シーケンス(資料用).png',
    'GPIOドライバ派生クラス(資料用).png',
  ]);

  // 到達条件その2: 資料用の版が保存フォルダにも残る (次の周に開き直せる)。
  const saved = await S.readDoc(page, DIR, 'GPIOドライバ派生クラス(資料用)');
  expect(saved).not.toBeNull();
  expect(saved).toContain('(資料用)');

  // 到達条件その3: 出したあとは一覧がその場で「最新」に変わる (確かめ直しが要らない)。
  await expect(page.locator('#mboard-summary')).toContainText('すべて最新');
  await expect(page.locator('tr.mboard-row[data-kind="クラス図"]')).toHaveAttribute('data-status', 'fresh');
});

// 「要求ID対応」— 図の要素と設計書の ASPICE 要求 ID (SWReq-xxx) の対応。
// BLK-junior-20260909-0103-wish: 手順5 は「画像を書き出す」だけでなく
// 「要求ID対応表も同時に確定させる」に変わる。図を作った後で別文書に
// 対応表を作り直す二度手間を無くす。
async function openReqTrace(page) {
  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-req-trace').click();
  await page.waitForSelector('#req-modal', { state: 'visible' });
  await page.waitForTimeout(300);
}

test('手順5 要求ID対応: クラス図の要素が一覧に出て、要求IDを付けると図に残る', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, GPIO_CLASS);
  await S.renameActive(page, 'GPIOドライバ派生クラス');
  await openReqTrace(page);

  // 到達条件その1: 要求 ID を付けられる要素 (クラス・メソッド) が並ぶ。
  await expect(page.locator('tr.req-row[data-key="Gpio_Driver"]')).toHaveCount(1);
  await expect(page.locator('tr.req-row[data-key="Gpio_Driver.Init()"]')).toHaveCount(1);
  await expect(page.locator('#req-summary')).toContainText('要求 ID が付いています');

  // 到達条件その2: 付けた対応は図 (DSL) に残る — 別文書を作らない。
  await page.locator('tr.req-row[data-key="Gpio_Driver.Init()"] input.req-ids').fill('SWReq-101, SWReq-102');
  await page.locator('tr.req-row[data-key="Gpio_Driver.Init()"] input.req-ids').blur();
  await page.waitForTimeout(400);
  await expect(page.locator('tr.req-row[data-key="Gpio_Driver.Init()"]')).toHaveAttribute('data-status', 'assigned');
  const dsl = await page.locator('#editor').inputValue();
  expect(dsl).toContain("' @req Gpio_Driver.Init() = SWReq-101, SWReq-102");
  // 付け忘れは一覧のまま残る (どれが残っているかが読める)。
  await expect(page.locator('#req-summary')).toContainText('残り');
});

test('手順5 要求ID対応: 画像と一緒に対応表(CSV)が書き出せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, GPIO_CLASS);
  await S.renameActive(page, 'GPIOドライバ派生クラス');
  await openReqTrace(page);

  await page.locator('tr.req-row[data-key="Gpio_Driver.Init()"] input.req-ids').fill('SWReq-101');
  await page.locator('tr.req-row[data-key="Gpio_Driver.Init()"] input.req-ids').blur();
  await page.waitForTimeout(300);

  const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await page.locator('#req-export').click();
  const download = await dl;

  // 到達条件: 画像と並ぶ名前の対応表が 1 本出る。
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toBe('GPIOドライバ派生クラス_要求対応表.csv');
});

test('手順5 要求ID対応: 脚注に入れると、書き出す画像そのものが対応表を持つ', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, GPIO_CLASS);
  await S.renameActive(page, 'GPIOドライバ派生クラス');
  await openReqTrace(page);

  await page.locator('tr.req-row[data-key="Gpio_Driver.Init()"] input.req-ids').fill('SWReq-101');
  await page.locator('tr.req-row[data-key="Gpio_Driver.Init()"] input.req-ids').blur();
  await page.waitForTimeout(300);
  await page.locator('#req-footnote').check();
  await page.waitForTimeout(500);

  // 到達条件: 図に脚注が入り、描画も通る (画像だけを貼っても対応が伝わる)。
  const dsl = await page.locator('#editor').inputValue();
  expect(dsl).toContain('legend bottom');
  expect(dsl).toContain('Gpio_Driver.Init() : SWReq-101');
  await page.waitForTimeout(1500);
  await expect(page.locator('#preview-svg svg')).toBeVisible();

  // 外せば元に戻る (脚注入りのまま配り続けない)。
  await page.locator('#req-footnote').uncheck();
  await page.waitForTimeout(400);
  expect(await page.locator('#editor').inputValue()).not.toContain('legend bottom');
});

// BLK-junior-20260914-2006: 「1 枚を資料化」の部品欄は先頭の部品で開き、図種欄には
// その部品の図種しか出ない。ほぼ資料化済みの GPIO が先頭に来ていると、実際に手を
// 付けるべき TIMER (全図種未着手) は部品欄を 1 つずつ選び直して図種欄を見るまで
// 分からなかった。残りは開いた時点で部品欄に出し、残りの多い部品を選んでおく。
test('手順4 資料化: 開いた時点で部品ごとの残りが読め、手当ての要る部品が選ばれている', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // GPIO は資料化済み、TIMER は 2 図種とも未着手 (起票時の形)。
  await S.putDoc(page, DIR, 'GPIOドライバ状態遷移', S.GPIO_STATE);
  await S.putDoc(page, DIR, 'GPIOドライバ状態遷移(資料用)', S.GPIO_STATE);
  await S.putDoc(page, DIR, 'TIMERドライバ初期化シーケンス', S.GPIO_SEQ.replace(/Gpio/g, 'Timer'));
  await S.putDoc(page, DIR, 'TIMERドライバ状態遷移', S.GPIO_STATE.replace(/Gpio/g, 'Timer'));
  await page.reload();
  await page.waitForTimeout(800);

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-material').click();
  await page.waitForSelector('#mexp-modal', { state: 'visible' });
  await page.waitForTimeout(900);

  // 到達条件その1: 部品欄の各行が残り件数を持つ (選び直さずに読める)。
  const comp = page.locator('#mexp-component');
  const timer = comp.locator('option[value="TIMERドライバ"]');
  await expect(timer).toHaveAttribute('data-pending', '2');
  await expect(timer).toHaveText(/資料化が要る 2 \/ 2 図種/);
  await expect(comp.locator('option[value="GPIOドライバ"]')).toHaveAttribute('data-pending', '0');

  // 到達条件その2: 全部品を見渡した残りが 1 行で出る。
  await expect(page.locator('#mexp-progress')).toContainText('TIMERドライバ 2');

  // 到達条件その3: 残りの多い部品が選ばれた状態で開く (GPIO のまま開かない)。
  await expect(comp).toHaveValue('TIMERドライバ');

  // 到達条件その4: 図種欄も未着手が選ばれ、済んだ図種には印が付く。
  await expect(page.locator('#mexp-kind option').first()).toHaveAttribute('data-status', 'none');
  const plan = await page.locator('#mexp-plan').textContent();
  expect(plan).toContain('TIMERドライバ');
});

// BLK-junior-20260914-2106: 図種欄に［未］／［済］の印は付いたが、並びは図番号順の
// ままだった。欲しい図種 (状態遷移図) を上から目で探して印を読み比べる必要が残る。
// 手当ての要る図種を先頭にまとめ、済んだ図種は最後尾に送る。
test('手順5 資料化: 図種欄は［未］の図種が先頭にまとまり、［済］が最後に来る', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // シーケンス図だけ資料化済み (資料用を後に書くので元より新しい = ［済］)。
  await S.putDoc(page, DIR, 'GPIOドライバ初期化シーケンス', S.GPIO_SEQ);
  await S.putDoc(page, DIR, 'GPIOドライバ状態遷移', S.GPIO_STATE);
  await S.putDoc(page, DIR, 'GPIOドライバ初期化シーケンス(資料用)', S.GPIO_SEQ);
  await page.reload();
  await page.waitForTimeout(800);

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-material').click();
  await page.waitForSelector('#mexp-modal', { state: 'visible' });
  await page.waitForTimeout(900);

  await page.locator('#mexp-component').selectOption('GPIOドライバ');
  await page.waitForTimeout(500);

  // 到達条件その1: 図番号順ならシーケンス図が先だが、［未］の状態遷移図が先頭に来る。
  const opts = page.locator('#mexp-kind option');
  await expect(opts.first()).toHaveAttribute('data-status', 'none');
  await expect(opts.first()).toHaveText(/状態遷移図/);
  // 到達条件その2: ［済］は最後尾にまとまる (上から読んで最初に当たるのが手当て先)。
  await expect(opts.last()).toHaveAttribute('data-status', 'fresh');
  await expect(opts.last()).toHaveText(/シーケンス図/);

  // 到達条件その3: 並べ替えても選択と計画は崩れない (先頭の未着手が選ばれている)。
  await expect(page.locator('#mexp-kind')).toHaveValue('状態遷移図');
  await expect(page.locator('#mexp-plan')).toContainText('SVG');
  await expect(page.locator('#mexp-run')).toBeEnabled();
});

// BLK-junior-20260914-2206: 部品欄に「TIMERドライバ（資料化が要る 2/5 図種）」と
// 「TimerDrv派生クラス（資料化が要る 1/1 図種）」が並ぶと、先頭が似ている
// (ローマ字表記かカナ表記かの差しかない) ので上を選んでしまう。図種欄を開いて
// 目当ての「クラス図」が無いと分かってから選び直す — そのまま押していれば
// 無関係な画像を上書き書き出しするところだった。部品欄の行に図種名を並べる。
test('手順4 資料化: 部品欄の行で、その部品がどの図種を持つかが読める', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // 起票時の形。TIMERドライバ はシーケンスと状態遷移だけで、クラス図を持たない。
  await S.putDoc(page, DIR, 'TIMERドライバ初期化シーケンス', S.GPIO_SEQ.replace(/Gpio/g, 'Timer'));
  await S.putDoc(page, DIR, 'TIMERドライバ状態遷移', S.GPIO_STATE.replace(/Gpio/g, 'Timer'));
  await S.putDoc(page, DIR, 'TimerDrv派生クラス', S.GPIO_CLASS
    ? S.GPIO_CLASS.replace(/Gpio/g, 'Timer')
    : ['@startuml', 'class Timer_Driver {', '  +Timer_Init()', '}', '@enduml'].join('\n'));
  await page.reload();
  await page.waitForTimeout(800);

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-material').click();
  await page.waitForSelector('#mexp-modal', { state: 'visible' });
  await page.waitForTimeout(900);

  const comp = page.locator('#mexp-component');
  const timer = comp.locator('option[value="TIMERドライバ"]');
  const drv = comp.locator('option[value="TimerDrv"]');

  // 到達条件その1: どちらの行にも図種名が並ぶ。
  await expect(timer).toHaveText(/シーケンス図/);
  await expect(timer).toHaveText(/状態遷移図/);
  await expect(drv).toHaveText(/クラス図/);

  // 到達条件その2: 「クラス図」を持つのはどちらか が、選ぶ前に読んで分かる。
  expect(await timer.textContent()).not.toContain('クラス図');
  expect(await drv.textContent()).toContain('クラス図');

  // 到達条件その3: 部品欄で読んだ図種の並びが、選んだ先の図種欄の並びと同じ。
  await comp.selectOption('TIMERドライバ');
  await page.waitForTimeout(500);
  const label = await timer.textContent();
  const listed = label.slice(label.indexOf('：') + 1).replace(/）$/, '').split('・');
  const kinds = await page.locator('#mexp-kind option').allTextContents();
  // 図種欄は印と形式 (［未］シーケンス図（PNG（透過背景））) を添えるので、図種名だけに揃える。
  expect(kinds.map((t) => t.replace(/^［.］\s*/, '').replace(/（.*$/, '').trim())).toEqual(listed);
});

// BLK-junior-20260915-0007: 資料化は押した直後にモーダルが閉じ、根拠は一瞬出る
// トーストだけだった。見落とすと「保存先に置けたか」を確かめる手段がモーダルに
// 残らず、📂一覧を開き直して名前で探すまで確信が持てない (資料化 1 枚ごとに
// フォルダタブ → フィルタ入力 → クリック が付く)。実行してもモーダルは閉じず、
// 保存先の一覧を読み直した結果がその場に残る。
const TIMER_ACTIVITY = [
  '@startuml',
  'title TIMERドライバ初期化アクティビティ',
  'start',
  ':クロックを有効化;',
  ':プリスケーラを設定;',
  ':割り込みを許可;',
  'stop',
  '@enduml',
].join('\n');

test('手順5 資料化: 実行後もモーダルが閉じず、保存先に置けたことがその場に残る', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'TIMERドライバ初期化アクティビティ', TIMER_ACTIVITY);
  await page.reload();
  await page.waitForTimeout(800);

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-material').click();
  await page.waitForSelector('#mexp-modal', { state: 'visible' });
  await page.waitForTimeout(600);

  // 押す前に根拠欄は出ていない (前の回の確認が残っていると読み違える)。
  await expect(page.locator('#mexp-result')).toBeHidden();

  // 残りの表のマスを押して選ぶ (部品欄の名は図名の括りで決まるので、表から選ぶ)。
  await page.locator('#mexp-matrix-rows td.mexp-cell[data-kind="アクティビティ図"]').first().click();
  await page.waitForTimeout(300);
  await expect(page.locator('#mexp-kind')).toHaveValue('アクティビティ図');
  await expect(page.locator('#mexp-run')).toBeEnabled();

  const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await page.locator('#mexp-run').click();
  await dl;

  // 到達条件その1: モーダルは閉じず、保存先に置けたことが名前つきで残る。
  const result = page.locator('#mexp-result');
  await expect(result).toBeVisible({ timeout: 20000 });
  await expect(result).toHaveAttribute('data-verified', '1', { timeout: 20000 });
  await expect(page.locator('#mexp-modal')).toBeVisible();
  await expect(page.locator('#mexp-result-text'))
    .toContainText('TIMERドライバ初期化アクティビティ(資料用).puml を置けました');
  // 保存先フォルダも名指しされる (どこに置けたかを覚えていなくてよい)。
  await expect(page.locator('#mexp-result-text')).toContainText(path.basename(S.dirFor(__filename)));

  // 根拠は実物と合っている (一覧を開き直さずに済むのは、これが実測だから)。
  const saved = await S.readDoc(page, DIR, 'TIMERドライバ初期化アクティビティ(資料用)');
  expect(saved).toContain('(資料用)');

  // 到達条件その2: そのまま次の 1 枚を続けられ、根拠は新しい図に入れ替わる。
  await page.locator('#mexp-result-open').click();
  await expect(page.locator('#mexp-modal')).toBeHidden();
  await expect(page.locator('#folder-panel')).toHaveClass(/open/);
  await expect(page.locator('#folder-filter'))
    .toHaveValue('TIMERドライバ初期化アクティビティ(資料用)');
});

// 部品単位の一括資料化 (BLK-junior-20260915-0106-wish)。表で「TIMER に 3 図種
// 残っている」と読めても、資料化は 1 マスずつ (マスを押す → 資料化する) しか
// できず、図種の数だけ同じ往復を繰り返していた。設計書に貼るのは部品の資料一式
// なので、行の一括ボタン 1 押しで、その部品の未/古の図種を全部まとめて出す。
test('手順4 資料化: 部品の行を 1 押しで、未/古の図種をまとめて資料化できる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // TIMER は 3 図種 (うち状態遷移は資料用が既にあり最新)、GPIO は 1 図種。
  await S.putDoc(page, DIR, 'TIMERドライバ初期化シーケンス', S.GPIO_SEQ.replace(/Gpio/g, 'Timer'));
  await S.putDoc(page, DIR, 'TIMERドライバ初期化アクティビティ', TIMER_ACTIVITY);
  await S.putDoc(page, DIR, 'TIMERドライバ状態遷移', S.GPIO_STATE.replace(/Gpio/g, 'Timer'));
  await S.putDoc(page, DIR, 'TIMERドライバ状態遷移(資料用)', S.GPIO_STATE.replace(/Gpio/g, 'Timer'));
  await S.putDoc(page, DIR, 'GPIOドライバ状態遷移', S.GPIO_STATE);
  await page.reload();
  await page.waitForTimeout(800);

  await page.locator('#btn-export').click();
  await page.waitForSelector('#export-menu', { state: 'visible' });
  await page.locator('#exp-material').click();
  await page.waitForSelector('#mexp-modal', { state: 'visible' });
  await page.waitForTimeout(900);

  // 到達条件その1: 押す前に、その行で何図種出るかがボタンから読める
  // (図種欄を開いて数え直さなくてよい)。
  const timerRun = page.locator('tr[data-component="TIMERドライバ"] button.mexp-row-run');
  await expect(timerRun).toHaveText('残り 2 図種をまとめて資料化');
  await expect(timerRun).toBeEnabled();

  // 到達条件その2: 1 押しで 2 図種ぶんが出る (図種を選び直さない)。
  await timerRun.click();
  await expect(page.locator('#mexp-state'))
    .toContainText('2 図種をまとめて資料化しました', { timeout: 60000 });
  await expect(page.locator('#mexp-state')).toContainText('TIMERドライバ');

  // 到達条件その3: 出たのは未/古の図種だけで、形式は図種の決まりどおり。
  await page.waitForTimeout(1200);
  expect(await S.readDoc(page, DIR, 'TIMERドライバ初期化シーケンス(資料用)')).not.toBeNull();
  expect(await S.readDoc(page, DIR, 'TIMERドライバ初期化アクティビティ(資料用)')).not.toBeNull();
  // 最新だった状態遷移は出し直さない (GPIO も巻き込まない)。
  expect(await S.readDoc(page, DIR, 'GPIOドライバ状態遷移(資料用)')).toBeNull();

  // 到達条件その4: 表はその場で描き直され、TIMER の行に残りが無くなる
  // (📂一覧へ確かめに戻らなくてよい)。
  await expect(page.locator('tr[data-component="TIMERドライバ"] button.mexp-row-run'))
    .toHaveText('すべて最新', { timeout: 20000 });
  await expect(page.locator('tr[data-component="TIMERドライバ"] button.mexp-row-run')).toBeDisabled();
});
