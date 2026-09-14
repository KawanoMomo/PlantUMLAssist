// @ts-check
// junior 台本 手順5: Export メニューから資料に貼る画像を書き出す。
// 状態遷移図は「SVGとして保存」、他の図種は「PNG(透過背景)」。
//
// BLK-junior-20260908-2303-wish: 形式の決まりを利用者が覚えて選ぶのをやめ、
// 「資料化」で部品と図種を選ぶだけで、形式・題名の (資料用)・保存・庫までを 1 回で行う。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順5(状態遷移図) SVG として書き出せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, S.GPIO_STATE);
  await S.renameActive(page, 'gpio_state_doc');

  const download = await (await S.exportVia(page, 'exp-svg'));
  // 到達条件: SVG が 1 本書き出される。
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.svg$/);
});

test('手順5(他の図種) PNG(透過背景)も同じメニューから選べる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.typeDsl(page, S.GPIO_SEQ);
  await S.renameActive(page, 'gpio_seq_doc');

  const download = await (await S.exportVia(page, 'exp-png-transparent'));
  expect(download).not.toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.png$/);
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
