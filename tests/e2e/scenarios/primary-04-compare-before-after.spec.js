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
// (変更前の控え・± 差分) なので、ペインはその開き口 (toggleCompareView) で開く。
// 履歴の「比較」から開く道は junior-1-open-own-diagram の「この図の履歴の「比較」」が守る。
async function openCompareTabs(p) {
  await p.waitForFunction(() => typeof window.toggleCompareView === 'function');
  await p.evaluate(() => { window.toggleCompareView(true, 'ref'); });
  await p.waitForSelector('#compare-pane:not([hidden])');
}

const DIR = S.dirFor(__filename);
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

  // 保存フォルダへ直接書いた回の控え (書き込み履歴) を基準にした前後は TICKET-owner-20261116-0821-prune で外した。
  // 前の版は Git と「この図の履歴」が持つ。差分タブは前回保存時点の言い切りだけ。
  await expect(page.locator('#compare-diff-head')).not.toHaveAttribute('data-basis', /.+/);

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
