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

// BLK-reviewer-20260914-1806: 手順5 は「下書きが本体に反映されたか」を、audit.js の
// 出力 (kind 不一致 1 件) と前回控えとの byte 比較・下書きの目視でしか判定できず、
// 同じ図を 2 tick 続けて手で確かめていた。reviewer は GUI を開かない運用なので、
// 台帳 (swap-queue) と前回控えの内訳をテキスト側にも出す。
test('手順5 下書きの反映待ちと、前回控えとの増減の内訳を、GUI を開かずに読める', () => {
  const fs = require('fs');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const REPO = path.join(__dirname, '..', '..', '..');
  const dir = path.join(REPO, 'test-results', 'reviewer-05-drafts');

  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plantuml-usecase.puml'), BASE_CLASS, 'utf-8');
  fs.writeFileSync(path.join(dir, 'plantuml-usecase-編集中.puml'), DRAFT_CLASS, 'utf-8');
  const old = new Date(Date.now() - 60000);
  fs.utimesSync(path.join(dir, 'plantuml-usecase.puml'), old, old);

  // 到達条件 1: 「下書きが未反映のまま残っているか」が 1 本のコマンドで出る。
  const out = execFileSync(process.execPath,
    [path.join(REPO, 'tools', 'audit.js'), dir, '--drafts'], { cwd: REPO, encoding: 'utf-8' });
  expect(out).toContain('本体へ差し替え待ち 1 枚');
  expect(out).toContain('plantuml-usecase-編集中.puml → plantuml-usecase.puml');

  // 到達条件 2: 32→25 枚の内訳で、改名が「消失 + 追加」に化けない。
  const { loadMA } = require('../../../tools/audit-runtime');
  const scope = require('../../../src/core/audit-scope');
  const prev = scope.fileEntries([
    { name: 'old_name.puml', dsl: BASE_CLASS },
    { name: 'gone.puml', dsl: DRAFT_CLASS },
  ]);
  const cur = scope.fileEntries([
    { name: 'new_name.puml', dsl: BASE_CLASS },
    { name: 'new_name-編集中.puml', dsl: BASE_CLASS + '\nclass Extra' },
  ]);
  const text = scope.formatFileDiff(scope.diffFiles(prev, cur), cur).join('\n');
  expect(text).toContain('改名: old_name.puml → new_name.puml');
  expect(text).toContain('消失: gone.puml');
  // 到達条件 3: 新しく起こした下書きは「増えた図」と数え分けられる。
  expect(text).toContain('うち新しい下書き 1 枚');
  expect(loadMA().MA).toBeTruthy();

  fs.rmSync(dir, { recursive: true, force: true });
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
  // 到達条件その1: 開いた直後は「前回保存版と同じ」と言い切る (常時出ている)。
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute('data-livediff', 'same');

  // 1 行だけ直した状態。保存はまだしていない。
  await S.typeDsl(page, BIG_CLASS.replace('+Init()', '+Start()'));
  await page.waitForTimeout(400);
  await expect(chip).toHaveAttribute('data-livediff', 'changed');
  await expect(chip).toContainText('＋1');
  await expect(chip).toContainText('−1');

  // 事故の形: 中身が雛形に戻ってしまった (77 行 → 4 行と同じ向き)。
  await S.typeDsl(page, TEMPLATE_CLASS);
  await page.waitForTimeout(400);
  // 到達条件その2: 保存を押す前に、消える側だと分かる印が出る。
  await expect(chip).toHaveAttribute('data-livediff', 'shrink');
  await expect(chip).toContainText('⚠');
  await expect(chip).toHaveAttribute('title', /いま保存すると .* 行に減ります/);

  // 到達条件その3: 押すと前回保存版と現在が並び、消える行が名指しされる (1 操作)。
  await chip.click();
  const panel = page.locator('#vdiff-panel');
  await expect(panel).toHaveClass(/open/);
  await expect(page.locator('#vdiff-title')).toContainText('前回保存版 → いまの中身 (未保存)');
  await expect(page.locator('#vdiff-head')).toHaveAttribute('data-vd-warn', '1');
  await page.locator('#btn-vdiff-all').click();
  await expect(page.locator('#vdiff-body .vd-del').filter({ hasText: 'Spi_Regs' })).toHaveCount(1);
  expect(Number(await page.locator('#vdiff-head').getAttribute('data-vd-removed'))).toBeGreaterThan(20);

  // BLK-reviewer-20260916-0046-wish: 差分は見えるようになったが、気付いた後に戻す手段が
  // 比較画面に無く、消えた分は手順をやり直して書き直すしかなかった (それ自体が今日の
  // 手順のやり直しになる)。並べている左側へ 1 クリックで戻し、reviewer は差が 0 に
  // なったことだけ確認すればよいようにする。
  // 到達条件その4: 比較画面に「前回保存版に戻す」があり、1 クリックで中身が戻る。
  const restore = page.locator('#btn-vdiff-restore');
  await expect(restore).toBeVisible();
  await expect(restore).toHaveAttribute('title', /消えた \d+ 行が戻り/);
  await restore.click();
  await page.waitForTimeout(400);
  // 到達条件その5: 戻した直後の画面が、差が 0 になったことをそのまま映す
  // (確かめ直しのために別の画面を開かせない)。
  await expect(chip).toHaveAttribute('data-livediff', 'same');
  await expect(page.locator('#vdiff-head')).toHaveAttribute('data-vd-removed', '0');
  await expect(page.locator('#vdiff-head')).toHaveAttribute('data-vd-added', '0');
  // 戻せば何も戻すものが無いので、ボタン自体が引っ込む。
  await expect(restore).toBeHidden();
  // 消えていた 10 クラスが本文に戻っている (再入力していない)。
  expect(await page.locator('#editor').inputValue()).toContain('Wdg_Regs');
});

// BLK-reviewer-20260916-0046: 手順5 で `audit.js --since-files <控え>` は
// 「可視内容の食い違い」として図名を並べるが、何が消えたかは出さない。
// 指摘.md に「クラス定義が全消え」と具体を書くには、控えのフォルダと現物を
// diff コマンドで突き合わせ直すしかなく、食い違う図が増えるほどその手 diff が増える。
// 同じ 1 コマンドの中で、消えた行数と代表行まで読めることを到達条件にする。
test('手順5 控えと変わった図を、消えた行まで同じ 1 コマンドで読める', () => {
  const fs = require('fs');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const REPO = path.join(__dirname, '..', '..', '..');

  const root = path.join(REPO, 'test-results', 'reviewer-05-since-detail');
  fs.rmSync(root, { recursive: true, force: true });
  const prev = path.join(root, 'prev');
  const cur = path.join(root, 'cur');
  for (const d of [prev, cur]) fs.mkdirSync(d, { recursive: true });

  // 事故の実物: クラス定義がまるごと消えて title だけが残った。
  fs.writeFileSync(path.join(prev, 'driver_common_class.puml'), FULL_CLASS, 'utf-8');
  fs.writeFileSync(path.join(cur, 'driver_common_class.puml'),
    ['@startuml', 'title driver_common_class', '@enduml'].join('\n'), 'utf-8');
  // コメントだけ戻した図は「変わった」と出るが、描かれる行は同じ。
  const state = ['@startuml', '[*] --> Idle', 'Idle --> Busy : go', '@enduml'].join('\n');
  fs.writeFileSync(path.join(prev, 'spi_state.puml'), state, 'utf-8');
  fs.writeFileSync(path.join(cur, 'spi_state.puml'),
    ['@startuml', "' domain-verdict: separate", '[*] --> Idle', 'Idle --> Busy : go', '@enduml'].join('\n'),
    'utf-8');

  const out = execFileSync(process.execPath,
    [path.join(REPO, 'tools', 'audit.js'), cur, '--summary', '--since-files', prev, '--no-state'],
    { cwd: REPO, encoding: 'utf-8' });

  // 到達条件 1: 変わった図の名指しは今までどおり出る。
  expect(out).toContain('実データ変化: driver_common_class.puml, spi_state.puml');
  // 到達条件 2: 何行消えたかと、指摘にそのまま写せる代表行が同じ出力に出る。
  expect(out).toMatch(/変化の中身: driver_common_class\.puml\s+−\d+ 行 \/ \+0 行/);
  expect(out).toContain('消えた行: class Spi_Driver {');
  // 到達条件 3: 描かれる行が動いていない図は、手 diff に戻らず 1 行で片付く。
  expect(out).toContain('spi_state.puml  描かれる行に差なし');

  fs.rmSync(root, { recursive: true, force: true });
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

// BLK-reviewer-20260916-0526-wish: 変化の中身は代表行 + 件数までしか出ないので、
// −3 行/+76 行のような大きな復元が「以前より充実しているか (継承・note が揃っているか)」は
// 決められず、結局 cat でファイル全体を読み直していた。閾値を超えた図は同じ 1 コマンドの
// 中で全文まで開き、小さい図は代表行のままにする ＝ 手順5 のコマンド往復を 0 にする。
test('手順5 大きく変わった図は、同じ 1 コマンドの中で全文diffまで読める', () => {
  const fs = require('fs');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const REPO = path.join(__dirname, '..', '..', '..');

  const root = path.join(REPO, 'test-results', 'reviewer-05-full-diff');
  fs.rmSync(root, { recursive: true, force: true });
  const prev = path.join(root, 'prev');
  const cur = path.join(root, 'cur');
  for (const d of [prev, cur]) fs.mkdirSync(d, { recursive: true });

  // 事故の実物: 4 tick 空洞化していた図が、note 付きで以前より充実して復元された。
  const GUTTED = ['@startuml', 'title driver_common_class', 'class Driver_Common', '@enduml'].join('\n');
  const RESTORED = ['@startuml', 'title driver_common_class', 'class Driver_Common {']
    .concat(Array.from({ length: 30 }, (_, i) => `  +Op${i}() : void`))
    .concat(['}', 'class Spi_Driver', 'Driver_Common <|-- Spi_Driver',
             'note right of Spi_Driver : SPI 系はここに集める', '@enduml']).join('\n');
  fs.writeFileSync(path.join(prev, 'driver_common_class.puml'), GUTTED, 'utf-8');
  fs.writeFileSync(path.join(cur, 'driver_common_class.puml'), RESTORED, 'utf-8');
  // 代表行で足りる小さい変化は、全文を出さずに今までどおり 1 行で片付く。
  const SMALL = ['@startuml', '[*] --> Idle', 'Idle --> Busy : go', '@enduml'].join('\n');
  fs.writeFileSync(path.join(prev, 'diagram1.puml'), SMALL, 'utf-8');
  fs.writeFileSync(path.join(cur, 'diagram1.puml'), SMALL.replace('go', 'start'), 'utf-8');

  const run = (extra) => execFileSync(process.execPath,
    [path.join(REPO, 'tools', 'audit.js'), cur, '--summary', '--since-files', prev, '--no-state']
      .concat(extra || []), { cwd: REPO, encoding: 'utf-8' });

  const out = run();
  // 到達条件 1: 要約 (代表行) は今までどおり出る。
  expect(out).toContain('変化の中身: driver_common_class.puml');
  // 到達条件 2: 閾値を超えた図は、同じ出力の中に全文 diff が開く
  // (cat で読み直さないと分からなかった継承・note がその場に出る)。
  expect(out).toContain('全文diff driver_common_class.puml');
  expect(out).toContain('+ Driver_Common <|-- Spi_Driver');
  expect(out).toContain('+ note right of Spi_Driver : SPI 系はここに集める');
  // 動いていない行も残る (全文なので、出ない行があってはならない)。
  expect(out).toContain('title driver_common_class');
  // 到達条件 3: 小さい変化の図は全文を出さない (要約が全文で押し流されない)。
  expect(out).not.toContain('全文diff diagram1.puml');

  // 到達条件 4: 小さい図も見たいときは名指しで開ける (閾値を見ない)。
  const named = run(['--full-diff', 'diagram1']);
  expect(named).toContain('全文diff diagram1.puml');
  expect(named).toContain('+ Idle --> Busy : start');

  // 到達条件 5: 全文が邪魔な run では促しだけに戻せる (見落としは防いだまま)。
  const off = run(['--no-full-diff']);
  expect(off).not.toContain('全文diff driver_common_class.puml');
  expect(off).toContain('全文diffで確認: driver_common_class.puml');

  fs.rmSync(root, { recursive: true, force: true });
});
