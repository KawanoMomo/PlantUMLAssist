// @ts-check
// primary 台本 手順4(場面: レビュー会議で変更前後を見せる):
// 手順2 の置換前後を「並べて見る」で表示し、参加者に見せるつもりでスクリーンショットを控える。
//
// BLK-primary-20260908-2203-wish: 「並べて見る」は今開いているタブどうしを並べるだけで、
// 同じ図の変更前と今は並べられなかった(Ctrl+Z で戻すと変更後が消えるので往復になる)。
// 一括置換を当てた瞬間に変更前を控え、その図自身を候補に出すようにした。
//
// BLK-primary-20260909-0303-wish: 「変更前後を見せる」1 つの業務に「⇔ 並べて見る」と
// 「± 差分」の 2 画面があり、外れた方を開いて閉じ直す往復が毎回出ていた。
// 参照ペインの中のタブにして、開いたまま行き来できるようにした。
const { test, expect } = require('@playwright/test');
const { shotOut, gotoApp } = require('../helpers');
const S = require('./_scenario');


// TICKET-owner-20261115-2141-prune: 2 枚を比べる入口は「この図の履歴」の行の「比較」1 つになり、
// 参照ペインの相手を「別タブの図」に選び直す口は外した。この spec が見るのはペインの中身
// (変更前の控え・書き込み履歴の回・± 差分) なので、ペインはその開き口 (toggleCompareView) で開く。
// 履歴の「比較」から開く道は junior-1-open-own-diagram の「この図の履歴の「比較」」が守る。
async function openCompareTabs(p) {
  await p.waitForFunction(() => typeof window.toggleCompareView === 'function');
  await p.evaluate(() => { window.toggleCompareView(true, 'ref'); });
  await p.waitForSelector('#compare-pane:not([hidden])');
}

const DIR = S.dirFor(__filename);
// 保存フォルダへ直接書いた回を後から見返す場面 (BLK-primary-20260914-1206-wish)。
const DIR3 = S.dirFor(__filename) + '-hist';
// 置換を当てる前に、影響範囲の一覧で変更前後の図を見せる場面 (BLK-primary-20260917-0223)。
const DIR6 = S.dirFor(__filename) + '-impact';

// 手順2 と同じ一括置換を当てる。手順4 が見せるのはその前後なので、
// ここを踏まないと「変更前」がそもそも存在しない。
async function bulkRename(page, from, to) {
  await S.runCommand(page, '一括置換');
  const allDocs = page.locator('#rename-all-docs');
  if (!(await allDocs.isChecked())) await allDocs.check();
  await page.locator('#rename-from').fill(from);
  await page.locator('#rename-to').fill(to);
  await page.waitForTimeout(900);
  const apply = page.locator('#btn-rename-apply');
  await expect(apply).toBeEnabled();
  await apply.click();
  await page.waitForTimeout(1500);
}

test('手順4 置換の前後を並べて見せられ、その画面を控えられる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'spi_init_sequence', S.docFor('spi_init_sequence', 'SpiDrv'));
  await S.openFolderItem(page, 'spi_init_sequence');

  await bulkRename(page, 'SpiDrv', 'Spi_Driver');

  await openCompareTabs(page);
  // 到達条件その1: 変更前後を並べる参照ペインが開き、見せる図を選べる。
  await expect(page.locator('#compare-pane')).toBeVisible();
  const sel = page.locator('#compare-select');
  await expect(sel).toBeVisible();

  // 到達条件その2: 同じ図の「変更前」が、タブが 1 枚しかなくても候補に出て、
  // 開いた時点でそれが選ばれている(会議で見せたいのはたいてい同じ図の前後)。
  const before = sel.locator('option[data-before="1"]');
  await expect(before).toHaveCount(1);
  await expect(before).toHaveText(/spi_init_sequence \(変更前\)/);
  await expect(sel).toHaveValue('@before');

  // 到達条件その3: 参照側に旧名が、編集側に新名が、同時に出ている。
  // これが 1 画面で見えることが手順4 の目的(Ctrl+Z の往復が要らない)。
  await expect(page.locator('#compare-status')).toHaveText('変更前 (読むだけ)', { timeout: 20000 });
  await expect(page.locator('#compare-svg')).toContainText('SpiDrv', { timeout: 20000 });
  await expect(page.locator('#editor')).toHaveValue(/Spi_Driver/);
  // いつの・どの置換の前かが読める(古い控えを今日の変更前と取り違えない)。
  await expect(page.locator('#compare-before-note')).toContainText('SpiDrv → Spi_Driver');

  // 到達条件その4: 「この図、変わった?」と聞かれたら、同じパネルの中でタブを
  // 切り替えるだけで前回保存時点との差分に移れる (BLK-primary-20260909-0303-wish)。
  // 「並べて見る」を閉じて「± 差分」を開き直す往復が要らないことがこの手順の肝。
  await page.locator('#compare-mode-diff').click();
  await expect(page.locator('#compare-pane')).toBeVisible();
  await expect(page.locator('#compare-diff-view')).toBeVisible();
  await expect(page.locator('#compare-diff-head')).toContainText('spi_init_sequence');

  // 差分タブは「前回保存時点と比べてどうか」を言い切る (自動保存が効いていれば
  // 「変更なし」、直後に直していれば +N −M。どちらでも会議の場で答えになる)。
  // 何行がどう変わったかの中身は unit (blk-primary-0303-wish-compare-diff-lines) で守る。
  await expect(page.locator('#compare-diff-head')).toContainText('前回保存時点');

  // BLK-primary-20260914-1206: 自動保存で「前回保存時点から変更なし」になった図は、
  // それだけでは会議で前後を出せない。書き込み履歴の回を基準にした前後を同じ行に
  // 足し、差分の行も出す (どちらの基準の話かは文言で読み分けられる)。
  await expect(page.locator('#compare-diff-head')).toHaveAttribute('data-basis', 'write-history');
  await expect(page.locator('#compare-diff-head')).toContainText('の前から');
  await expect(page.locator('#compare-diff-view .cd-line.del').first()).toContainText('SpiDrv');

  // 到達条件その5: 差分から見比べへ戻っても、変更前の図はそのまま出ている
  // (会議中にパネルを開き直さない)。
  await page.locator('#compare-mode-ref').click();
  await expect(page.locator('#compare-svg')).toContainText('SpiDrv', { timeout: 20000 });
  await expect(sel).toHaveValue('@before');

  // 会議で見せるための静止画を控えられる。
  await page.screenshot({ path: shotOut('primary-04-compare.png'), fullPage: true });

  // 到達条件その6: 会議が終わったら控えを捨てられ、候補も消える
  // (何日も前の控えが「変更前」として出続けない)。
  await page.locator('#btn-compare-before-drop').click();
  await page.waitForTimeout(500);
  await expect(sel.locator('option[data-before="1"]')).toHaveCount(0);
  // (変更サマリボードは TICKET-owner-20261115-1828-prune で外した)
});

// BLK-primary-20260914-1206-wish: 「± 差分」「⇔ 並べて見る」はその図をエディタで
// 開いていたセッションの中でしか前後を憶えない。⇄ 一括置換 (未オープンのファイル分) と
// 🔖 指摘から選ぶの [適用] は保存フォルダへ直接書くので、後から開き直すと基準ごと
// 今の状態になり、会議で「今日どこを直したか」が出せなかった。
// 書き込み操作 1 回ぶんの前後を控え、🕘 書き込み履歴 から回を選んで並べられるようにした。
test('手順4 保存フォルダへ直接書いた回を、後から履歴で選んで並べられる', async ({ page, context }) => {
  await S.bootWithSaveDir(page, DIR3);
  await S.clearDir(page, DIR3);
  await S.putDoc(page, DIR3, 'spi_init_sequence', S.docFor('spi_init_sequence', 'SpiDrv'));
  // この図は一度も開かない。開かずに直せるのが未オープン置換の値打ちで、
  // 開いていない図こそ前後が残らなかった。
  await S.putDoc(page, DIR3, 'driver_common_class', S.docFor('driver_common_class', 'SpiDrv'));
  await S.openFolderItem(page, 'spi_init_sequence');

  await S.runCommand(page, '一括置換');
  const allDocs = page.locator('#rename-all-docs');
  if (!(await allDocs.isChecked())) await allDocs.check();
  const scan = page.locator('#rename-scan-folder');
  if (!(await scan.isChecked())) await scan.check();
  await page.waitForTimeout(1200);
  await page.locator('#rename-from').fill('SpiDrv');
  await page.locator('#rename-to').fill('Spi_Driver');
  await page.waitForTimeout(1200);
  await expect(page.locator('#rename-summary')).toHaveAttribute('data-unopened-docs', '1');
  await page.locator('#btn-rename-apply').click();
  await page.waitForTimeout(2000);

  // 到達条件その1: 1 回の置換が 1 件として残り、当たった図が並ぶ
  // (開いていた図も、開かずに書き戻した図も同じ 1 回)。
  await openCompareTabs(page);
  await page.locator('#btn-compare-hist').click();
  const entry = page.locator('#compare-hist-list .wh-entry').first();
  await expect(entry).toBeVisible();
  await expect(entry.locator('.wh-head')).toContainText('SpiDrv → Spi_Driver');
  await expect(entry.locator('.wh-file[data-doc-name="driver_common_class"]')).toHaveCount(1);

  // 到達条件その2: 一度も開いていない図でも、履歴の行を押すだけで
  // 「その回の変更前」と「今」が並ぶ (会議で見せたい回を選ぶ、が 1 クリック)。
  await entry.locator('.wh-file[data-doc-name="driver_common_class"]').click();
  await page.waitForTimeout(1500);
  await expect(page.locator('#editor')).toHaveValue(/Spi_Driver/);
  await expect(page.locator('#compare-select option[data-hist="1"]')).toHaveCount(1);
  await expect(page.locator('#compare-svg')).toContainText('SpiDrv', { timeout: 25000 });
  await expect(page.locator('#compare-status')).toHaveText('変更前 (読むだけ)', { timeout: 25000 });

  // 到達条件その2b (BLK-primary-20260914-1206): 同じパネルの「± 差分」に移っても
  // 「まだ保存していない (基準なし)」で止まらない。保存フォルダへ直接書いた図は
  // 書く前が基準になるので、直した行がそのまま + / − で読める。
  await page.locator('#compare-mode-diff').click();
  const dhead = page.locator('#compare-diff-head');
  await expect(dhead).toContainText('driver_common_class');
  await expect(dhead).not.toContainText('基準なし');
  await expect(page.locator('#compare-diff-view .cd-line.del').first()).toContainText('SpiDrv');
  await expect(page.locator('#compare-diff-view .cd-line.add').first()).toContainText('Spi_Driver');
  await page.locator('#compare-mode-ref').click();

  await page.screenshot({ path: shotOut('primary-04-write-history.png'), fullPage: true });

  // 到達条件その3: ブラウザを開き直しても同じ回を出せる (会議の準備を、直した
  // 直後にその場でやらなくてよい)。
  const page2 = await context.newPage();
  await gotoApp(page2);
  await page2.waitForTimeout(1200);
  await openCompareTabs(page2);
  await page2.locator('#btn-compare-hist').click();
  const entry2 = page2.locator('#compare-hist-list .wh-entry').first();
  await expect(entry2.locator('.wh-head')).toContainText('SpiDrv → Spi_Driver');
  await entry2.locator('.wh-file[data-doc-name="driver_common_class"]').click();
  await page2.waitForTimeout(1500);
  await expect(page2.locator('#compare-svg')).toContainText('SpiDrv', { timeout: 25000 });

  // 到達条件その3b: 開き直して自動保存が走り、前回保存時点が「今」になった後でも、
  // ± 差分 は書き込み履歴のその回を基準にして前後を出す (基準ごと今になって
  // 変更前が消える、が起きない)。
  await page2.waitForTimeout(1500);
  await page2.locator('#compare-mode-diff').click();
  const dhead2 = page2.locator('#compare-diff-head');
  await expect(dhead2).not.toContainText('基準なし');
  await expect(page2.locator('#compare-diff-view .cd-line.del').first()).toContainText('SpiDrv');
  await expect(page2.locator('#compare-diff-view .cd-line.add').first()).toContainText('Spi_Driver');
  await page2.locator('#compare-mode-ref').click();

  // 到達条件その4: 会議が終われば回ごとに捨てられる (古い回が出続けない)。
  await page2.locator('#compare-hist-list .wh-entry').first().locator('.wh-drop').click();
  await page2.waitForTimeout(600);
  await expect(page2.locator('#compare-hist-list .wh-entry')).toHaveCount(0);
  await expect(page2.locator('#compare-hist-empty')).toBeVisible();
  await page2.close();
});
// BLK-owner-20260924-1712-prune: 「前回保存版と比べる」入口が Ctrl+K に 3 行並び (うち 2 行は同じ枠を開く)、
// 下端の「± 差分」は変わった図ではなく開いている図の総数を出していた。
// TICKET-owner-20261115-2141-prune: タブ列・下端の「± 差分」と「● 前回保存版」の札、Ctrl+K「前回保存からの差分」を外し、
// 前回保存版と比べる入口を「この図の履歴」の行の「比較」1 つにした。Ctrl+K の「前回保存」はこの図の履歴の 1 行を引く。
test('手順4 前回保存版と比べる入口は「この図の履歴」1 つで、Ctrl+K も 1 行', async ({ page }) => {
  const A = '@startuml\nparticipant SpiDrv\nSpiDrv -> Reg : write(CR1)\n@enduml';
  await S.bootDownloadMode(page);
  await S.typeDsl(page, A);

  // 到達条件その1: タブ列・下端に「± 差分」「前回保存版」の札は無い。
  await expect(page.locator('#btn-tab-diff')).toHaveCount(0);
  await expect(page.locator('#status-diff')).toHaveCount(0);
  // 「前回保存版」の札は、保存すると内容が大きく消える形のときだけ出る守り (普通の増減では出ない)。
  await expect(page.locator('#status-livediff')).toBeHidden();

  // 到達条件その2: Ctrl+K で「前回保存」と打つと、この図の履歴を開く 1 行だけ。
  await page.keyboard.press('Control+k');
  await page.waitForSelector('#cp-modal');
  const input = page.locator('#cp-input');
  await input.fill('前回保存');
  await expect(page.locator('#cp-list .cp-item[data-cp-id$=":tab-versions"]')).toHaveCount(1);
  await expect(page.locator('#cp-list .cp-item[data-cp-id$=":tab-diff"]')).toHaveCount(0);
  await expect(page.locator('#cp-list .cp-item[data-cp-id$=":compare-before"]')).toHaveCount(0);
  await expect(page.locator('#cp-list .cp-item[data-cp-id="command:livediff"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
});
