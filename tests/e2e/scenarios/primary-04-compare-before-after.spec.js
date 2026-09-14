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
const { shotOut } = require('../helpers');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);
// 顧客に見せる場面は別の保存フォルダで回す (会議の一覧の中身と混ざらない)。
const DIR2 = S.dirFor(__filename) + '-show';

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
  // 開いたままのファイルへ書くので上書きの確認が出る。会議の前に片付けておく。
  const lock = page.locator('#source-lock-modal');
  if (await lock.isVisible().catch(() => false)) {
    await page.locator('#source-lock-overwrite').click();
    await page.waitForTimeout(1200);
  }
}

test('手順4 置換の前後を並べて見せられ、その画面を控えられる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'spi_init_sequence', S.docFor('spi_init_sequence', 'SpiDrv'));
  await S.openFolderItem(page, 'spi_init_sequence');

  await bulkRename(page, 'SpiDrv', 'Spi_Driver');

  await page.locator('#btn-tab-compare').click();
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

  // 到達条件その7: 会議の一覧 (変更サマリボード) が、いつもの 14 枚に入らない図まで
  // 拾う (BLK-primary-20260912-2103-wish)。別件で開き直して書き出した図は
  // タブを閉じた時点でボードから消えていたので、「これは対象外だから口頭で」という
  // 抜け漏れ確認が会議前に毎回要った。
  await page.waitForTimeout(1200);   // 基準の時刻より後に更新された、と言える差を作る
  // 名前は開いているタブと重ならないものにする (開いている図は従来どおりの経路で並ぶ)。
  await S.putDoc(page, DIR, 'review_scratch', '@startuml\nclass Adhoc_Note\n@enduml');

  await page.locator('#btn-tab-board').click();
  const board = page.locator('#cb-modal');
  await expect(board).toBeVisible();
  const adhoc = page.locator('#cb-body .cb-entry[data-doc-name="review_scratch"]');
  await expect(adhoc).toHaveCount(1, { timeout: 10000 });
  // 開いていないフォルダのファイルだと分かる印が付く (会議で 14 枚の外だと言える)
  await expect(adhoc).toHaveAttribute('data-origin', 'folder');
  await expect(adhoc.locator('.cb-origin')).toContainText('フォルダ');
  await expect(page.locator('#cb-summary')).toContainText('保存フォルダ');

  // 拾い方を切れば従来どおり (開いている図だけ) に戻せる
  await page.locator('#cb-scan-folder').uncheck();
  await page.waitForTimeout(600);
  await expect(page.locator('#cb-body .cb-entry[data-doc-name="review_scratch"]')).toHaveCount(0);

});

// BLK-primary-20260913-0306-wish: 顧客に画面を見せながら説明する場では、▤変更サマリが
// 出す DSL の before/after は見せる代物ではない。これまでは「変更前の SVG を別途探して
// 並べる」を手作業でやり、顧客の前で納品 zip を開き直していた。
// ボードを開いたまま「🖼 SVGで見る」を 1 回押すだけで、描いた図の変更前後になる。
test('手順4 顧客の前で変更前後を図のまま切り替えて見せられる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR2);
  await S.clearDir(page, DIR2);

  // 顧客に見せるのは「この版から この版へ直した」なので、まず基準を取る。
  await S.putDoc(page, DIR2, 'adc_state', ['@startuml', 'class Adc_Driver', '@enduml'].join('\n'));
  await S.openFolderItem(page, 'adc_state');
  await page.locator('#btn-tab-diff').click();
  await page.locator('#diff-mark-all').click();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.locator('#tab-bar .tab, #doc-tabs .tab').last().locator('.tab-close').click();
  await page.waitForTimeout(400);
  // 直した版を保存フォルダに置く (基準からの変更がボードに並ぶ)。
  await S.putDoc(page, DIR2, 'adc_state',
    ['@startuml', 'class Adc_Driver', 'class Adc_Channel', '@enduml'].join('\n'));
  await page.waitForTimeout(800);

  await page.locator('#btn-tab-board').click();
  await expect(page.locator('#cb-modal')).toBeVisible();
  const entry = page.locator('#cb-body .cb-entry[data-doc-name="adc_state"]');
  await expect(entry).toHaveCount(1, { timeout: 10000 });

  // 到達条件その1: 1 操作で、DSL の行差分が描いた図の変更前後に変わる。
  await page.locator('#cb-svg').click();
  const panes = entry.locator('.cb-show .cb-pane');
  await expect(panes).toHaveCount(2);
  await expect(panes.nth(0).locator('.cb-pane-body svg')).toBeVisible({ timeout: 25000 });
  await expect(panes.nth(1).locator('.cb-pane-body svg')).toBeVisible({ timeout: 25000 });
  await expect(panes.nth(1).locator('.cb-pane-body')).toContainText('Adc_Channel');
  await expect(panes.nth(0).locator('.cb-pane-body')).not.toContainText('Adc_Channel');
  await expect(panes.nth(0).locator('.cb-pane-label')).toContainText('変更前');
  await expect(panes.nth(1).locator('.cb-pane-label')).toContainText('変更後');
  // 顧客に見せる画面なので DSL の行差分は出ない。
  await expect(entry.locator('table.cb-diff')).toHaveCount(0);

  // 到達条件その2: 「直す前はこう → 直したらこう」を 1 ボタンで切り替えられる。
  const flip = entry.locator('.cb-flip');
  await flip.click();                                    // 変更前だけ
  await expect(panes.nth(0)).toBeVisible();
  await expect(panes.nth(1)).toBeHidden();
  await flip.click();                                    // 変更後だけ
  await expect(panes.nth(0)).toBeHidden();
  await expect(panes.nth(1)).toBeVisible();
  await flip.click();                                    // 並べる に戻る
  await expect(panes.nth(0)).toBeVisible();
  await expect(panes.nth(1)).toBeVisible();

  // 顧客の前で見せた画面をそのまま資料に控えられる。
  await page.screenshot({ path: shotOut('primary-04-show-before-after.png'), fullPage: true });

  // 到達条件その3: 同じボタンで社内向けの DSL 表示に戻せる (会議の続きができる)。
  await page.locator('#cb-svg').click();
  await expect(entry.locator('table.cb-diff')).toHaveCount(1);
  await expect(entry.locator('.cb-show')).toHaveCount(0);
});
