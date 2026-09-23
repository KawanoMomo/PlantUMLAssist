// @ts-check
// junior 台本 手順8: 保存した .puml を一覧から見つけて開き直す。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);
const NAME = 'GPIO状態遷移(資料用)';

test('手順8 保存した .puml を一覧から見つけて開き直せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, NAME, S.GPIO_STATE);

  await S.openFolder(page);
  const filter = page.locator('#folder-filter');
  if (await filter.count()) { await filter.fill('資料用'); await page.waitForTimeout(400); }
  // 到達条件その1: 名前で見つかる。
  await expect(page.locator('#folder-panel .folder-item[data-file-name="' + NAME + '"]')).toBeVisible();

  await S.openFolderItem(page, NAME);
  // 到達条件その2: 開き直した本文が保存した内容と一致し、編集中の本文で上書きされていない。
  expect(await page.locator('#editor').inputValue()).toContain('GPIOドライバ状態遷移');
  expect(await S.readDoc(page, DIR, NAME)).toContain('GPIOドライバ状態遷移');
});

// BLK-junior-20260912-2103: 開き直した図の図種が本文と合っていないと、その図種でしか
// 使えない機能 (「シーケンス図からアクティビティ図を起こす」) が使えない。
// `Timer_Init()` のようにメッセージ名に丸括弧が付くシーケンス図が、フォルダから
// 開いたときに UseCase と判定されていた。
const SEQ_NAME = 'TIMERドライバ初期化シーケンス';
const SEQ_WITH_PARENS = [
  '@startuml',
  'title TIMERドライバ初期化シーケンス',
  'actor Dev',
  'participant Timer_Driver',
  'participant Mcu_Clock',
  'Dev -> Timer_Driver : Timer_Init()',
  'Timer_Driver -> Mcu_Clock : Mcu_EnableClock()',
  'Mcu_Clock --> Timer_Driver : E_OK',
  'Timer_Driver --> Dev : E_OK',
  '@enduml',
].join('\n');

test('手順8 メッセージ名に丸括弧のあるシーケンス図を、シーケンス図として開き直せる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, SEQ_NAME, SEQ_WITH_PARENS);

  await S.openFolder(page);
  await S.openFolderItem(page, SEQ_NAME);
  await page.waitForTimeout(1200);

  // 到達条件その1: 本文が開き、図種が Sequence になっている (UseCase に化けない)。
  expect(await page.locator('#editor').inputValue()).toContain('Timer_Init()');
  expect(await page.locator('#diagram-type').inputValue()).toBe('plantuml-sequence');

  // 到達条件その2: シーケンス図でしか使えない操作が、貼り直さずにそのまま使える。
  await page.keyboard.press('Control+k');
  await page.waitForSelector('#cp-modal');
  await page.locator('#cp-input').fill('アクティビティ');
  await page.waitForTimeout(300);
  const items = page.locator('#cp-list .cp-item');
  await expect(items.first()).toBeVisible();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  await expect(page.locator('#cp-modal')).toBeHidden();
  // 「シーケンス図を開いてから使ってください」で止まらず、たたき台が別タブで開く。
  expect(await page.locator('#diagram-type').inputValue()).toBe('plantuml-activity');
  const draft = await page.locator('#editor').inputValue();
  expect(draft).toContain('start');
  expect(draft).toMatch(/^\s*:.+;\s*$/m);   // シーケンスのメッセージがアクションになっている
});

// BLK-junior-20260915-2346: 同じ図を 1 run の中で 3 回開き直すのに、「直前に開いていた図」が
// どこにも残らず、出戻りのたびに 📂 一覧を開いて 20 枚超の行から名前を目で探し直していた。
// 開いた図を憶えて、一覧の上端と Ctrl+K の両方から名前を探さずに戻れるようにする。
const RECENT_TARGET = 'spi_usecase';
const RECENT_OTHER = 'adc_sequence';

test('手順8 一度開いた図には、名前を探し直さずに一覧の「最近開いた図」から戻れる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  await S.putDoc(page, DIR, RECENT_TARGET, S.GPIO_STATE);
  await S.putDoc(page, DIR, RECENT_OTHER, S.GPIO_STATE);

  // まだ何も開いていない回は、今までどおりの一覧 (履歴の行は出ない)。
  await S.openFolder(page);
  await page.waitForTimeout(1200);
  await expect(page.locator('#folder-recent')).toHaveCount(0);

  await S.openFolderItem(page, RECENT_TARGET);
  await S.openFolderItem(page, RECENT_OTHER);

  // 到達条件その1: 一覧の上端に、開いた図が新しい順で出る。
  await S.openFolder(page);
  await page.waitForTimeout(1200);
  const recent = page.locator('#folder-recent .folder-recent-item');
  await expect(recent.first()).toBeVisible();
  expect(await recent.nth(0).getAttribute('data-recent-name')).toBe(RECENT_OTHER);
  expect(await recent.nth(1).getAttribute('data-recent-name')).toBe(RECENT_TARGET);

  // 到達条件その2: その 1 件を押すだけで同じ図に戻る (名前を打ち直さない)。
  await recent.nth(1).click();
  await page.waitForTimeout(1200);
  expect(await page.locator('#editor').inputValue()).toContain('GPIOドライバ状態遷移');

  // 到達条件その3: 一覧を開かなくても Ctrl+K から同じ図へ戻れる。
  await S.openFolderItem(page, RECENT_OTHER);
  await page.keyboard.press('Control+k');
  await page.waitForSelector('#cp-modal');
  await page.locator('#cp-input').fill(RECENT_TARGET);
  await page.waitForTimeout(400);
  await expect(page.locator('#cp-list .cp-item').first()).toContainText('最近開いた図');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1400);
  expect(await page.locator('#editor').inputValue()).toContain('GPIOドライバ状態遷移');
});

// BLK-human-20260923-1701 (design 10b): 開き直す・並べる・名前を変える・消すが、タブ列・ツール ▾・
// 下端の札に散らばっていて「この図に何ができるか」を入口ごとに探し直していた。
// FILES ツリーのファイルを右クリックすれば全部そこにある。キーボード (F2 / Delete / ↑↓) と
// ドラッグ (別の部品のフォルダへ移す) でも同じ操作ができる。
async function expandPart(page, part) {
  await S.openFolder(page);
  const head = page.locator('#files-parts .files-part-head[data-part="' + part + '"]');
  await expect(head).toBeVisible();
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'true');
}
function treeFile(page, name) {
  return page.locator('#files-parts .files-part-file[data-file-name="' + name + '"]');
}
async function seedParts(page) {
  await S.bootWithSaveDir(page, DIR);
  await S.clearDir(page, DIR);
  for (const n of ['spi_init_sequence', 'spi_state', 'adc_state']) {
    await S.putDoc(page, DIR, n, S.docFor(n));
  }
  await S.putDoc(page, DIR, 'spi_class', ['@startuml', 'class Spi_Driver', '@enduml'].join('\n'));
  await page.reload();
  await page.waitForSelector('#editor');
}

test('手順8 FILES ツリーのファイルを右クリックすると 10b の操作が揃い、「開く」で開き直せる', async ({ page }) => {
  await seedParts(page);
  await expandPart(page, 'spi');

  await treeFile(page, 'spi_state').click({ button: 'right' });
  const menu = page.locator('#files-ctx-menu');
  await expect(menu).toBeVisible();
  // 到達条件その1: ファイル単位の操作がこの 1 か所に揃う。
  const labels = await menu.locator('.files-ctx-item .files-ctx-label').allTextContents();
  expect(labels).toEqual([
    '開く', '右に並べて開く', '読むだけのフォルダの同じ図と比較', '前回保存版と比較',
    '過去のコミットと比較…', 'この図の履歴を表示', '名前を変更', '複製', '別のフォルダへ移動…',
    '一時控えにする', 'SVG で書き出す', 'エクスプローラで場所を開く', '削除',
  ]);
  // Git でない保存先では「過去のコミットと比較」は押せない。
  await expect(menu.locator('[data-action="cmp-commit"]')).toBeDisabled();
  await expect(menu.locator('[data-action="rename"] .files-ctx-key')).toHaveText('F2');

  // 到達条件その2: 「開く」でその図が開く。
  await menu.locator('[data-action="open"]').click();
  await expect(menu).toBeHidden();
  await expect.poll(() => page.locator('#editor').inputValue()).toContain('SPI 状態遷移');

  // 到達条件その3: Esc でメニューが閉じる。
  await treeFile(page, 'spi_class').click({ button: 'right' });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  // 到達条件その4: フォルダの右クリックは「そこに作る」。部品のフォルダは実在のフォルダではないので
  // 保存先 / 読むだけ は出さない。
  await page.locator('#files-parts .files-part-head[data-part="spi"]').click({ button: 'right' });
  await expect(menu.locator('.files-ctx-item .files-ctx-label')).toHaveText(['新しい図', '6 図種をまとめて作る']);
  await page.keyboard.press('Escape');
  await page.locator('#btn-tab-folder').click({ button: 'right' });
  await expect(menu.locator('.files-ctx-item .files-ctx-label'))
    .toHaveText(['新しい図', '6 図種をまとめて作る', '保存先にする', '読むだけにする']);
  await page.keyboard.press('Escape');
});

test('手順8 右クリックの「複製」、F2 で名前変更、Delete で削除 (確認あり) がツリーの上でできる', async ({ page }) => {
  await seedParts(page);
  await expandPart(page, 'spi');

  // 複製 → spi_state_copy がツリーとフォルダに増える。
  await treeFile(page, 'spi_state').click({ button: 'right' });
  await page.locator('#files-ctx-menu [data-action="copy"]').click();
  await expect(treeFile(page, 'spi_state_copy')).toBeVisible();
  expect(await S.readDoc(page, DIR, 'spi_state_copy')).toContain('SPI 状態遷移');

  // F2 → 名前を打つ → 付け替わる (前の名前のファイルは残らない)。
  await treeFile(page, 'spi_state_copy').focus();
  page.once('dialog', (d) => d.accept('spi_state_v2'));
  await page.keyboard.press('F2');
  await expect(treeFile(page, 'spi_state_v2')).toBeVisible();
  await expect(treeFile(page, 'spi_state_copy')).toHaveCount(0);
  expect(await S.readDoc(page, DIR, 'spi_state_copy')).toBeNull();

  // ↑↓ で行を移れる (Enter で開く・→ ← で開閉と同じ行の並び)。
  await treeFile(page, 'spi_state_v2').focus();
  await page.keyboard.press('ArrowUp');
  const up = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-file-name'));
  expect(up).not.toBe('spi_state_v2');

  // Delete → 確認で「いいえ」なら消えない、「はい」で消える。
  await treeFile(page, 'spi_state_v2').focus();
  page.once('dialog', (d) => d.dismiss());
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  expect(await S.readDoc(page, DIR, 'spi_state_v2')).toContain('SPI 状態遷移');
  await treeFile(page, 'spi_state_v2').focus();
  page.once('dialog', (d) => d.accept());
  await page.keyboard.press('Delete');
  await expect(treeFile(page, 'spi_state_v2')).toHaveCount(0);
  expect(await S.readDoc(page, DIR, 'spi_state_v2')).toBeNull();
});

test('手順8 ファイルを別の部品のフォルダへドラッグすると、その部品の名前に付け替わる', async ({ page }) => {
  await seedParts(page);
  await expandPart(page, 'spi');
  await treeFile(page, 'spi_class').dragTo(page.locator('#files-parts .files-part-head[data-part="adc"]'));
  await expect.poll(async () => (await S.readDoc(page, DIR, 'adc_class')) || '').toContain('Spi_Driver');
  expect(await S.readDoc(page, DIR, 'spi_class')).toBeNull();
  await expect(page.locator('#files-parts .files-part-head[data-part="adc"]')).toContainText('ADC 2 / 6');
});

test('手順8 Ctrl+P で同じ検索欄がファイル名に絞られて開き、名前を打って Enter で開ける', async ({ page }) => {
  await seedParts(page);
  await page.locator('#editor').click();
  await page.keyboard.press('Control+p');
  await expect(page.locator('#cp-modal')).toHaveClass(/open/);
  await expect(page.locator('#cp-foot')).toContainText('ファイル');
  await page.keyboard.type('adc_state');
  await expect(page.locator('#cp-list .cp-item').first()).toContainText('adc_state');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.locator('#editor').inputValue()).toContain('ADC 状態遷移');
});

test('手順8 右クリックから「右に並べて開く」「前回保存版と比較」「この図の履歴」へそのまま入れる', async ({ page }) => {
  await seedParts(page);
  await expandPart(page, 'spi');
  const menu = page.locator('#files-ctx-menu');

  // 今の図 (spi_init_sequence) を開いたまま、spi_state を右の枠に並べる。
  await treeFile(page, 'spi_init_sequence').click();
  await expect.poll(() => page.locator('#editor').inputValue()).toContain('SPI 初期化シーケンス');
  await treeFile(page, 'spi_state').click({ button: 'right' });
  await menu.locator('[data-action="open-side"]').click();
  await expect(page.locator('#compare-pane')).toBeVisible();
  // 左 (編集中) は元の図のまま、右に並べた図が出る。
  await expect.poll(() => page.locator('#editor').inputValue()).toContain('SPI 初期化シーケンス');
  await expect(page.locator('#compare-pane')).toContainText('spi_state');
  await page.locator('#btn-compare-close').click();

  // 前回保存版と比較 → その図を開いて ± 差分の面。
  await treeFile(page, 'spi_state').click({ button: 'right' });
  await menu.locator('[data-action="cmp-saved"]').click();
  await expect(page.locator('#compare-pane')).toBeVisible();
  await expect(page.locator('#compare-pane')).toHaveClass(/mode-diff/);
  await expect.poll(() => page.locator('#editor').inputValue()).toContain('SPI 状態遷移');

  // この図の履歴 → 変遷の画面。
  await treeFile(page, 'spi_class').click({ button: 'right' });
  await menu.locator('[data-action="history"]').click();
  await expect(page.locator('#vt-modal')).toBeVisible();
});

test('手順8 外から .puml をツリーに落とすと保存先へ取り込む (複数可、同名は上書きしない)', async ({ page }) => {
  await seedParts(page);
  await S.openFolder(page);
  // ブラウザの外からのドロップは Playwright の実マウスでは作れないので、落ちた後の取り込みの道を直に通す。
  const msg = await page.evaluate(async () => {
    const f1 = new File(['@startuml\ntitle TIMER 状態遷移\n[*] --> Idle\n@enduml\n'], 'timer_state.puml');
    const f2 = new File(['@startuml\nclass X\n@enduml\n'], 'spi_state.puml');
    const f3 = new File(['x'], 'memo.png');
    await window.MA.fileMenuUi.importFiles([f1, f2, f3]);
    return (document.getElementById('status-save-result') || {}).textContent || '';
  });
  expect(await S.readDoc(page, DIR, 'timer_state')).toContain('TIMER 状態遷移');
  // 同じ名前の図は上書きしない。
  expect(await S.readDoc(page, DIR, 'spi_state')).toContain('SPI 状態遷移');
  expect(msg).toContain('1 枚を保存先へ取り込みました');
  await expect(page.locator('#files-parts .files-part-head[data-part="timer"]')).toBeVisible();
});
