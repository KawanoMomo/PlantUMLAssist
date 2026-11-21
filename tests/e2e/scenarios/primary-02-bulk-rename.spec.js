// @ts-check
// primary 台本 手順2: 全図横断で部品名 SpiDrv を Spi_Driver に統一する(⇄ 一括置換・全図適用)。
// 台本の主戦場。手順10 の手数の計測もこの操作を対象にしている。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
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
  // BLK-primary-20260924-0637-friction: FILES の絞り込み欄にカーソルがあっても Ctrl+H で開く
  // (入力欄にいると開かず、Ctrl+K で名前を打つ迂回で 2 → 11 打鍵になっていた)。
  await page.locator('#files-filter').click();
  await expect(page.locator('#files-filter')).toBeFocused();
  await page.keyboard.press('Control+h');
  await page.waitForSelector('#rename-panel.open', { timeout: 5000 });
  // 枠の中の欄で押し直しても閉じない (置換前の欄へ戻る)。
  await page.locator('#rename-to').click();
  await page.keyboard.press('Control+h');
  await expect(page.locator('#rename-panel')).toHaveClass(/open/);
  await expect(page.locator('#rename-from')).toBeFocused();

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

// BLK-primary-20260914-1106-friction (curator 書き直し): 件数を見るためだけに打って
// 当てずに閉じた組 (旧称が残る組) は、次に開いたときの既定にしない。両欄に入るのは
// 最後に [置換] で当てた組だけ。打った組は履歴の行には残る。
// 組はフォルダに残り続けるので、他のケースに混ざらないよう専用のフォルダで行う。
test('手順2 当てずに閉じた組は居座らず、開き直すと最後に当てた組が両欄に入る', async ({ page }) => {
  const dir = DIR + '-seed';
  fs.rmSync(path.join(S.absDirFor(__filename) + '-seed', '_renames'), { recursive: true, force: true });
  await S.bootWithSaveDir(page, dir);
  await S.clearDir(page, dir);
  for (const n of S.PRIMARY_DOCS) await S.putDoc(page, dir, n, S.docFor(n, 'SpiDrv'));
  await page.reload();
  await page.waitForSelector('#preview-svg');

  // 組 A を当てる。
  await page.keyboard.press('Control+h');
  await page.waitForSelector('#rename-panel.open', { timeout: 5000 });
  await page.locator('#rename-from').fill('SpiDrv');
  await page.locator('#rename-to').fill('Spi_Driver');
  await page.waitForTimeout(900);
  await page.locator('#btn-rename-apply').click();
  await page.waitForTimeout(1500);
  // 当てた直後は結果の 1 行が残り、今当てた組で欄が埋め戻されない
  // (下端のバッジの数え直しが組を読み直しても「見つかりません」で上書きしない)。
  await expect(page.locator('#rename-summary')).toContainText('置換しました');
  await expect(page.locator('#rename-from')).toHaveValue('');

  // 組 B を打って件数だけ見て、当てずに閉じる。
  await page.locator('#rename-from').fill('Hw_Ctrl');
  await page.locator('#rename-to').fill('Hw_Controller');
  await page.waitForTimeout(900);
  await expect(page.locator('#btn-rename-apply')).toBeEnabled();
  await page.locator('#rename-to').press('Escape');
  await page.waitForTimeout(900);

  // 到達条件その1: 開き直すと両欄に A が入る (B は履歴の行に残る)。
  await page.keyboard.press('Control+h');
  await page.waitForSelector('#rename-panel.open', { timeout: 5000 });
  await page.waitForTimeout(1200);
  await expect(page.locator('#rename-from')).toHaveValue('SpiDrv');
  await expect(page.locator('#rename-to')).toHaveValue('Spi_Driver');
  await expect(page.locator('#rename-redo-rows button.rr-row[data-from="Hw_Ctrl"][data-to="Hw_Controller"]'))
    .toHaveAttribute('data-state', 'pending');

  // 到達条件その2: 別のブラウザで開き直しても同じ (当てた組はフォルダ側の記録で見分ける)。
  await page.reload();
  await page.waitForSelector('#preview-svg');
  await page.keyboard.press('Control+h');
  await page.waitForSelector('#rename-panel.open', { timeout: 5000 });
  await page.waitForTimeout(1200);
  await expect(page.locator('#rename-from')).toHaveValue('SpiDrv');
  await expect(page.locator('#rename-to')).toHaveValue('Spi_Driver');
  await expect(page.locator('#rename-from')).toBeFocused();
  fs.rmSync(path.join(S.absDirFor(__filename) + '-seed', '_renames'), { recursive: true, force: true });
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
  // ヒット 0 件なので [適用] は押せない。ここが起票の状況。
  await expect(page.locator('#btn-rename-apply')).toBeDisabled();
  // 打ち終わり (欄から離れる) の時点で組を覚える。
  await page.locator('#rename-to').blur();
  await page.waitForTimeout(900);

  // 別のブラウザ・別のプロファイルで開き直した状況を作る。このブラウザの
  // localStorage は消えるが、フォルダ側の組は図と一緒に残っているはず。
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
  await page.evaluate(() => {
    const ed = document.getElementById('editor');
    const at = ed.value.indexOf('SpiDrv');
    ed.focus();
    ed.setSelectionRange(at, at + 'SpiDrv'.length);
  });
  await page.keyboard.press('Control+h');
  await page.waitForSelector('#rename-panel.open', { timeout: 5000 });
  await expect(page.locator('#rename-from')).toHaveValue('SpiDrv');
});
