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


// BLK-reviewer-20260915-2346-wish: 手順5 の突合のうち「前回保存版から中身が大きく
// 消えた」向きは、reviewer が手元の複製と diff を手で打って初めて分かった。
// 書いた本人 (primary) の画面には、保存を押すまで何行消えるかがどこにも出ていない。
// 状態バーに常時 ＋a −b を出し、押せば前回保存版と現在を全文で並べる。
const BIG_CLASS = ['@startuml', 'title driver_common_class'].concat(
  ['Spi', 'Can', 'Gpio', 'Irq', 'Uart', 'Adc', 'Timer', 'Dma', 'Pwm', 'Wdg']
    .map((c) => `class ${c}_Regs {\n  +Init()\n  +DeInit()\n  +Read()\n}`)
).concat(['@enduml']).join('\n');

// 保存先 (フォルダ) を決めてある回は、保存先の図も直したその場でファイルへ書く
// (TICKET-owner-20261115-1829-prune で「上書きしますか」の窓を外した。窓に答えるまでの間だけ「保存前」があった)。
// 「保存を押す前」が残るのは保存先を決めていない (ダウンロード保存の) 回なので、そこで見る。
test('手順5 前回保存版から何行消えるかが、保存を押す前に状態バーに出ている', async ({ page }) => {
  await S.bootDownloadMode(page, DIR + '-dl');
  await S.renameActive(page, 'driver_common_class');
  await S.typeDsl(page, BIG_CLASS);
  await page.locator('#editor').click();
  const dl = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  await dl;
  await expect(page.locator('#top-save')).toHaveAttribute('data-save-state', 'saved', { timeout: 10000 });

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
  // TICKET-owner-20261115-2141-prune: 変わった行数を常時出す札 (比較の入口) は外した
  // (前回保存版と比べるのは「この図の履歴」の比較)。普通の増減では札は出ない。
  await expect(chip).toBeHidden();

  // 事故の形: 中身が雛形に戻ってしまった (77 行 → 4 行と同じ向き)。
  await S.typeDsl(page, TEMPLATE_CLASS);
  await page.waitForTimeout(400);
  // 到達条件その2: 保存を押す前に、消える側だと分かる印が出る (図を失わないための守りなので、この形のときだけ出す)。
  await expect(chip).toHaveAttribute('data-livediff', 'shrink');
  await expect(chip).toBeVisible();
  // 警告は文字ではなく点の色で出す (文字色・形は他の札と同じ)。
  await expect(chip).toHaveAttribute('data-dot', 'bad');
  await expect(chip).toHaveAttribute('title', /いま保存すると .* 行に減ります/);

  // 到達条件その3: 押すと前回保存版と現在が並び、消える行が名指しされる (1 操作)。
  // BLK-owner-20260923-1307-prune: 並べる画面は参照ペインの ± 差分タブ 1 つに寄せた。
  // 警告の札はその画面を開く入口で、開いた先で見えるもの (警告・消える行・戻す) は変わらない。
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

