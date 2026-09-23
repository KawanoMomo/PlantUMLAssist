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
// 各図を開いて目視で推測していた。依存グラフ で参照元・参照先と、連鎖で影響が
// 届く図までを開かずに数える。
// BLK-owner-20260923-1949-prune: 依存グラフは ▤ 影響を見る の上段 (◈ 依存グラフ ボタンは畳んだ)。
test('手順2 依存グラフが、置換する部品名の参照元・参照先と影響の届く図を出す', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, DIR, n, S.docFor(n, 'SpiDrv'));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  await S.runCommand(page, '一括置換');
  await page.locator('#rename-from').fill('SpiDrv');
  await page.waitForTimeout(900);

  await page.locator('#btn-rename-preview').click();
  await page.waitForSelector('#ri-modal', { state: 'visible' });
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
  await expect(page.locator('#ri-modal')).toBeHidden();
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
  await page.locator('#btn-rename-preview').click();
  await page.waitForSelector('#ri-modal', { state: 'visible' });
  await page.waitForTimeout(600);

  const impactCount = await page.locator('#dg-impact tr.dg-doc').count();
  expect(impactCount).toBeGreaterThan(1);

  // 到達条件その1: 見ているその場で札にできる (閉じて開き直させない)。
  await page.locator('#dg-ticket').click();
  await page.waitForSelector('#ct-modal', { state: 'visible' });
  await expect(page.locator('#ri-modal')).toBeHidden();
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

// BLK-primary-20260914-2206-wish: 依存グラフの行から図は開けるが、開いた瞬間に
// モーダルが閉じて一覧が消えるので、6 図あれば「◈依存グラフ → 行を探す → 開く」を
// 6 回繰り返していた (確認は依存グラフ・反映は📂一覧、と経路が分断されていた)。
// 洗った一覧を下端のバーに残し、直しながら「次へ」で送れるようにした。
test('手順4 洗った影響が下端に残り、一覧を開き直さずに次の図へ送れる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, DIR, n, S.docFor(n, 'SpiDrv'));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  await S.runCommand(page, '一括置換');
  await page.locator('#rename-from').fill('SpiDrv');
  await page.waitForTimeout(900);
  await page.locator('#btn-rename-preview').click();
  await page.waitForSelector('#ri-modal', { state: 'visible' });
  await page.waitForTimeout(600);

  const rows = page.locator('#dg-impact tr.dg-doc');
  const total = await rows.count();
  expect(total).toBeGreaterThan(2);
  const docs = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-doc')));

  // 到達条件その1: 一覧を「順に手当てする」で列にすると、1 枚目が開き、
  // 下端に何枚目 / 残り何枚が出たまま残る (モーダルは閉じてよい)。
  await page.locator('#dg-walk').click();
  await expect(page.locator('#ri-modal')).toBeHidden();
  const bar = page.locator('#fw-bar');
  await expect(bar).toBeVisible();
  await expect(page.locator('#fw-label')).toContainText('1 / ' + total + ' 図');
  await expect(page.locator('#fw-label')).toContainText('残り ' + total);
  await page.waitForTimeout(800);
  await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-doc-name', docs[0]);

  // 到達条件その2: 直した印を立てると、一覧を開き直さずに次の図がそのまま開く。
  await page.locator('#fw-done').click();
  await page.waitForTimeout(800);
  await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-doc-name', docs[1]);
  await expect(page.locator('#fw-label')).toContainText('2 / ' + total + ' 図');
  await expect(page.locator('#fw-label')).toContainText('残り ' + (total - 1));

  // 印を付けずに送ることもできる (先に全部読んでから直す回)。
  await page.locator('#fw-next').click();
  await page.waitForTimeout(800);
  await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-doc-name', docs[2]);
  await expect(page.locator('#fw-label')).toContainText('残り ' + (total - 1));
  await page.locator('#fw-prev').click();
  await page.waitForTimeout(800);
  await expect(page.locator('#tab-bar .tab.active')).toHaveAttribute('data-doc-name', docs[1]);

  // 到達条件その3: 一覧に戻ると、どこまで手当てしたかが行に出ている
  // (同じ図を二度開かない)。列はバーに残ったまま。
  await page.locator('#fw-list').click();
  await page.waitForSelector('#ri-modal', { state: 'visible' });
  await page.waitForTimeout(600);
  await expect(page.locator('#dg-impact tr.dg-doc[data-fixed="1"]')).toHaveCount(1);
  await expect(page.locator('#dg-impact tr.dg-doc[data-fixed="1"]')).toContainText(docs[0]);
  await expect(page.locator('#dg-impact tr.dg-doc[data-current="1"]')).toContainText(docs[1]);
  await page.locator('#ri-close').click();
  await expect(bar).toBeVisible();
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
  // BLK-primary-20260917-0523-friction: 開いた時点で行そのものが残件数を言う
  // (下端の統一バッジを押して確かめに行かない)。
  await expect(row.locator('.rr-state')).toHaveText(/^統一 済 · 残り 0 件 \(\d+ 枚に適用\)$/);
  // 打っていないのに欄は埋まっている。打ち直す 17 打を開いた時点で消すのが
  // BLK-primary-20260914-1106-friction の直しで、空欄に焦点が入ると利用者は
  // 履歴の行を探すより先に打ち始めてしまっていた (旧: 置換前の欄は空のまま)。
  await expect(page.locator('#rename-from')).toHaveValue('SpiDrv');
  await expect(page.locator('#rename-to')).toHaveValue('Spi_Driver');
  await expect(page.locator('#rename-seed-note')).toContainText('前回の組');

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
  // design 9c (BLK-human-20260923-1602): 残り 0 件の項目は下端に出さない
  // (出ていない = 済んでいる)。どの組が済んだかは data 属性と title に残る。
  await expect(badge).toBeHidden();
  // BLK-primary-20260917-0123-friction: どの組が済んだかも開かずに読める (clicks=0)。
  await expect(badge).toHaveAttribute('data-pair-states', 'SpiDrv→Spi_Driver=done');
  expect(await badge.getAttribute('title')).toContain('SpiDrv → Spi_Driver : 適用済み');
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

// BLK-primary-20260915-0007: 「意図的な省略を note で明記する」対応は、依存グラフが
// 挙げた影響先の枚数だけ同じ文言を打ち直す作業になっていた (1 図ずつ📂一覧から開き、
// DSL 欄の末尾にカーソルを合わせて同じ 1 行をタイプする)。文面は 1 つなのに手数が
// 枚数に比例する。一覧のすぐ下で 1 度打ち、影響先すべてへ 1 回で書き込む。
test('手順4 依存グラフの影響先すべてに、同じ note を 1 回で打てる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, DIR, n, S.docFor(n, 'SpiDrv'));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  await S.runCommand(page, '一括置換');
  await page.locator('#rename-from').fill('SpiDrv');
  await page.waitForTimeout(900);
  await page.locator('#btn-rename-preview').click();
  await page.waitForSelector('#ri-modal', { state: 'visible' });
  await page.waitForTimeout(600);

  const rows = page.locator('#dg-impact tr.dg-doc');
  const total = await rows.count();
  expect(total).toBeGreaterThan(1);
  const docs = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-doc')));

  // 到達条件その1: 一覧のすぐ下で文面を 1 度打つと、影響先すべてが既定で打つ先になる。
  await page.locator('#dg-note').click();
  const box = page.locator('#dg-note-box');
  await expect(box).toBeVisible();
  await expect(page.locator('#dg-note-targets label')).toHaveCount(total);
  await expect(page.locator('#dg-note-all')).toBeChecked();

  const NOTE = 'ClockCtrl の呼び先は意図的に省略 (reviewer依頼2への回答)';
  await page.locator('#dg-note-text').fill(NOTE);
  const summary = page.locator('#dg-note-summary');
  await expect(summary).toHaveAttribute('data-add', String(total));
  await expect(page.locator('#dg-note-run')).toBeEnabled();

  // 到達条件その2: 1 回押すだけで、影響先の図すべてに同じ note が入る
  // (開いていない図は開かずに保存フォルダへ書き戻る)。
  await page.locator('#dg-note-run').click();
  await expect(summary).toHaveAttribute('data-applied', String(total), { timeout: 15000 });
  await page.waitForTimeout(800);
  for (const d of docs) {
    const dsl = await S.readDoc(page, DIR, d);
    expect(dsl).toContain(NOTE);
    // note は @enduml の直前に入る (図が壊れない)。
    expect(dsl.trim().endsWith('@enduml')).toBe(true);
  }

  // 到達条件その3: 同じ文面をもう一度打っても二重にならない (既にあり、と出る)。
  await page.locator('#dg-note-text').fill(NOTE);
  await page.waitForTimeout(400);
  await expect(summary).toHaveAttribute('data-add', '0');
  await expect(page.locator('#dg-note-run')).toBeDisabled();
  const again = await S.readDoc(page, DIR, docs[0]);
  expect(again.split(NOTE).length - 1).toBe(1);
});

// BLK-primary-20260917-0023: ⇄ 一括置換のヒット件数は「何枚に当たったか」までで、
// 「どの図の何行目か」「残りの図は触らなくてよいか」は 3 枚を 1 枚ずつ開いて
// 確かめ直していた。件数の横から影響範囲へ入り、14 枚を変更あり / なしで仕分けた
// 一覧を、当たった箇所がハイライトされた状態で 1 画面で読む。
test('手順4 件数の横から、14 枚が変更あり / なしに仕分けられた影響範囲が開く', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, DIR, n, S.docFor(n, 'SpiDrv'));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  await page.keyboard.press('Control+h');
  await page.waitForSelector('#rename-panel.open', { timeout: 5000 });
  await page.locator('#rename-from').fill('SpiDrv');
  await page.locator('#rename-to').fill('Spi_Driver');
  await page.waitForTimeout(1200);

  // 到達条件その1: 件数を読んだその場に影響範囲への入口がある。
  const gate = page.locator('#btn-rename-hits-impact');
  await expect(gate).toBeEnabled();
  await expect(page.locator('#rename-hits-label')).toContainText('枚');
  await gate.click();
  await page.waitForSelector('#ri-modal', { state: 'visible' });
  await page.waitForTimeout(600);

  // 到達条件その2: 走査した枚数・変更あり・変更なしが 1 行で出て、
  // 変更なしの図も名前で並ぶ (残りを 1 枚ずつ開いて確かめ直さない)。
  const roster = page.locator('#ri-roster');
  const scanned = Number(await roster.getAttribute('data-scanned'));
  const changed = Number(await roster.getAttribute('data-changed'));
  const none = Number(await roster.getAttribute('data-none'));
  // 保存フォルダの 14 枚 (開いている無題のタブが 1 枚加わる回がある)。
  expect(scanned).toBeGreaterThanOrEqual(S.PRIMARY_DOCS.length);
  // 識別子として当たるのは spi_init_sequence と driver_common_class の 2 枚
  // (spi_state の SpiDrv_Init は別の識別子なので置換の的にならない)。
  expect(changed).toBe(2);
  expect(none).toBe(scanned - changed);
  await expect(roster).toContainText('変更なし');
  await expect(page.locator('#ri-none .ri-none-doc')).toHaveCount(none);
  await expect(page.locator('#ri-none')).toContainText('can_state');
  await expect(page.locator('#ri-none')).not.toContainText('spi_init_sequence');

  // 到達条件その3: 変更ありの図はヒット箇所がハイライトされて並ぶ
  // (行の中のどこが当たったかを目で探さない)。
  const entries = page.locator('#ri-body .cb-entry');
  await expect(entries).toHaveCount(changed);
  const marks = page.locator('#ri-body mark.ri-hit');
  expect(await marks.count()).toBeGreaterThan(changed);
  await expect(marks.first()).toHaveText(/SpiDrv|Spi_Driver/);
});

// BLK-primary-20260917-0223-friction: 畳まれた ⇄ 一括置換を Ctrl+K で名前を打って開く迂回が
// 毎回乗っていた。パレットの行に単独キー Ctrl+H を出し、エディタで選んだ部品名を
// 置換前に入れて開く (from 欄を打たない)。
test('手順2 パレットの一括置換に Ctrl+H が出て、エディタで選んだ部品名が置換前に入る', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, DIR, n, S.docFor(n, 'SpiDrv'));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  await page.keyboard.press('Control+k');
  await page.waitForSelector('#cp-modal');
  await page.locator('#cp-input').fill('一括置換');
  await page.waitForTimeout(250);
  await expect(page.locator('.cp-item[data-cp-id$=":tab-rename"] .cp-hint')).toContainText('Ctrl+H');
  await page.keyboard.press('Escape');
  await S.typeDsl(page, S.docFor(S.PRIMARY_DOCS[0], 'SpiDrv'));

  const selected = await page.evaluate(() => {
    const ed = document.getElementById('editor');
    const at = ed.value.indexOf('SpiDrv');
    ed.focus();
    ed.setSelectionRange(at, at + 'SpiDrv'.length);
    return at;
  });
  expect(selected).toBeGreaterThanOrEqual(0);
  await page.keyboard.press('Control+h');
  await page.waitForSelector('#rename-panel.open', { timeout: 5000 });
  await expect(page.locator('#rename-from')).toHaveValue('SpiDrv');
});
