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

const DIR = S.dirFor(__filename);
// 顧客に見せる場面は別の保存フォルダで回す (会議の一覧の中身と混ざらない)。
const DIR2 = S.dirFor(__filename) + '-show';
// 保存フォルダへ直接書いた回を後から見返す場面 (BLK-primary-20260914-1206-wish)。
const DIR3 = S.dirFor(__filename) + '-hist';
// 納品履歴から前回渡した版と見比べる場面 (BLK-primary-20260914-2106-wish)。
const DIR4 = S.dirFor(__filename) + '-deliv';

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

// 開いたままのファイルへ自動保存が走ると上書きの確認が出る。顧客に見せる前に
// 「元ファイルは変更前のまま保つ」で片付ける (保存フォルダの直した版を残す)。
async function keepSourceFile(page) {
  const lock = page.locator('#source-lock-modal');
  if (await lock.isVisible().catch(() => false)) {
    await page.locator('#source-lock-keep').click();
    await page.waitForTimeout(600);
  }
}

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
  await keepSourceFile(page);
  await page.locator('#tab-bar .tab, #doc-tabs .tab').last().locator('.tab-close').click();
  await page.waitForTimeout(400);
  await keepSourceFile(page);
  // 直した版を保存フォルダに置く (基準からの変更がボードに並ぶ)。
  await S.putDoc(page, DIR2, 'adc_state',
    ['@startuml', 'class Adc_Driver', 'class Adc_Channel', '@enduml'].join('\n'));
  await page.waitForTimeout(800);
  await keepSourceFile(page);

  await page.locator('#btn-tab-board').click();
  await expect(page.locator('#cb-modal')).toBeVisible();
  const entry = page.locator('#cb-body .cb-entry[data-doc-name="adc_state"]');
  await expect(entry).toHaveCount(1, { timeout: 10000 });

  // 到達条件その1: 1 操作で、DSL の行差分が描いた図の変更前後に変わる。
  await keepSourceFile(page);
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
  await keepSourceFile(page);
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
  const lock = page.locator('#source-lock-modal');
  if (await lock.isVisible().catch(() => false)) {
    await page.locator('#source-lock-overwrite').click();
    await page.waitForTimeout(1200);
  }

  // 到達条件その1: 1 回の置換が 1 件として残り、当たった図が並ぶ
  // (開いていた図も、開かずに書き戻した図も同じ 1 回)。
  await page.locator('#btn-tab-compare').click();
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
  await page2.locator('#btn-tab-compare').click();
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

// BLK-primary-20260914-1406-wish: 手順5.5・2 の反映後に保存したつもりで、実際には
// ファイルへ反映されていない回が 2 周続いた (BLK-primary-20260914-1406)。今の画面は
// 「保存操作をした」ことしか言わないので、引き継ぎ資料に古いままの図が混ざりかねない。
// 新人に渡す前に「この周で保存が効いた図 / 効かなかった図」が一覧で出ることを到達条件にする。
test('手順4 引き継ぐ前に、この周で保存が効かなかった図を名指しできる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);

  const BEFORE = ['@startuml', 'title Fig1', 'participant Fig1Drv', 'Fig1Drv -> Mcu : Init()', '@enduml'].join('\n');
  const AFTER = BEFORE.replace(/Fig1Drv/g, 'Fig1_Driver');
  await S.putDoc(page, DIR, 'Fig1', BEFORE);

  // 一覧から開いて直す (錠の問いが出る道)。問いに答えないまま先へ進むのが、
  // 「保存したのにディスクが変わらない」が起きている実際の並びかた。
  await S.openFolderItem(page, 'Fig1');
  await S.typeDsl(page, AFTER);
  await page.waitForTimeout(900);

  // 到達条件 1: 保存先ファイルはまだ編集前のまま (症状そのもの)。
  expect(await S.readDoc(page, DIR, 'Fig1')).toContain('Fig1Drv');

  // 問いが画面を塞いでいるなら閉じる。答えないので保存は効いていないまま。
  const lock = page.locator('#source-lock-modal');
  if (await lock.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // 到達条件 2: 一覧が「この周の保存」を数え、確かめる操作を持っている。
  await S.openFolder(page);
  const sum = page.locator('#folder-save-verify');
  await sum.waitFor({ timeout: 10000 });
  await page.locator('#btn-save-verify').click();
  await page.waitForTimeout(1500);

  // 到達条件 3: 効かなかった図を名指しし、理由まで言う。
  const row = page.locator('[data-save-verify="Fig1"]');
  await row.waitFor({ timeout: 10000 });
  expect((await page.locator('#folder-save-verify').textContent()) || '').toContain('効かなかった 1 枚');
  expect((await row.textContent()) || '').toContain('Fig1');

  // 到達条件 4: その場で保存し直せ、ディスクの中身が編集後になる。
  await page.locator('[data-save-resave="Fig1"]').click();
  await page.waitForTimeout(2000);
  expect(await S.readDoc(page, DIR, 'Fig1')).toContain('Fig1_Driver');

  // 到達条件 5: 直した後は「効かなかった」が消える (引き継いでよい状態を言い切る)。
  await S.openFolder(page);
  await page.waitForTimeout(1200);
  expect((await page.locator('#folder-save-verify').textContent()) || '').not.toContain('効かなかった');

  await S.clearDir(page, DIR);
});

// BLK-primary-20260914-2106-wish: 手順3 (見比べ) と手順4 (顧客向け資料まとめ) で、
// 同じ「前回どの版を渡したか」を 2 回別々に調べていた。納品履歴の行は日時と枚数しか
// 言わないので、「前回渡した版と比べてどの図が変わったか」は zip を開くしかない。
// 履歴の行を押すだけで、その回と今が図ごとに並ぶことを到達条件にする。
test('手順4 前回渡した版と今を、納品履歴の行から図ごとに見比べられる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR4);
  await S.clearDir(page, DIR4);
  await S.putDoc(page, DIR4, 'spi_init_sequence', S.docFor('spi_init_sequence', 'SpiDrv'));
  await S.putDoc(page, DIR4, 'can_init_sequence', S.docFor('can_init_sequence'));
  await S.openFolderItem(page, 'spi_init_sequence');
  await page.waitForTimeout(800);

  // 1 回目の提出。ここが「前回顧客に渡した版」になる。
  await S.runCommand(page, '納品パッケージ');
  await expect(page.locator('#dp-modal')).toBeVisible();
  await page.waitForTimeout(2500);
  const dl = page.waitForEvent('download', { timeout: 60000 });
  await page.locator('#dp-build').click();
  await dl;
  await expect(page.locator('#dp-status')).toContainText('書き出しました', { timeout: 60000 });
  await page.locator('#dp-close').click();

  // 提出後に 1 枚だけ直す (顧客に渡した版との差はこの 1 枚だけ)。
  await S.typeDsl(page, S.docFor('spi_init_sequence', 'Spi_Driver'));
  await page.waitForTimeout(1200);
  const lock = page.locator('#source-lock-modal');
  if (await lock.isVisible().catch(() => false)) {
    await page.locator('#source-lock-overwrite').click();
    await page.waitForTimeout(1200);
  }
  // 提出後に増えた図も 1 枚置く (「新規」が出るかを見る)。
  await S.putDoc(page, DIR4, 'adc_state', S.docFor('adc_state'));

  await S.runCommand(page, '納品パッケージ');
  await page.waitForTimeout(3000);

  // 到達条件その1: 履歴の行そのものが「今と比べる」入口になっている。
  const row = page.locator('#dp-history .dp-hist-row[data-latest="1"]');
  await expect(row).toBeVisible();
  await row.click();
  await page.waitForTimeout(600);

  // 到達条件その2: その回と今が、図ごとに 1 画面で並ぶ。
  const cmp = page.locator('#dp-hist-compare');
  await expect(cmp).toBeVisible();
  await expect(cmp).toHaveAttribute('data-exact', '1');
  await expect(cmp.locator('.dp-hist-doc[data-name="spi_init_sequence"]')).toHaveAttribute('data-status', 'changed');
  await expect(cmp.locator('.dp-hist-doc[data-name="can_init_sequence"]')).toHaveAttribute('data-status', 'same');
  await expect(cmp.locator('.dp-hist-doc[data-name="adc_state"]')).toHaveAttribute('data-status', 'new');
  await expect(page.locator('#dp-hist-line')).toContainText('変更 1 枚');

  // 到達条件その3: 見比べた流れのまま、その差分だけを次の納品の対象にできる
  // (履歴を見る画面と対象を選ぶ画面を行き来しない)。
  await page.locator('#dp-hist-pick').click();
  await page.waitForTimeout(600);
  // 直した 1 枚と増えた 1 枚だけが残る (開いているタブの下書きが候補に混ざるので総枚数は見ない)。
  await expect(page.locator('#dp-count')).toContainText('2 / ');
  await expect(page.locator('.dp-pick[data-name="spi_init_sequence"]')).toBeChecked();
  await expect(page.locator('.dp-pick[data-name="adc_state"]')).toBeChecked();
  await expect(page.locator('.dp-pick[data-name="can_init_sequence"]')).not.toBeChecked();

  await page.screenshot({ path: shotOut('primary-04-delivery-history.png'), fullPage: true });
  await page.locator('#dp-close').click();
  await S.clearDir(page, DIR4);
});

// BLK-primary-20260915-2346-wish: 手順4 は zip を書き出して終わっていた。渡した zip は
// 図・SVG・突合結果を詰めただけで、新人が「今日どの図から見ればよいか」を辿る順序が
// 無く、展開してファイル名から中身を推測するしかなかった。index.html の先頭に
// 「見る順」を置き、どこまで辿ったかが渡した側に返るところまでを 1 本で確かめる。
test('手順4 渡す zip の先頭に、新人が辿る順が付いている', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);

  const model = await page.evaluate(() => {
    const HP = window.MA.handoffPackage;
    const HR = window.MA.handoffRoute;
    // 手順2 で直した図 (指摘が残っているもの・済んだもの) と、触っていない図。
    const snap = {
      createdAt: '2026-09-15 23:51',
      diagrams: [
        { id: 'a', name: 'GPIO 初期化シーケンス', diagramType: 'sequence', filename: 'svg/a.svg', rendered: true, svg: '<svg/>' },
        { id: 'b', name: 'GPIO 状態遷移', diagramType: 'state', filename: 'svg/b.svg', rendered: true, svg: '<svg/>' },
        { id: 'c', name: 'CAN クラス', diagramType: 'class', filename: 'svg/c.svg', rendered: true, svg: '<svg/>' },
      ],
      summary: {
        changed: [
          { name: 'GPIO 初期化シーケンス', diagramType: 'sequence', changed: true, changeLine: '+2 −1 行', reasons: ['名前をそろえた'], openPins: ['粒度が粗い'], fixCount: 0, diffRows: [] },
          { name: 'GPIO 状態遷移', diagramType: 'state', changed: true, changeLine: '+1 −0 行', reasons: [], openPins: [], fixCount: 0, diffRows: [] },
        ],
        rest: [{ name: 'CAN クラス', diagramType: 'class', changed: false, changeLine: '', reasons: [], openPins: [], fixCount: 0, diffRows: [] }],
        changedCount: 2, total: 3,
      },
      family: { ok: true, line: '', families: [] },
      names: { ok: true, line: '', variants: [], undeclared: [] },
      change: { line: '', board: null },
      checklist: { createdAt: '', items: [] },
      verdict: '3 枚',
      total: 3, renderedCount: 3,
    };
    const route = HR.build(snap);
    return {
      html: HP.renderIndexHtml(snap),
      names: route.stops.map((s) => s.name),
      steps: route.stops.map((s) => s.step),
      next0: route.stops[0].next,
      anchor0: route.stops[0].anchor,
      rest: route.rest.map((s) => s.name),
      line: route.line,
    };
  });

  // 到達条件その1: 材料の節より前に「見る順」が出る。
  expect(model.html.indexOf('1. 見る順')).toBeGreaterThan(-1);
  expect(model.html.indexOf('2. 今回の変更と、その理由')).toBeGreaterThan(model.html.indexOf('1. 見る順'));

  // 到達条件その2: ①は「今回変わっていて、直す手が残っている」図。
  expect(model.names[0]).toBe('GPIO 初期化シーケンス');
  expect(model.steps[0]).toBe('手順2');
  // 触っていない図は順番を付けず参考に落ちる (24 枚を上から眺めさせない)。
  expect(model.rest).toEqual(['CAN クラス']);

  // 到達条件その3: ①→②がつながっていて、押せば図の本体へ飛ぶ。
  expect(model.next0).toBe('GPIO 状態遷移');
  expect(model.html).toContain('href="#' + model.anchor0 + '"');
  expect(model.html).toContain('id="' + model.anchor0 + '"');

  // 到達条件その4: 「何枚を順に見るのか」が 1 行で読める。
  expect(model.line).toContain('2 枚');

  // 到達条件その5: 新人が返した記録で「どこまで辿れたか」が渡した側に出る。
  const shown = await page.evaluate(() => {
    const HC = window.MA.handoverChecklist;
    HC.clear();
    HC.receive(JSON.stringify({
      kind: 'handover-reply', createdAt: '2026-09-15 23:51',
      replies: {}, route: { total: 2, seen: 2, at: 'now' },
    }));
    const line = HC.routeLine(HC.current().route);
    HC.clear();
    return line;
  });
  expect(shown).toBe('新人の順路 2 枚すべてを辿りました');

  await S.clearDir(page, DIR);
});

// BLK-primary-20260916-2314-friction: 顧客向けの 14 枚を毎回「全部外す → 1 枚ずつチェック」で選び直していた
// (クリック 17)。前回出した図が既定で選ばれていること、控えより前の納品 zip があれば「初回提出」と
// 言わないこと、選んだ対象を図セット (手順 9 の「顧客資料」) に書き戻せることを確かめる。
const DIR5 = S.dirFor(__filename) + '-recall';

test('手順4 前回出した図が既定で選ばれ、試作図は外れたまま zip を作れ、図セットにも共有できる', async ({ page }) => {
  const { execFileSync } = require('child_process');
  const pathMod = require('path');
  await S.bootWithSaveDir(page, DIR5);
  await S.clearDir(page, DIR5);
  await S.putDoc(page, DIR5, 'spi_init_sequence', S.docFor('spi_init_sequence', 'Spi_Driver'));
  await S.putDoc(page, DIR5, 'can_init_sequence', S.docFor('can_init_sequence'));
  await S.putDoc(page, DIR5, 'diagram1', '@startuml\nA -> B : 試作\n@enduml\n');
  // 控え (_export-log.json) より前に作った納品 zip。中身は 2 枚 (試作図は入っていない)。
  const abs = S.absDirFor(__filename) + '-recall';
  execFileSync('python', ['-c', [
    'import zipfile, os, sys',
    'p = os.path.join(sys.argv[1], "delivery-20260908-1903.zip")',
    'z = zipfile.ZipFile(p, "w")',
    'z.writestr("index.html", "x")',
    'z.writestr("svg/spi_init_sequence.svg", "<svg/>")',
    'z.writestr("svg/can_init_sequence.svg", "<svg/>")',
    'z.close()',
  ].join('\n'), abs]);
  // 手順 9 の図セット「顧客資料」はフォルダの全部 (3 枚) で登録されている。
  await page.evaluate((dir) => fetch('/doc-sets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dir: dir, name: '顧客資料', docs: ['can_init_sequence', 'diagram1', 'spi_init_sequence'] }),
  }), DIR5);
  await S.openFolderItem(page, 'spi_init_sequence');
  await page.waitForTimeout(800);

  await S.runCommand(page, '納品パッケージ');
  await expect(page.locator('#dp-modal')).toBeVisible();
  await page.waitForTimeout(2500);

  // 到達条件その1: 控えが無くても、フォルダの納品 zip から前回が分かる (「初回提出」と言わない)。
  await expect(page.locator('#dp-last')).not.toContainText('まだ 1 度も');
  await expect(page.locator('#dp-last')).toContainText('delivery-20260908-1903.zip');
  await expect(page.locator('#dp-hist-zips')).toHaveAttribute('data-count', '1');
  // 到達条件その2: 前回と同じ 2 枚が既定で選ばれ、試作図は外れている (全部外す・1 枚ずつが要らない)。
  await expect(page.locator('#dp-recall')).toHaveAttribute('data-from', 'zip');
  await expect(page.locator('.dp-pick[data-name="spi_init_sequence"]')).toBeChecked();
  await expect(page.locator('.dp-pick[data-name="can_init_sequence"]')).toBeChecked();
  await expect(page.locator('.dp-pick[data-name="diagram1"]')).not.toBeChecked();

  // 到達条件その3: 今の対象で図セット「顧客資料」を更新できる (手順 9 と同じ 2 枚を共有する)。
  await page.locator('#dp-set').selectOption('顧客資料');
  await page.locator('#dp-set-save').click();
  await expect(page.locator('#dp-status')).toContainText('2 枚で更新しました');
  const setDocs = await page.evaluate((dir) => fetch('/doc-sets?dir=' + encodeURIComponent(dir))
    .then((r) => r.json()).then((d) => (d.sets || []).filter((s) => s.name === '顧客資料')[0]), DIR5);
  expect(setDocs.docs.map((d) => (typeof d === 'string' ? d : d.name)).sort()).toEqual(['can_init_sequence', 'spi_init_sequence']);

  // zip を作る。題は既定のまま (クリック 1)。
  const dl = page.waitForEvent('download', { timeout: 60000 });
  await page.locator('#dp-build').click();
  await dl;
  await expect(page.locator('#dp-status')).toContainText('2 / ', { timeout: 60000 });
  await page.locator('#dp-close').click();

  // 到達条件その4: 次に開いたときは控え (今出した回) から同じ 2 枚が既定になる。
  await S.runCommand(page, '納品パッケージ');
  await page.waitForTimeout(2500);
  await expect(page.locator('#dp-recall')).toHaveAttribute('data-from', 'log');
  await expect(page.locator('#dp-count')).toContainText('2 / ');
  await expect(page.locator('.dp-pick[data-name="diagram1"]')).not.toBeChecked();
  await page.screenshot({ path: shotOut('primary-04-delivery-recall.png'), fullPage: true });
  await page.locator('#dp-close').click();
  await S.clearDir(page, DIR5);
  try { require('fs').rmSync(pathMod.join(abs, 'delivery-20260908-1903.zip'), { force: true }); } catch (e) {}
});
