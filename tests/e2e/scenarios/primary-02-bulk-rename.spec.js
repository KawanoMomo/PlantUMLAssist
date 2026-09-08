// @ts-check
// primary 台本 手順2: 全図横断で部品名 SpiDrv を Spi_Driver に統一する(⇄ 一括置換・全図適用)。
// 台本の主戦場。手順10 の手数の計測もこの操作を対象にしている。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順2 一括置換の全図適用で、旧名 SpiDrv が全図から消える', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, DIR, n, S.docFor(n, 'SpiDrv'));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  // BLK-primary-20260909-0303: ⇄ 一括置換は既定でタブ列から畳まれている (design 7b)。
  // 台本の主戦場なので、メニューを辿らず Ctrl+K でコマンド名も打たずに開ける。
  await page.keyboard.press('Control+h');
  await page.waitForSelector('#rename-panel.open', { timeout: 5000 });

  const allDocs = page.locator('#rename-all-docs');
  await expect(allDocs).toHaveCount(1);
  if (!(await allDocs.isChecked())) await allDocs.check();
  await page.locator('#rename-from').fill('SpiDrv');
  await page.locator('#rename-to').fill('Spi_Driver');
  await page.waitForTimeout(900);

  // 到達条件その1: 影響プレビューが横断のヒット数を出す(0 件なら適用ボタンは無効)。
  const folder = page.locator('#rename-folder');
  await expect(folder).toContainText('spi_init_sequence');

  const apply = page.locator('#btn-rename-apply');
  await expect(apply).toBeEnabled();
  await apply.click();
  await page.waitForTimeout(1500);

  // 到達条件その2: 保存先の図から旧名が消え、新名になっている。
  const seq = await S.readDoc(page, DIR, 'spi_init_sequence');
  expect(seq).toContain('Spi_Driver');
  expect(seq).not.toContain('SpiDrv ');
});

// BLK-primary-20260908-2003-wish: 置換の前に「この名前はどの図から参照されているか」を
// 各図を開いて目視で推測していた。◈ 依存グラフ で参照元・参照先と、連鎖で影響が
// 届く図までを開かずに数える。
test('手順2 依存グラフが、置換する部品名の参照元・参照先と影響の届く図を出す', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, DIR, n, S.docFor(n, 'SpiDrv'));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  await S.runCommand(page, '一括置換');
  await page.locator('#rename-from').fill('SpiDrv');
  await page.waitForTimeout(900);

  await page.locator('#btn-rename-depgraph').click();
  await page.waitForSelector('#dg-modal', { state: 'visible' });
  await page.waitForTimeout(600);

  // 到達条件その1: 打った名前が中央に立ち、参照元と参照先が矢印で分かれている。
  const center = page.locator('#dg-svg .dg-node[data-side="center"]');
  await expect(center).toHaveAttribute('data-name', 'SpiDrv');
  await expect(page.locator('#dg-svg .dg-node[data-side="out"][data-name="Hw_Ctrl"]')).toHaveCount(1);
  await expect(page.locator('#dg-svg .dg-node[data-side="in"][data-name="Hw_Ctrl"]')).toHaveCount(1);
  const edges = page.locator('#dg-svg line.dg-edge');
  expect(await edges.count()).toBeGreaterThan(1);
  await expect(page.locator('#dg-summary')).toContainText('SpiDrv');

  // 到達条件その2: 開かずに「直す図」が数えられる。矢印を持たない共通クラス図
  // (class SpiDrv と書いてあるだけ) も直接の対象として並ぶ。
  const direct = page.locator('#dg-impact tr.dg-doc[data-hop="0"]');
  await expect(direct.filter({ hasText: 'spi_init_sequence' })).toHaveCount(1);
  await expect(direct.filter({ hasText: 'driver_common_class' })).toHaveCount(1);

  // 到達条件その3: 見た名前をそのまま置換の的にできる (打ち直さない)。
  await page.locator('#dg-name').selectOption('Hw_Ctrl');
  await page.waitForTimeout(400);
  await page.locator('#dg-use').click();
  await expect(page.locator('#dg-modal')).toBeHidden();
  await expect(page.locator('#rename-from')).toHaveValue('Hw_Ctrl');
});

// BLK-primary-20260909-0603-wish: 依存グラフで洗った影響一覧はモーダルを閉じると消える。
// 仕様変更は複数 run にまたがるので、「何枚中どこまで直したか」を持ち越す先が要る。
// 影響一覧を変更チケットにして保存フォルダに残し、次の run は札の未チェックだけを見る。
test('手順2 洗った影響一覧を変更チケットにすると、run をまたいで続きから直せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.clearTickets(page, DIR);
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, DIR, n, S.docFor(n, 'SpiDrv'));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  await S.runCommand(page, '一括置換');
  await page.locator('#rename-from').fill('SpiDrv');
  await page.waitForTimeout(900);
  await page.locator('#btn-rename-depgraph').click();
  await page.waitForSelector('#dg-modal', { state: 'visible' });
  await page.waitForTimeout(600);

  const impactCount = await page.locator('#dg-impact tr.dg-doc').count();
  expect(impactCount).toBeGreaterThan(1);

  // 到達条件その1: 見ているその場で札にできる (閉じて開き直させない)。
  await page.locator('#dg-ticket').click();
  await page.waitForSelector('#ct-modal', { state: 'visible' });
  await expect(page.locator('#dg-modal')).toBeHidden();
  const items = page.locator('#ct-body tr.ct-item');
  await expect(items).toHaveCount(impactCount);
  await expect(page.locator('#ct-summary')).toContainText('SpiDrv の仕様変更');
  await expect(page.locator('#ct-progress-text')).toContainText('0 / ' + impactCount);

  // 到達条件その2: 直した図に印を立てると、残りが減る。
  const first = items.filter({ hasText: 'spi_init_sequence' }).first();
  await first.locator('input.ct-done').check();
  await page.waitForTimeout(600);
  await expect(page.locator('#ct-progress-text')).toContainText('1 / ' + impactCount);

  // 到達条件その3: 次の run (= 読み込み直し) でも札と印が残っていて、
  // 依存グラフを開き直さずに続きから直せる。
  await page.reload();
  await page.waitForSelector('#preview-svg');
  await S.runCommand(page, '変更チケット');
  await page.waitForSelector('#ct-modal', { state: 'visible' });
  await page.waitForTimeout(800);
  await expect(page.locator('#ct-progress-text')).toContainText('1 / ' + impactCount);
  await expect(page.locator('#ct-body tr.ct-item[data-done="1"]')).toHaveCount(1);
  await expect(page.locator('#ct-body tr.ct-item[data-done="1"]')).toContainText('spi_init_sequence');
});
