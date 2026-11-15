// @ts-check
// reviewer 台本 手順5: 前回 run の控えと比べ、意図しない変更(無関係な行の差分・整形だけの差分)が
// 混ざっていないか確認する。今回の DSL も控える。
//
// BLK-reviewer-20260912-2103-wish: 手順5 で見つかる事故のうち「中身がファイルを
// またいで入れ替わった」ものは、前回 run の控えとのバイト比較でしか掘り起こせず、
// 書いた本人 (primary) は気付いていなかった。保存したその場で GUI が言うようにした。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

// 7 クラス・メソッド付きの図 (事故の前の driver_common_class に相当)。
const FULL_CLASS = ['@startuml', 'title driver_common_class'].concat(
  ['Spi_Driver', 'Can_Driver', 'Gpio_Driver', 'Irq_Driver', 'Uart_Driver', 'Adc_Driver', 'Timer_Driver']
    .map((c) => `class ${c} {\n  +Init()\n  +DeInit()\n  +Read()\n}`)
).concat(['@enduml']).join('\n');

// 別名で保存フォルダに居る雛形 (事故の後の中身と完全一致するもの)。
const TEMPLATE_CLASS = ['@startuml', 'class Foo', '@enduml'].join('\n');

function diffLines(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) out.push({ line: i + 1, before: a[i], after: b[i] });
  }
  return out;
}

test('手順5 意図した差分と、整形だけの差分を分けて言える', () => {
  const before = R.DOCS.spi_state;
  // 意図した変更: 遷移ラベルを 1 つ直した。
  const intended = before.replace('Spi_Driver_Write', 'Spi_Driver_Send');
  // 意図しない変更: 各行の末尾に空白を足しただけ(整形差)。
  const cosmetic = before.split('\n').map((l) => l + ' ').join('\n');

  const d1 = diffLines(before, intended);
  expect(d1.length).toBe(1);
  expect(d1[0].after).toContain('Spi_Driver_Send');

  const d2 = diffLines(before, cosmetic);
  // 到達条件: 整形だけの差は、trim すると 1 件も残らない。
  expect(d2.length).toBeGreaterThan(0);
  expect(d2.filter((d) => (d.before || '').trim() !== (d.after || '').trim())).toEqual([]);
});

test('手順5 中身が別名の図と入れ替わった保存を、その場で名指しできる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  // 保存フォルダの前提: 中身の詰まった図と、その中身が入り込んでしまった別名の図。
  // BLK-primary-20260913-0306 までは、この「別名にも同じ中身が入る」状態を
  // 自動保存の図種キーが勝手に作っていたので、下ごしらえでは雛形を置くだけで
  // 事故の形が出来ていた。書き先を図の名前にした今は勝手には起きないので、
  // reviewer が見つけた事故の形 (中身が別名の図と一致している) をここで用意する。
  await S.putDoc(page, DIR, 'driver_common_class', FULL_CLASS);
  await S.putDoc(page, DIR, 'plantuml-class', FULL_CLASS);
  await S.openFolderItem(page, 'driver_common_class');
  await S.overwriteOpenedFile(page);

  await S.typeDsl(page, FULL_CLASS);
  await page.locator('#btn-save').dispatchEvent('click');   // 上部バーから外れているので直接叩く
  await page.waitForTimeout(1800);

  // 到達条件その1: 保存した本人の画面に、その場で警告が出る。
  // (この保存は実際に driver_common_class の中身を別名の plantuml-class にも書いており、
  //  reviewer が前回 run のバイト比較で掘り起こしたのと同じ形の事故がここで起きている)
  const warn = page.locator('#save-swap-overlay');
  await expect(warn).toBeVisible();
  await expect(warn).toHaveAttribute('data-warn', '1');
  await expect(page.locator('#ssw-summary')).toContainText('driver_common_class');
  // 到達条件その2: 一致した相手のファイル名を名指しする (バイト比較で掘らなくてよい)。
  await expect(page.locator('#ssw-list')).toContainText('plantuml-class');

  // 事故の続き: 中身が雛形に入れ替わった状態で保存すると、行の激減も同時に言う。
  await S.typeDsl(page, TEMPLATE_CLASS);
  await page.locator('#btn-save').dispatchEvent('click');
  await page.waitForTimeout(1800);
  await expect(warn).toHaveAttribute('data-warn', '1');
  await expect(page.locator('#ssw-list')).toContainText('行に減りました');

  // 到達条件その3: 「どの保存操作が起こしたか」を、ファイル名込みで後から辿れる。
  await page.locator('#btn-ssw-log').click();
  await page.waitForTimeout(400);
  const log = page.locator('#ssw-log');
  await expect(log).toBeVisible();
  await expect(log.locator('li').first()).toContainText('driver_common_class');
  // 直前の保存も残っている (事故の直前に何を保存したかが欠けない)。
  expect(await log.locator('li').count()).toBeGreaterThan(1);
});

// BLK-reviewer-20260914-1506-wish: 手順5 の突合には、前回 run の控えとのバイト比較とは別に
// 「同じ図の対になる成果物のうち片方だけを直した」向きの事故がある。
// (1) 直した内容が `{name}-編集中.puml` にしか入っていない、
// (2) 本体は直ったが `{name}.svg` が旧内容のまま。
// どちらも手で diff を取るまで気付けなかったので、📂 一覧が向きまで言い、
// 差分はその場 (1 操作) で開けるようにした。
const BASE_CLASS = ['@startuml', 'title driver_common_class',
  'class AdcRegs {\n  +WriteConfig()\n}', 'class SpiRegs', '@enduml'].join('\n');
// 下書きにだけ入った修正 (EnableDmaReq のメソッド化)。
const DRAFT_CLASS = BASE_CLASS.replace('class SpiRegs', 'class SpiRegs {\n  +EnableDmaReq()\n}');

test('手順5 直した内容が編集中の下書きにしか入っていない図を、一覧が向きごと名指しする', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'driver_common_class', BASE_CLASS);
  // 下書きは本体より後に保存される (直したのは下書きの方)。
  await page.waitForTimeout(1100);
  await S.putDoc(page, DIR, 'driver_common_class-編集中', DRAFT_CLASS);
  // 中身も時刻も同じ図は反映漏れに数えない (片付けは ⧉ 重複の節の職掌)。
  await S.putDoc(page, DIR, 'timer_init_sequence', BASE_CLASS);

  await S.openFolder(page);
  const sum = page.locator('#folder-sync-summary');
  await expect(sum).toBeVisible();
  await expect(sum).toContainText('反映待ち 1 枚');
  await expect(sum).toContainText('本体に未反映の下書き 1 枚');

  const row = page.locator('.folder-sync-row[data-sync-name="driver_common_class"]');
  await expect(row).toHaveAttribute('data-sync-issue', 'draft-ahead');
  // 到達条件その1: 3 つの成果物のどれが最新でどれが古いかを、時刻を読み比べずに言う。
  await expect(row.locator('.folder-sync-art[data-sync-role="base"]')).toContainText('本体 古い');
  await expect(row.locator('.folder-sync-art[data-sync-role="draft"]')).toContainText('編集中 最新');

  // 到達条件その2: 本体⇔編集中の差分が、一覧を離れずに 1 操作で開く。
  await row.locator('.folder-sync-diff').click();
  const box = page.locator('#folder-sync-diff-box');
  await expect(box).toBeVisible();
  await expect(box.locator('.folder-sync-diff-add').filter({ hasText: 'EnableDmaReq' })).toHaveCount(1);
  await expect(box.locator('.folder-sync-diff-note')).toContainText('driver_common_class-編集中');

  // 到達条件その3: 下書きの行だけを見ている人にも「本体に入っていない」が届く。
  await expect(page.locator('.folder-sync-badge[data-sync-badge-of="driver_common_class-編集中"]'))
    .toContainText('未反映');
  // 揃っている図は名指ししない (全行に印が付くと印でなくなる)。
  expect(await page.locator('.folder-sync-row[data-sync-name="timer_init_sequence"]').count()).toBe(0);
});

// BLK-reviewer-20260915-2346-wish: 手順5 の突合のうち「前回保存版から中身が大きく
// 消えた」向きは、reviewer が手元の複製と diff を手で打って初めて分かった。
// 書いた本人 (primary) の画面には、保存を押すまで何行消えるかがどこにも出ていない。
// 状態バーに常時 ＋a −b を出し、押せば前回保存版と現在を全文で並べる。
const BIG_CLASS = ['@startuml', 'title driver_common_class'].concat(
  ['Spi', 'Can', 'Gpio', 'Irq', 'Uart', 'Adc', 'Timer', 'Dma', 'Pwm', 'Wdg']
    .map((c) => `class ${c}_Regs {\n  +Init()\n  +DeInit()\n  +Read()\n}`)
).concat(['@enduml']).join('\n');

test('手順5 前回保存版から何行消えるかが、保存を押す前に状態バーに出ている', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'driver_common_class', BIG_CLASS);
  await S.openFolderItem(page, 'driver_common_class');

  const chip = page.locator('#status-livediff');
  // 到達条件その1: 開いた直後は前回保存版と同じ。
  // design 9c (BLK-human-20260923-1602): 0 件の項目は場所を取らないので出さない
  // (出ていない = 差が無い)。状態自体は data-livediff に残る。
  await expect(chip).toBeHidden();
  await expect(chip).toHaveAttribute('data-livediff', 'same');

  // 1 行だけ直した状態。保存はまだしていない。
  await S.typeDsl(page, BIG_CLASS.replace('+Init()', '+Start()'));
  await page.waitForTimeout(400);
  await expect(chip).toHaveAttribute('data-livediff', 'changed');
  // 変わった行数 (増 1 + 減 1) が件数として 1 種類の形で出る。
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText('● 前回保存版 2');

  // 事故の形: 中身が雛形に戻ってしまった (77 行 → 4 行と同じ向き)。
  await S.typeDsl(page, TEMPLATE_CLASS);
  await page.waitForTimeout(400);
  // 到達条件その2: 保存を押す前に、消える側だと分かる印が出る。
  await expect(chip).toHaveAttribute('data-livediff', 'shrink');
  // 警告は文字ではなく点の色で出す (文字色・形は他の札と同じ)。
  await expect(chip).toHaveAttribute('data-dot', 'bad');
  await expect(chip).toHaveAttribute('title', /いま保存すると .* 行に減ります/);

  // 到達条件その3: 押すと前回保存版と現在が並び、消える行が名指しされる (1 操作)。
  // BLK-owner-20260923-1307-prune: 並べる画面は ⇔ 並べて見る の ± 差分タブ 1 つに寄せた。
  // 札はその画面を開く入口で、開いた先で見えるもの (警告・消える行・戻す) は変わらない。
  await chip.click();
  const panel = page.locator('#compare-pane');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveClass(/mode-diff/);
  const cdHead = page.locator('#compare-diff-head');
  await expect(cdHead).toContainText('driver_common_class');
  await expect(cdHead).toContainText('前回保存時点から');
  await expect(cdHead).toHaveAttribute('data-vd-warn', '1');
  await expect(page.locator('#compare-diff-view .cd-line.del').filter({ hasText: 'Spi_Regs' }))
    .toHaveCount(1);
  expect(Number(await cdHead.getAttribute('data-vd-removed'))).toBeGreaterThan(20);

  // BLK-reviewer-20260916-0046-wish: 差分は見えるようになったが、気付いた後に戻す手段が
  // 比較画面に無く、消えた分は手順をやり直して書き直すしかなかった (それ自体が今日の
  // 手順のやり直しになる)。並べている左側へ 1 クリックで戻し、reviewer は差が 0 に
  // なったことだけ確認すればよいようにする。
  // 到達条件その4: 比較画面に「前回保存版に戻す」があり、1 クリックで中身が戻る。
  const restore = page.locator('#btn-compare-restore');
  await expect(restore).toBeVisible();
  await expect(restore).toHaveAttribute('title', /消えた \d+ 行が戻り/);
  // 一覧から開いた図には錠がかかっていて、最初の書き戻しの直前に一度だけ問いが出る。
  // 戻すのはエディタの中身なので、ファイルはそのままにして (書き換えない) 先へ進む。
  const lock = page.locator('#source-lock-modal');
  if (await lock.isVisible().catch(() => false)) {
    await page.locator('#source-lock-keep').click();
    await page.waitForTimeout(600);
  }
  await restore.click();
  await page.waitForTimeout(400);
  // 到達条件その5: 戻した直後の画面が、差が 0 になったことをそのまま映す
  // (確かめ直しのために別の画面を開かせない)。
  await expect(chip).toHaveAttribute('data-livediff', 'same');
  await expect(cdHead).toHaveAttribute('data-vd-removed', '0');
  await expect(cdHead).toHaveAttribute('data-vd-added', '0');
  // 戻せば何も戻すものが無いので、ボタン自体が引っ込む。
  await expect(restore).toHaveCount(0);
  // 消えていた 10 クラスが本文に戻っている (再入力していない)。
  expect(await page.locator('#editor').inputValue()).toContain('Wdg_Regs');
});

// BLK-reviewer-20260916-0426-wish: 手順5 は「前回控えとの比較」だが、変わっていない図には
// 一覧が何も出さないので、印が無い状態は「変わっていない」と「まだ確かめていない」の
// どちらにも読めた。確かめるには毎 tick `audit.js --since-files` をフルで打ち直すしかなく、
// 図が増えるほど時間が延びる。変わっていないと言い切れる図に印を出し、
// 印の付いていない図だけを読めばよいようにした。
const STAMP_A = ['@startuml', 'title alpha_state', '[*] --> Idle', 'Idle --> Busy : start', '@enduml'].join('\n');
const STAMP_B = ['@startuml', 'title beta_state', '[*] --> Off', 'Off --> On : power', '@enduml'].join('\n');

test('手順5 前回控えから変わっていない図に「変化なし」の印が常時出る', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, 'alpha_state', STAMP_A);
  await S.putDoc(page, DIR, 'beta_state', STAMP_B);

  await S.openFolder(page);
  // 控えを取る前は印を出さない (「今回の控えと同じ」までしか言えない)。
  expect(await page.locator('#folder-panel .folder-stamp').count()).toBe(0);
  await page.locator('.folder-mark-seen').click();
  await page.waitForTimeout(1200);

  // 到達条件その1: 控えを取り直すと、中身の変わっていない図に印が出る。
  await page.locator('.folder-mark-seen').click();
  await page.waitForTimeout(1200);
  const alpha = page.locator('#folder-panel .folder-item[data-file-name="alpha_state"]');
  await expect(alpha.locator('.folder-stamp')).toHaveAttribute('data-change-stamp', '2');
  // 何回続けて変わっていないかも行の上で読める (2 tick 分か、今回だけかが分かる)。
  await expect(alpha.locator('.folder-stamp')).toHaveText('＝2');
  await expect(alpha.locator('.folder-stamp')).toHaveAttribute('data-stamp-text', '変化なし ×2');

  // 到達条件その2: 読む枚数が一覧の頭に出る (audit をフルで打ち直さずに決まる)。
  await expect(page.locator('#folder-stamp-summary')).toContainText('変化なし 2 枚');
  await expect(page.locator('#folder-stamp-summary')).toContainText('読むのは 0 枚');

  // 1 枚だけ中身を直すと、その図からは印が消え、もう 1 枚は印を保つ。
  await S.putDoc(page, DIR, 'beta_state', STAMP_B.replace('power', 'power_on'));
  await page.locator('#btn-tab-folder').click();          // 畳んで
  await S.openFolder(page);                                // 開き直す
  await page.waitForTimeout(600);
  expect(await page.locator('#folder-panel .folder-item[data-file-name="beta_state"] .folder-stamp')
    .count()).toBe(0);
  await expect(page.locator('#folder-panel .folder-item[data-file-name="alpha_state"] .folder-stamp'))
    .toHaveAttribute('data-stamp-text', '変化なし ×2');
  await expect(page.locator('#folder-stamp-summary')).toContainText('読むのは 1 枚');

  // 到達条件その3: 印の付いた図を 1 操作で畳み、読む図だけを残せる。
  await page.locator('#folder-stamp-hide').check();
  await page.waitForTimeout(300);
  await expect(page.locator('#folder-panel .folder-item[data-file-name="alpha_state"]')).toBeHidden();
  await expect(page.locator('#folder-panel .folder-item[data-file-name="beta_state"]')).toBeVisible();
});

// BLK-reviewer-20260917-0123-wish: 手順 5 (意図しない変更の混入確認) と手順 6 (SVG の
// レイアウト崩れ確認) は、前回 run の控えを自分で複製し、テキスト差分と
// `audit.js --since-files` を打つところから始まっていた。控えの本文は server が
// 上書き直前に `_versions/` へ取っており、👀他フォルダの一覧応答で既に画面の手元にある。
// 「前回保存版と今回保存版をソース + SVG で並べる」ことを到達条件にする。
const BA_ROOT = DIR + '-ba';
const BA_MINE = BA_ROOT + '/reviewer';
const BA_PRIMARY = BA_ROOT + '/primary';

const BA_V1 = ['@startuml', 'title TIMER', 'participant Timer_Driver', 'participant Irq_Ctrl',
  'Timer_Driver -> Irq_Ctrl : enable()', '@enduml'].join('\n');
// 内容の変更 (行が増えた)。
const BA_V2 = BA_V1.replace('@enduml', 'Irq_Ctrl -> Timer_Driver : ack()\n@enduml');
// 改名だけ (同じ語の一斉付け替え)。
const BA_REN = BA_V1.split('Timer_Driver').join('TimerDriver');

async function openPeekAt(page, name) {
  await page.locator('#btn-tab-peek').click();
  await page.waitForSelector('#peek-modal');
  await page.waitForSelector('#peek-files .peek-file[data-file-name="' + name + '"]');
  await page.locator('#peek-files .peek-file[data-file-name="' + name + '"]').click();
  await page.waitForSelector('#peek-ba-verdict');
}

test.describe('reviewer 手順 5〜6: primary の前回保存版と今回保存版を 1 画面で並べる', () => {
  test.beforeEach(async ({ page }) => {
    await S.bootWithSaveDir(page, BA_MINE);
    await S.clearDir(page, BA_MINE);
    await S.clearDir(page, BA_PRIMARY);
    await S.putDoc(page, BA_MINE, 'reviewer_memo', BA_V1);
  });

  test('無変化の回は、図を 1 枚も開かずに「読む図はありません」で終わる', async ({ page }) => {
    // 行末の空白だけが違う保存 = 控えは取られるが、描かれる内容は変わっていない。
    // reviewer が手順 5 で最も多く出会う「読まなくてよい差分」がこの形。
    await S.putDoc(page, BA_PRIMARY, 'timer_sequence', BA_V1);
    await S.putDoc(page, BA_PRIMARY, 'timer_sequence', BA_V1 + '   ');
    await page.reload();
    await page.waitForSelector('#btn-tab-peek');
    await openPeekAt(page, 'timer_sequence');

    // 到達条件その1: フォルダ全体の結論が、図を開く前に 1 行で出る。
    await expect(page.locator('#peek-ba-summary')).toContainText('読む図はありません');
    await expect(page.locator('#peek-ba-summary')).toHaveAttribute('data-ba-toread', '0');
    // 到達条件その2: 1 図の判定も「差分なし」と言い切る (控えを複製して diff を打たない)。
    await expect(page.locator('#peek-ba-verdict')).toHaveAttribute('data-ba-verdict', 'same');
    await expect(page.locator('#peek-ba-verdict')).toContainText('読み直す必要はありません');
  });

  test('内容が変わった図は、前後のソースと SVG が並んで出る', async ({ page }) => {
    await S.putDoc(page, BA_PRIMARY, 'timer_sequence', BA_V1);
    await S.putDoc(page, BA_PRIMARY, 'timer_sequence', BA_V2);
    await page.reload();
    await page.waitForSelector('#btn-tab-peek');
    await openPeekAt(page, 'timer_sequence');

    await expect(page.locator('#peek-ba-verdict')).toHaveAttribute('data-ba-verdict', 'content');
    await expect(page.locator('#peek-ba-verdict')).toContainText('中身を読んでください');
    await expect(page.locator('#peek-ba-summary')).toHaveAttribute('data-ba-toread', '1');

    // 到達条件その3: 押せば前後のソースが左右に並ぶ (全文。代表行に切り詰めない)。
    await page.locator('#peek-ba-toggle').click();
    await page.waitForSelector('#peek-ba-body');
    await expect(page.locator('#peek-ba-prev')).toContainText('前回保存版');
    await expect(page.locator('#peek-ba-prev')).toContainText('enable()');
    await expect(page.locator('#peek-ba-now')).toContainText('ack()');
    // 増えた行は今回側だけに印が付く。
    await expect(page.locator('#peek-ba-now .ba-add')).toHaveCount(1);
    await expect(page.locator('#peek-ba-prev .ba-add')).toHaveCount(0);

    // 到達条件その4: 手順 6 の材料 (前後の SVG) が同じ画面に並ぶ。
    await expect(page.locator('#peek-ba-svg-note')).toContainText('描き直して並べます');
    await page.waitForSelector('#peek-ba-svg-prev svg', { timeout: 60000 });
    await page.waitForSelector('#peek-ba-svg-now svg', { timeout: 60000 });
  });

  test('改名だけの差分は、組を名指しして「改名だけ」と言う', async ({ page }) => {
    await S.putDoc(page, BA_PRIMARY, 'timer_sequence', BA_V1);
    await S.putDoc(page, BA_PRIMARY, 'timer_sequence', BA_REN);
    await page.reload();
    await page.waitForSelector('#btn-tab-peek');
    await openPeekAt(page, 'timer_sequence');

    await expect(page.locator('#peek-ba-verdict')).toHaveAttribute('data-ba-verdict', 'rename');
    await expect(page.locator('#peek-ba-verdict')).toContainText('Timer_Driver → TimerDriver');
    // 改名でも描画の幅は動くので、手順 6 は省かない。
    await page.locator('#peek-ba-toggle').click();
    await expect(page.locator('#peek-ba-svg-note')).toContainText('描き直して並べます');
  });
});
