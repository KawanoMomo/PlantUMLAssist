// @ts-check
// junior 台本 手順9: 「先輩の図」の枠を、要るときだけ横に出して読む。
//
// BLK-human-20260915-1203: 枠が起動時から出ていて × を押しても隠れず、幅も変えられなかった
// (CSS の `display: flex` が `hidden` 属性より強く、枠を消す手立てが無かった)。
// 既定は閉じ・× で閉じる・閉じたまま覚える・境目で幅が変わる、をここで守る。
const { test, expect } = require('@playwright/test');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順9 比較相手の枠は既定で出ず、並べて比較で開き、× で閉じ、開き直しても閉じたまま', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);

  const pane = page.locator('#senior-pane');
  // BLK-builder-20260924-1716-4 (design 9c / 10a): 相手が決まるまで下端の札は出ない (0 件は出さない)。
  // 入口は FILES ツリーの「読むだけ」の ⇔。
  const entry = page.locator('#btn-tab-senior');
  await expect(page.locator('#status-senior')).toBeHidden();

  // 到達条件その1: 起動直後は枠が無い (自分の図とプレビューだけが見えている)。
  await expect(pane).toBeHidden();

  // 到達条件その2: FILES「読むだけ」の ⇔ 1 クリックで開く。
  await entry.click();
  await expect(pane).toBeVisible();

  // 到達条件その3: 初めて開いたときだけ「この枠は何か」が 1 行出る。
  const note = page.locator('#senior-first-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('読むだけ');

  // 到達条件その4: × で確実に閉じる。
  await page.locator('#senior-close').click();
  await expect(pane).toBeHidden();

  // 到達条件その5: 読み込み直しても閉じたまま (既定に戻らない)。
  // 全体実行では保存先の取り込み (/prefs) が遅れ、画面が押せるようになる前に押して
  // 落ちていた (BLK-builder-20260924-0637-4b-red)。遅い回をここで再現しておく。
  await page.route('**/prefs', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await S.reopenApp(page);
  await expect(page.locator('#senior-pane')).toBeHidden();

  // 2 回目に開いたときは説明を繰り返さない。
  await page.locator('#btn-tab-senior').click();
  await expect(page.locator('#senior-pane')).toBeVisible();
  await expect(page.locator('#senior-first-note')).toBeHidden();
});

test('手順9 枠とプレビューの境目をドラッグして幅を変えられ、幅は覚えている', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await page.locator('#btn-tab-senior').click();
  await expect(page.locator('#senior-pane')).toBeVisible();

  const handle = page.locator('#resizer-senior');
  // 到達条件その1: 枠が開いていれば取っ手も出ている (閉じている間は出ない)。
  await expect(handle).toBeVisible();

  const before = await page.locator('#senior-pane').boundingBox();
  const hb = await handle.boundingBox();
  if (!before || !hb) throw new Error('枠か取っ手が描かれていない');

  // 到達条件その2: 左へ 120px 引けば枠がその分広がる。
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 - 120, hb.y + hb.height / 2, { steps: 6 });
  await page.mouse.up();

  const after = await page.locator('#senior-pane').boundingBox();
  if (!after) throw new Error('枠が消えた');
  expect(after.width).toBeGreaterThan(before.width + 60);

  // 到達条件その3: 読み込み直しても広げた幅のまま。
  await S.reopenApp(page);
  await expect(page.locator('#senior-pane')).toBeVisible();
  const reopened = await page.locator('#senior-pane').boundingBox();
  if (!reopened) throw new Error('開いたままのはずの枠が無い');
  expect(Math.abs(reopened.width - after.width)).toBeLessThan(12);
});

// 参照ペイン (別タブの図を並べる方) と操作を揃える: 片方だけ挙動が違う状態にしない。
test('手順9 参照ペインも同じく ✕ で閉じ、境目で幅を変えられる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);

  const pane = page.locator('#compare-pane');
  await expect(pane).toBeHidden();

  await page.evaluate(() => { window.toggleCompareView(true, 'ref'); });
  await expect(pane).toBeVisible();

  const handle = page.locator('#resizer-compare');
  await expect(handle).toBeVisible();

  const before = await pane.boundingBox();
  const hb = await handle.boundingBox();
  if (!before || !hb) throw new Error('参照ペインか取っ手が描かれていない');
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 - 100, hb.y + hb.height / 2, { steps: 6 });
  await page.mouse.up();
  const after = await pane.boundingBox();
  if (!after) throw new Error('参照ペインが消えた');
  expect(after.width).toBeGreaterThan(before.width + 50);

  await page.locator('#btn-compare-close').click();
  await expect(pane).toBeHidden();
  await expect(handle).toBeHidden();
});

// BLK-human-20260923-1600 (design 9a): 「⇔ 先輩」と「他の保存フォルダの版と見比べる」で
// 2 つあった入口を「並べて比較」1 つにし、据え置く / 1 回だけを枠の中で切り替える。
test('手順9 枠は「比較相手」と名乗り、据え置く / 1 回だけを枠の中で選べる', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await page.locator('#btn-tab-senior').click();
  await expect(page.locator('#senior-pane')).toBeVisible();

  // 到達条件その1: 枠の見出しは立場 (先輩) ではなく役割 (比較相手) で名乗る。
  await expect(page.locator('#senior-head strong')).toHaveText('比較相手');

  // 到達条件その2: 2 択は枠の中にあり、既定は据え置き。
  const keep = page.locator('#senior-mode-keep');
  const once = page.locator('#senior-mode-once');
  await expect(keep).toBeVisible();
  await expect(once).toBeVisible();
  await expect(keep).toHaveAttribute('aria-pressed', 'true');
  await expect(once).toHaveAttribute('aria-pressed', 'false');

  // 到達条件その3: 1 回だけを押すとそちらが効き、読み込み直しても覚えている。
  await once.click();
  await expect(once).toHaveAttribute('aria-pressed', 'true');
  await expect(keep).toHaveAttribute('aria-pressed', 'false');
  await S.reopenApp(page);
  await expect(page.locator('#senior-pane')).toBeVisible();
  await expect(page.locator('#senior-mode-once')).toHaveAttribute('aria-pressed', 'true');

  // 到達条件その4: 据え置きに戻せる (切り替えは片道ではない)。
  await page.locator('#senior-mode-keep').click();
  await expect(page.locator('#senior-mode-keep')).toHaveAttribute('aria-pressed', 'true');
});

// BLK-human-20260923-1702 (design 10c): 保存先が Git のとき、FILES ツリーの下端に GIT 欄が出て、
// コミット → 変更 → 「この図の履歴」の「比較」で、右の枠 (同じ比較相手の枠) に前の版が並ぶ。
test('手順9 保存先が Git なら、この図の履歴の「比較」で前のコミットの図が右の枠に並ぶ', async ({ page }) => {
  const fs = require('fs');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const rel = DIR + '-git';
  const abs = path.join(__dirname, '..', '..', '..', rel.replace(/^\.\//, ''));
  fs.rmSync(abs, { recursive: true, force: true });
  fs.mkdirSync(abs, { recursive: true });
  const git = (...a) => execFileSync('git', ['-C', abs, ...a], { stdio: 'pipe' }).toString();
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'junior');
  git('config', 'user.email', 'junior@example.invalid');
  git('config', 'core.autocrlf', 'false');
  const V1 = '@startuml\ntitle SPI 初期化\nparticipant App\nparticipant SpiDrv\nApp -> SpiDrv : Spi_Init()\n@enduml\n';
  fs.writeFileSync(path.join(abs, 'spi_init_sequence.puml'), V1);
  git('add', '-A');
  git('commit', '-q', '-m', '初版');

  await S.bootWithSaveDir(page, rel);

  // 到達条件その1: Git の保存先では GIT 欄が出て、畳んだままブランチが読める。
  const head = page.locator('#files-sec-git');
  await expect(head).toBeVisible();
  await expect(page.locator('#files-count-git')).toContainText('main');
  // design 10a / 10c (BLK-builder-20260924-1655-2): GIT の見出しはツリーの左下 (下端の要約の直上)。
  const gitBox = await head.boundingBox();
  const sumBox = await page.locator('#files-summary').boundingBox();
  expect(gitBox && sumBox && Math.abs(gitBox.y + gitBox.height - sumBox.y) < 4).toBe(true);

  // 図を開いて直す (錠は「書き換える」で外す)。
  await S.openFolderItem(page, 'spi_init_sequence');
  await S.overwriteOpenedFile(page);
  const now = await page.locator('#editor').inputValue();
  await S.typeDsl(page, now.replace('@enduml', 'SpiDrv --> App : Fault\n@enduml'));
  await page.waitForTimeout(900);

  // 到達条件その2: 欄を開くと変更 M が出て、ツリーのファイル名にも M が付く。
  await head.click();
  await page.locator('#git-refresh').click();
  await expect(page.locator('#git-changes .git-change[data-git-code="M"]')).toContainText('spi_init_sequence.puml');
  await expect(page.locator('#files-body-open .files-row[data-git="M"]')).toHaveCount(1);

  // 到達条件その3: メッセージを書いてコミットすると、この図の履歴が 2 件になる。
  await page.locator('#git-message').click();
  await page.keyboard.type('Fault 通知の応答を追記');
  await page.locator('#git-commit').click();
  await expect(page.locator('#git-result')).toContainText('コミットしました');
  await expect(page.locator('#git-history .git-commit-row')).toHaveCount(2);
  await expect(page.locator('#git-changes .git-change')).toHaveCount(0);
  expect(git('log', '--format=%s')).toContain('Fault 通知の応答を追記');

  // 到達条件その4: 古いコミット (初版) の「比較」で、右の枠にその時点の図が並ぶ。
  const oldRow = page.locator('#git-history .git-commit-row').filter({ hasText: '初版' });
  await oldRow.locator('.git-history-compare').click();
  const pane = page.locator('#senior-pane');
  await expect(pane).toBeVisible();
  await expect(page.locator('#senior-git-pick')).toContainText('初版');
  await expect(page.locator('#senior-git-sides')).toContainText('左: 作業中 右:');
  await expect(page.locator('#senior-dsl')).toContainText('Spi_Init()');
  await expect(page.locator('#senior-dsl')).not.toContainText('Fault');
  await expect(page.locator('#senior-svg svg')).toHaveCount(1);

  // 到達条件その5: 「差分だけ」で作業中との違いの行だけになる (追記した行が + で出る)。
  await page.locator('#senior-git-diffonly').click();
  await expect(page.locator('#senior-dsl .sg-add')).toContainText('Fault');
  await expect(page.locator('#senior-dsl .sg-same')).toHaveCount(0);

  // 到達条件その6: ▶ で 1 つ新しいコミットへ送れる (最新では ▶ が止まる)。
  await page.locator('#senior-git-next').click();
  await expect(page.locator('#senior-git-pick')).toContainText('Fault 通知の応答を追記');
  await expect(page.locator('#senior-git-next')).toBeDisabled();
  await page.locator('#senior-git-prev').click();
  await expect(page.locator('#senior-git-pick')).toContainText('初版');

  // 到達条件その7: 相手の名前を押すと相手選びがその場で開き、先頭は作業中。絞り込んで選べる。
  await page.locator('#senior-git-pick').click();
  const modal = page.locator('#git-pick-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.git-pick-row').first()).toContainText('作業中（未コミット）');
  await page.locator('#git-pick-filter').click();
  await page.keyboard.type('Fault');
  await expect(modal.locator('.git-pick-row')).toHaveCount(2);
  await modal.locator('.git-pick-row').nth(1).click();
  await expect(modal).toBeHidden();
  await expect(page.locator('#senior-git-pick')).toContainText('Fault 通知の応答を追記');

  // 到達条件その8: 読むだけのフォルダを選び直すと、今までどおりの比較に戻る。
  await page.locator('#senior-git-pick').click();
  await page.locator('#git-pick-tab-folder').click();
  await modal.locator('.git-pick-row').first().click();
  await expect(page.locator('#senior-git')).toBeHidden();
  await expect(page.locator('#senior-dir')).toBeVisible();
});

test('手順9 Git でない保存先では GIT 欄を出さない', async ({ page }) => {
  await S.bootWithSaveDir(page, DIR);
  await page.waitForTimeout(800);
  await expect(page.locator('#files-panel [data-files-section="git"]')).toBeHidden();
});

// BLK-builder-20260924-1655-2 (design 10a): 「読むだけ」の見出しはツリーの下端に置く。保存先の図が多く、
// 一覧がツリーの高さを超えても、見出し (と畳んだままの件数・目の印 / ⇔) はスクロールせずに見えている。
test('手順9 保存先の図が多くても、読むだけの見出しはツリーの下端に見えている', async ({ page }) => {
  const dir = DIR + '-many';
  await S.bootWithSaveDir(page, dir);
  await S.clearDir(page, dir);
  const parts = ['adc', 'can', 'dma', 'eth', 'flash', 'gpio', 'i2c', 'icu', 'lin', 'mcu', 'nvm', 'ocu',
    'port', 'pwm', 'spi', 'timer', 'uart', 'wdg', 'fls', 'fee', 'ea', 'com', 'dem', 'dcm', 'pdur', 'canif'];
  for (const p of parts) await S.putDoc(page, dir, p + '_state', '@startuml\n[*] --> Off\n@enduml');
  await S.reopenApp(page);
  await expect(page.locator('#files-count-target')).toContainText(String(parts.length), { timeout: 10000 });
  const ro = page.locator('#files-sec-readonly');
  await expect(ro).toBeInViewport();
  const roBox = await ro.boundingBox();
  const sumBox = await page.locator('#files-summary').boundingBox();
  expect(roBox && sumBox && Math.abs(roBox.y + roBox.height - sumBox.y) < 4).toBe(true);
  // 保存先の一覧はその上で流れる (最後の部品は見出しの下に潜らず、流せば見える)。
  const last = page.locator('#files-parts .files-part-head').last();
  await last.scrollIntoViewIfNeeded();
  const lastBox = await last.boundingBox();
  const roBox2 = await ro.boundingBox();
  expect(lastBox && roBox2 && lastBox.y + lastBox.height <= roBox2.y + 1).toBe(true);
  // 見出しの行の目の印は畳んだまま押せる。
  await expect(page.locator('#btn-tab-peek')).toBeInViewport();
  await S.clearDir(page, dir);
});

// BLK-builder-20260924-1749-3 (design 10a「読むだけのフォルダ（先輩・過去の版）は下に分けて置き、右クリックから
// 「並べて比較」できます」「右の枠に並べている間は「比較中」と出ます」): 前は「読むだけ」を開いても説明の 1 行だけで、
// 隣の保存フォルダが 1 行も並ばず、見出しにも件数・比較中が出なかった。
test('手順9 読むだけの節に隣の保存フォルダが並び、並べている相手に「比較中」、右クリックで相手を替えられる', async ({ page }) => {
  const root = DIR + '-ro/';
  const mine = root + 'junior';
  await S.bootWithSaveDir(page, mine);
  for (const d of [mine, root + 'senior', root + 'release_v1.2']) await S.clearDir(page, d);
  await S.putDoc(page, mine, 'spi_state', S.docFor('spi_state'));
  await S.putDoc(page, root + 'senior', 'spi_init_sequence', S.docFor('spi_init_sequence'));
  await S.putDoc(page, root + 'senior', 'spi_state', S.docFor('spi_state'));
  await S.putDoc(page, root + 'release_v1.2', 'spi_state', S.docFor('spi_state'));
  await S.reopenApp(page);

  // 到達条件その1: 畳んだままでも件数が読め、開くと隣のフォルダが 1 行ずつ並ぶ (自分の保存先は出ない)。
  await expect(page.locator('#files-count-readonly')).toHaveText('2');
  await page.locator('#files-sec-readonly').click();
  const folder = (n) => page.locator('#files-ro-list .files-ro-folder[data-ro-name="' + n + '"]');
  await expect(folder('senior')).toBeVisible();
  await expect(folder('release_v1.2')).toBeVisible();
  await expect(folder('junior')).toHaveCount(0);
  await expect(page.locator('#files-ro-hint')).toBeHidden();

  // 到達条件その2: フォルダの行を押すと開き、その図が並ぶ。図を押すとその 1 枚が右の枠に並び、相手に「比較中」。
  await folder('senior').click();
  const roFile = page.locator('#files-ro-list .files-ro-file[data-file-name="spi_init_sequence"]');
  await expect(roFile).toBeVisible();
  await roFile.click();
  await expect(page.locator('#senior-pane')).toBeVisible();
  await expect(page.locator('#senior-dsl')).toContainText('SPI 初期化シーケンス');
  await expect(folder('senior')).toContainText('比較中');
  await expect(page.locator('#files-count-readonly')).toHaveText('2 · 比較中 1');

  // 到達条件その3: 別のフォルダの行を右クリック →「並べて比較」で相手が替わる (新規作成の行は出ない)。
  await folder('release_v1.2').click({ button: 'right' });
  const menu = page.locator('#files-ctx-menu');
  await expect(menu.locator('[data-action="new-doc"]')).toHaveCount(0);
  await menu.locator('[data-action="compare"]').click();
  await expect(folder('release_v1.2')).toContainText('比較中');
  await expect(folder('senior')).not.toContainText('比較中');
  // 保存先は動かない (読むだけ)。
  expect(await S.readDoc(page, mine, 'spi_state')).toContain('SPI 状態遷移');
  await expect(page.locator('#top-crumbs')).toContainText('junior');

  // 到達条件その4: 枠を閉じると「比較中」は消える。
  await page.locator('#senior-close').click();
  await expect(page.locator('#files-count-readonly')).toHaveText('2');
  for (const d of [mine, root + 'senior', root + 'release_v1.2']) await S.clearDir(page, d);
});
