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

// BLK-primary-20260914-1106-friction: 同じ組を当て直す運用では、旧称がもう残って
// いないことを確かめるためだけに SpiDrv / Spi_Driver を毎回打ち直していた
// (ヒット 0 件は打ち終えてからしか出ない)。パネルを開いた時点で過去の組と
// 今の残存件数が並び、残っている組は 1 クリックで置換前・置換後に入る。
test('手順2 過去に当てた置換の組が、打つ前に「適用済み / 残り N 件」で分かる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, DIR, n, S.docFor(n, 'SpiDrv'));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  // 1 回目は今までどおり打って当てる (ここで履歴に組が残る)。
  await page.keyboard.press('Control+h');
  await page.waitForSelector('#rename-panel.open', { timeout: 5000 });
  await page.locator('#rename-from').fill('SpiDrv');
  await page.locator('#rename-to').fill('Spi_Driver');
  await page.waitForTimeout(900);
  await page.locator('#btn-rename-apply').click();
  await page.waitForTimeout(1500);

  // 到達条件その1: 開き直すと、打つ前から「適用済み」と分かる (空打ちが要らない)。
  await page.keyboard.press('Control+h');
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+h');
  await page.waitForSelector('#rename-panel.open', { timeout: 5000 });
  await page.waitForTimeout(900);
  const row = page.locator('#rename-redo-rows button.rr-row[data-from="SpiDrv"][data-to="Spi_Driver"]');
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute('data-state', 'done');
  await expect(row).toHaveAttribute('data-remaining', '0');
  await expect(page.locator('#rename-redo-summary')).toContainText('適用済み');
  // 打っていないので、置換前の欄はまだ空のまま。
  await expect(page.locator('#rename-from')).toHaveValue('');

  // 旧称が戻った状態 (別の担当者が古い綴りで書いた図を足した等) を作る。
  await page.locator('#rename-from').fill('Spi_Driver');
  await page.locator('#rename-to').fill('SpiDrv');
  await page.waitForTimeout(900);
  await page.locator('#btn-rename-apply').click();
  await page.waitForTimeout(1500);

  // 到達条件その2: 残っている組は「残り N 件」で出て、押すだけで置換に進める。
  await page.waitForTimeout(600);
  const back = page.locator('#rename-redo-rows button.rr-row[data-from="SpiDrv"][data-to="Spi_Driver"]');
  await expect(back).toHaveAttribute('data-state', 'pending');
  await expect(page.locator('#rename-redo-summary')).toContainText('残っています');
  await back.click();
  await page.waitForTimeout(600);
  await expect(page.locator('#rename-from')).toHaveValue('SpiDrv');
  await expect(page.locator('#rename-to')).toHaveValue('Spi_Driver');
  await expect(page.locator('#btn-rename-apply')).toBeEnabled();
});

// BLK-primary-20260914-1306-friction: 上のケースは「当たった置換」が履歴に残ることに
// 頼っている。primary の実運用ではもう全図が置換済みでヒット 0 件なので [適用] に
// 届かず、組はどこにも残らないまま毎回 SpiDrv / Spi_Driver を打ち直していた
// (clicks=4 / keys=18 が下がらない下限)。組は図と同じく保存フォルダの持ち物として
// 残し、ブラウザが変わっても次の run は押すだけで済むようにする。
test('手順2 ヒット 0 件で打った組も保存フォルダに残り、次の run は打鍵ゼロで呼べる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // 最初から全図 Spi_Driver (= 前の run までに置換し終えている状態)。
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, DIR, n, S.docFor(n, 'Spi_Driver'));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  await page.keyboard.press('Control+h');
  await page.waitForSelector('#rename-panel.open', { timeout: 5000 });
  await page.locator('#rename-from').fill('SpiDrv');
  await page.locator('#rename-to').fill('Spi_Driver');
  await page.waitForTimeout(900);
  // ヒット 0 件なので [適用] も [▤ 影響を見る] も押せない。ここが起票の状況。
  await expect(page.locator('#btn-rename-apply')).toBeDisabled();
  // 打ち終わり (欄から離れる) の時点で組を覚える。
  await page.locator('#rename-to').blur();
  await page.waitForTimeout(900);

  // 別のブラウザ・別のプロファイルで開き直した状況を作る。localStorage の
  // 改名履歴は消えるが、フォルダ側の組は図と一緒に残っているはず。
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.waitForSelector('#preview-svg');
  await page.keyboard.press('Control+h');
  await page.waitForSelector('#rename-panel.open', { timeout: 5000 });
  await page.waitForTimeout(1200);

  const row = page.locator('#rename-redo-rows button.rr-row[data-from="SpiDrv"][data-to="Spi_Driver"]');
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute('data-remaining', '0');
  // 到達条件: 1 クリックで置換前・置換後が入る (from/to の打鍵は 0)。
  await row.click();
  await page.waitForTimeout(600);
  await expect(page.locator('#rename-from')).toHaveValue('SpiDrv');
  await expect(page.locator('#rename-to')).toHaveValue('Spi_Driver');
});

// BLK-primary-20260914-1306-friction (継続): 上のケースは「欄から離れる」ことに
// 頼っている。primary が実際に踏んだのは Ctrl+H → from/to を打つ → そのまま閉じる
// (ヒット 0 件で [適用] が押せないときの普通の終わり方) で、blur を通らないため
// 組が残らないままだった。閉じる時点でも覚える。
test('手順2 欄から離れずに閉じても、打った組は保存フォルダに残る', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, DIR, n, S.docFor(n, 'Spi_Driver'));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  await page.keyboard.press('Control+h');
  await page.waitForSelector('#rename-panel.open', { timeout: 5000 });
  await page.locator('#rename-from').fill('SpiDrv');
  await page.locator('#rename-to').fill('Spi_Driver');
  await page.waitForTimeout(900);
  await expect(page.locator('#btn-rename-apply')).toBeDisabled();
  // blur を挟まず、置換後の欄にカーソルを置いたまま Esc で閉じる。
  await page.locator('#rename-to').press('Escape');
  await page.waitForTimeout(900);

  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.waitForSelector('#preview-svg');
  await page.keyboard.press('Control+h');
  await page.waitForSelector('#rename-panel.open', { timeout: 5000 });
  await page.waitForTimeout(1200);

  const row = page.locator('#rename-redo-rows button.rr-row[data-from="SpiDrv"][data-to="Spi_Driver"]');
  await expect(row).toHaveCount(1);
  await row.click();
  await page.waitForTimeout(600);
  await expect(page.locator('#rename-from')).toHaveValue('SpiDrv');
  await expect(page.locator('#rename-to')).toHaveValue('Spi_Driver');
});

// BLK-primary-20260914-1006-friction: 統一が済んでいる回でも、⇄ 一括置換を開き
// 置換前・置換後を打ち、ヒット 0 件を見る空打ちが要っていた (clicks=4 / keys=16)。
// 下端の「統一」バッジが残存件数を常時数え、済んでいるならパネルを開かせない。
test('手順2 下端の統一バッジが、置換の残りを開かずに言う', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, DIR, n, S.docFor(n, 'SpiDrv'));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  // 1 回だけ普通に置換する (ここで「SpiDrv → Spi_Driver」の組が残る)。
  await page.keyboard.press('Control+h');
  await page.waitForSelector('#rename-panel.open', { timeout: 5000 });
  await page.locator('#rename-from').fill('SpiDrv');
  await page.locator('#rename-to').fill('Spi_Driver');
  await page.waitForTimeout(900);
  await page.locator('#btn-rename-apply').click();
  await page.waitForTimeout(1500);
  await page.locator('#btn-rename-cancel').click();

  // 到達条件その1: 次に開いたとき、パネルを開かずに「済」と分かる (打鍵ゼロ)。
  await page.reload();
  await page.waitForSelector('#preview-svg');
  const badge = page.locator('#status-rename');
  await expect(badge).toHaveAttribute('data-tone', 'done', { timeout: 15000 });
  await expect(badge).toHaveText('統一 済');
  await expect(badge).toHaveAttribute('data-pending', '0');
  await expect(page.locator('#rename-panel.open')).toHaveCount(0);

  // 到達条件その2: 旧名が残っている回は、図を 1 枚も開かないうちに残件数が出る。
  // (組はフォルダ側に残るので、タブを持たない次の run でもそのまま数えられる)
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, DIR, n, S.docFor(n, 'SpiDrv'));
  await page.reload();
  await page.waitForSelector('#preview-svg');
  await expect(badge).toHaveAttribute('data-tone', 'open', { timeout: 15000 });
  expect(Number(await badge.getAttribute('data-remaining'))).toBeGreaterThan(0);

  // 到達条件その3: バッジを押すだけで、その組が入った状態で置換に進める。
  await badge.click();
  await page.waitForSelector('#rename-panel.open', { timeout: 5000 });
  await page.waitForTimeout(1200);
  await expect(page.locator('#rename-from')).toHaveValue('SpiDrv');
  await expect(page.locator('#rename-to')).toHaveValue('Spi_Driver');
  await expect(page.locator('#btn-rename-apply')).toBeEnabled();
});
