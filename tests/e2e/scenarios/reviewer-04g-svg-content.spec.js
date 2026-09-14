// @ts-check
// reviewer 台本 手順4.10: SVG の実体一致を確認する。
// BLK-reviewer-20260908-2003-wish: 印 (@pua-source-sha1) が付いた図は一覧の判定だけで
// 片が付くようになった一方、印を刻む前に保存された図は要約の「未確認 N 枚」に件数として
// しか出ず、その 1 枚がどれかは audit.js を回して突き止めていた。
// 一覧の行に「未刻印」と puml / SVG の両方の時刻が出て、名前の行からその図だけを
// 確かめられれば、手順4.10 は一覧の中で完結する。
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

const DIR = saveDirFor(__filename);
const ABS = path.join(__dirname, '..', '..', '..', DIR);

const NOW = '@startuml\nparticipant Spi_Driver\nparticipant Mcu\n'
  + 'Spi_Driver -> Mcu: init\nMcu -> Spi_Driver: done\n@enduml';
// 出力先クロスを作るための別の図 (NOW とは別の絵になる本文)。
const OTHER = '@startuml\nparticipant Can_Driver\nparticipant Mcu\n'
  + 'Can_Driver -> Mcu: open\n@enduml';
// 印の無い svg の持ち主を一意に決めるための本文 (この図だけが持つ)。
const RAW_DSL = '@startuml\nparticipant Gpio_Driver\nparticipant Mcu\n'
  + 'Gpio_Driver -> Mcu: set\n@enduml';

async function bootWithDir(page) {
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, DIR);
  await gotoApp(page);
}

function putFile(page, name, dsl) {
  return page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl, dir: DIR });
}

function render(page, dsl) {
  return page.evaluate(async (d) => {
    const r = await fetch('/render', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: d, mode: 'local' }),
    });
    return r.ok ? r.text() : null;
  }, dsl);
}

// 印の付いた svg (GUI から書き出した図と同じ道)。
async function putStampedSvg(page, name, dsl) {
  const svg = await render(page, dsl);
  expect(svg).not.toBeNull();
  await page.evaluate(async (a) => {
    await fetch('/autosave-svg', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, svg: a.svg }),
    });
  }, { name, dir: DIR, svg });
}

// 印を刻む前から保存フォルダにある svg。app を通さずに置くので fs で書く。
async function putRawSvg(page, name, dsl) {
  const svg = await render(page, dsl);
  expect(svg).not.toBeNull();
  fs.writeFileSync(path.join(ABS, name + '.svg'), svg, 'utf-8');
}

// 畳まれた元の DSL がコメントに包まれている svg。svg を DOM に通して書き出し直した
// 経路ではこの形で残り、reviewer が実際に詰まった driver_common_class.svg /
// plantuml-class.svg はどちらもこれだった。`<?…?>` しか読めないと、まさに
// 確かめたかった 2 枚が黙って未刻印に落ちる。
async function putCommentWrappedSvg(page, name, dsl) {
  const svg = await render(page, dsl);
  expect(svg).not.toBeNull();
  const wrapped = svg.replace(/<\?(plantuml-src\s+[0-9A-Za-z_-]+\s*)\?>/g, '<!--?$1?-->');
  expect(wrapped).toContain('<!--?plantuml-src');
  fs.writeFileSync(path.join(ABS, name + '.svg'), wrapped, 'utf-8');
}

// 同じものを任意のフォルダに置く (覗き先の図を用意するため)。
async function putRawSvgIn(page, dir, name, dsl) {
  const svg = await render(page, dsl);
  expect(svg).not.toBeNull();
  const abs = path.join(__dirname, '..', '..', '..', dir.replace(/^\.\//, ''));
  fs.writeFileSync(path.join(abs, name + '.svg'), svg, 'utf-8');
}

function clearDir(page) {
  return page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

async function openFolder(page) {
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open .folder-item');
}

test('手順4.10 印の無い SVG も、一覧の上で「今の puml の絵か / どの図の絵か」まで分かる', async ({ page }) => {
  test.setTimeout(180000);
  await bootWithDir(page);
  await clearDir(page);
  await putFile(page, 'R04g_stamped', NOW);
  await putFile(page, 'R04g_raw', RAW_DSL);
  await putFile(page, 'R04g_cross', OTHER);
  await putFile(page, 'R04g_blind', NOW);
  await putStampedSvg(page, 'R04g_stamped', NOW);
  await putRawSvg(page, 'R04g_raw', RAW_DSL);
  // 出力先がクロスした図: R04g_cross.svg の中身は R04g_raw の絵 (印は無い)。
  // 畳まれた DSL はコメントに包まれた形 — 実物のクロスがこの形だった。
  await putCommentWrappedSvg(page, 'R04g_cross', RAW_DSL);
  // 畳まれた元の DSL すら持たない svg (他のツールが書いたもの)。ここだけは
  // 一覧では言えないので「未刻印」のまま残り、確かめに入れる道が要る。
  fs.writeFileSync(path.join(ABS, 'R04g_blind.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf-8');

  await openFolder(page);

  const stamped = page.locator('#folder-panel .folder-item[data-file-name="R04g_stamped"]');
  const raw = page.locator('#folder-panel .folder-item[data-file-name="R04g_raw"]');
  const cross = page.locator('#folder-panel .folder-item[data-file-name="R04g_cross"]');
  const blind = page.locator('#folder-panel .folder-item[data-file-name="R04g_blind"]');

  // 到達条件その1: 印が無くても、SVG に畳まれた元の DSL で「今の puml の絵」と言い切れる。
  // render API を 1 枚ずつ叩き直す手順4.10 の作業が、一覧を開くだけで済む。
  await expect(raw.locator('[data-svg-content="unverified"]')).toHaveCount(0);
  await expect(stamped.locator('[data-svg-content="unverified"]')).toHaveCount(0);
  // 一致した図は行に何も出ない (片が付いている印)。何を見て片が付いたかは
  // 一覧の根拠の行に出る — 印が無かったことが読めないと、reviewer は
  // 「確かめていないのでは」と疑って CLI に戻ることになる。
  await expect(raw.locator('[data-svg-content]')).toHaveCount(0);
  await expect(page.locator('#folder-svg-basis'))
    .toContainText('SVG に畳まれた元の DSL の突合 2 枚');
  await expect(page.locator('#folder-svg-content')).toContainText('一致 2 枚');

  // 到達条件その2: 絵が入れ替わっている図は、相手を名指しされる
  // (バイト長比較では「どちらの絵か」まで分からなかったところ)。
  await expect(cross.locator('[data-svg-content="differ"]')).toHaveText('内容ずれ');
  await expect(cross.locator('.folder-svg-cross')).toHaveText('他図の絵');
  await expect(cross.locator('.folder-svg-cross')).toHaveAttribute('data-svg-cross-of', 'R04g_raw');
  await expect(cross.locator('.folder-svg-cross'))
    .toHaveAttribute('title', /この SVG に印は無く、畳まれている元の DSL から判定しました/);
  await expect(page.locator('#folder-svg-cross-summary')).toContainText('SVG の出力先クロス: 1 枚');

  // 到達条件その3: 畳まれた DSL すら無い svg だけが「未刻印」に残り、
  // そこからその 1 枚だけを確かめに入れる道は今までどおり残っている。
  await expect(blind.locator('[data-svg-content="unverified"]')).toHaveText('未刻印');
  const row = page.locator('#folder-svg-unstamped');
  await expect(row.locator('.folder-svg-name')).toHaveText(['R04g_blind']);
  const only = row.locator('.folder-svg-names-verify');
  await expect(only).toHaveText('この 1 枚だけ中身を確かめる');
  await only.click();
  await expect(page.locator('#folder-svg-unstamped')).toHaveCount(0, { timeout: 120000 });

  // 到達条件その4: puml の保存時刻と SVG の書き出し時刻は今までどおり同じ行に並ぶ。
  await expect(raw.locator('.folder-mtime')).toHaveText(/\d\d\/\d\d \d\d:\d\d/);
  await expect(raw.locator('.folder-svg-mtime')).toHaveText(/^SVG \d\d\/\d\d \d\d:\d\d$/);
});

// BLK-reviewer-20260909-0603-wish: 同じ手順4.10 でも、見るのが他人のフォルダ
// (primary が置いた図) のときは、GUI の「他のフォルダを見る」一覧にファイル名と
// 更新日時しか出ず、puml と svg の中身が食い違っているかは分からなかった。
// 実際 primary/diagram1.puml の書き換えに svg が追いついていない事故に気付けたのは、
// reviewer が毎回 CLI で /verify-svg を叩いていたからで、GUI からではない。
// 覗いた一覧の行に最初から印が付き、印だけでは言えない図もその場で確かめられる
// ことを到達条件にする。
const PEEK_ROOT = DIR + '-peek';
const MY_DIR = PEEK_ROOT + '/reviewer';
const OTHER_DIR = PEEK_ROOT + '/primary';

const OLD_DSL = '@startuml\nparticipant Spi_Drv\nparticipant Mcu\n'
  + 'Spi_Drv -> Mcu: init\n@enduml';

function putFileIn(page, dir, name, dsl) {
  return page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl, dir });
}

async function putStampedSvgIn(page, dir, name, dsl) {
  const svg = await render(page, dsl);
  expect(svg).not.toBeNull();
  await page.evaluate(async (a) => {
    await fetch('/autosave-svg', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, svg: a.svg }),
    });
  }, { name, dir, svg });
}

test('手順4.10 他人のフォルダを覗いた一覧にも SVG の鮮度が最初から出る', async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, MY_DIR);
  await gotoApp(page);
  await page.evaluate(async (a) => {
    for (const d of [a.mine, a.other]) {
      await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
    }
  }, { mine: MY_DIR, other: OTHER_DIR });
  // 自分のフォルダにも 1 枚置く (覗き先の一覧が「隣のフォルダ」として出る形にする)。
  await putFileIn(page, MY_DIR, 'R04g_mine', NOW);
  // 追いついている図 / 書き換えに svg が追いついていない図 / 印を刻む前の svg。
  await putFileIn(page, OTHER_DIR, 'R04g_ok', NOW);
  await putStampedSvgIn(page, OTHER_DIR, 'R04g_ok', NOW);
  await putFileIn(page, OTHER_DIR, 'R04g_drift', OLD_DSL);
  await putStampedSvgIn(page, OTHER_DIR, 'R04g_drift', OLD_DSL);
  await putFileIn(page, OTHER_DIR, 'R04g_drift', NOW);      // puml だけ書き換える
  await putFileIn(page, OTHER_DIR, 'R04g_raw', NOW);
  await putRawSvgIn(page, OTHER_DIR, 'R04g_raw', NOW);

  // 到達条件その1: 覗いただけで (隣が 1 つなので追加のクリック無しで) 印が並ぶ。
  await page.locator('#btn-tab-peek').click();
  await page.waitForSelector('#peek-modal');
  const files = page.locator('#peek-files');
  await expect(files.locator('.peek-file[data-file-name="R04g_ok"] .peek-svg-badge'))
    .toHaveText('内容一致');
  await expect(files.locator('.peek-file[data-file-name="R04g_drift"] .peek-svg-badge'))
    .toHaveText('内容ずれ');
  // BLK-reviewer-20260914-0906: 印の無い svg も、畳まれた元の DSL で言い切れる。
  // 覗き先でも「未刻印」で保留にならない (覗いた側は書き出し直せないので、
  // 保留のままだと reviewer は毎回 CLI に戻ることになる)。
  await expect(files.locator('.peek-file[data-file-name="R04g_raw"] .peek-svg-badge'))
    .toHaveText('内容一致');

  // 到達条件その2: フォルダ全体の答えが 1 行で出る (/verify-svg を叩き直さない)。
  await expect(page.locator('#peek-svg-summary'))
    .toHaveText('内容: 一致 2 枚 / ずれ 1 枚');

  // 到達条件その3: 印だけでは言えない図は、その場で上書きせずに確かめられる。
  const verify = page.locator('#peek-svg-verify');
  await expect(verify).toHaveText('SVG の中身を確かめる（1 枚）');
  await verify.click();
  // 確かめても、ずれている図は「ずれ」のまま (作り直しは持ち主の仕事)。
  await expect(files.locator('.peek-file[data-file-name="R04g_drift"] .peek-svg-badge'))
    .toHaveText('内容ずれ', { timeout: 120000 });
  await expect(page.locator('#peek-svg-summary'))
    .toHaveText('内容: 一致 2 枚 / ずれ 1 枚');
});

// BLK-reviewer-20260914-2106-wish: 同じ手順4.10 でも、印が食い違った 1 枚について
// 「コメント行を足しただけの見かけ上の stale」なのか「実質的な内容変更」なのかは、
// 一覧の札 (内容ずれ) からは言えなかった。reviewer は毎回 /render を叩き、
// `<?plantuml-src …?>` を取り除いた文字列 diff を書く使い捨てスクリプトで裏取りしていた。
// 行の [可視差分] から旧 SVG と描き直した SVG を並べ、追加・削除・移動だけが
// 光る画面が開けば、その裏取りがこの 1 画面で終わる。
const VD_DIR = DIR + '-visual';

test('手順4.10 印が食い違った図の「見かけ上の stale」と「内容変更」を 1 画面で分ける', async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config',
        JSON.stringify({ enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d }));
    } catch (e) {}
  }, VD_DIR);
  await gotoApp(page);
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, VD_DIR);

  // 1 枚目: コメント行を足しただけ。描かれるものは何も変わらない。
  await putFileIn(page, VD_DIR, 'R04g_comment', NOW);
  await putStampedSvgIn(page, VD_DIR, 'R04g_comment', NOW);
  await putFileIn(page, VD_DIR, 'R04g_comment', "'domain-verdict: ok\n" + NOW);
  // 2 枚目: participant 名を変えた。描かれるものが変わる。
  await putFileIn(page, VD_DIR, 'R04g_renamed', NOW);
  await putStampedSvgIn(page, VD_DIR, 'R04g_renamed', NOW);
  await putFileIn(page, VD_DIR, 'R04g_renamed', NOW.replace(/Spi_Driver/g, 'Spi_Drv'));

  await openFolder(page);
  const comment = page.locator('#folder-panel .folder-item[data-file-name="R04g_comment"]');
  const renamed = page.locator('#folder-panel .folder-item[data-file-name="R04g_renamed"]');
  // 印だけでは 2 枚とも同じ「内容ずれ」に見える — ここが切り分けの起点。
  await expect(comment.locator('[data-svg-content="differ"]')).toHaveText('内容ずれ');
  await expect(renamed.locator('[data-svg-content="differ"]')).toHaveText('内容ずれ');

  // 到達条件その1: コメントだけの差は「可視内容は同一」と言い切られる。
  // (使い捨ての文字列 diff スクリプトを書いていたところ)
  await page.locator('#folder-panel .folder-svg-visual[data-visual-name="R04g_comment"]').click();
  const verdict = page.locator('#svg-visual-verdict');
  await expect(verdict).toHaveAttribute('data-verdict', 'same', { timeout: 120000 });
  await expect(verdict).toContainText('可視内容は同一');
  await expect(page.locator('#svg-visual-counts')).toContainText('差分なし');
  // 旧 SVG と新 SVG が左右に並ぶ (レイアウト崩れは目で見るしかないので、画面に出す)。
  await expect(page.locator('#svg-visual-old svg')).toHaveCount(1);
  await expect(page.locator('#svg-visual-new svg')).toHaveCount(1);
  await expect(page.locator('#svg-visual-names .svg-visual-name')).toHaveCount(0);
  await page.locator('#svg-visual-close').click();
  await expect(page.locator('#svg-visual-modal')).toBeHidden();

  // 到達条件その2: 実質的な内容変更は、消えた名前と増えた名前を名指しされる。
  await page.locator('#folder-panel .folder-svg-visual[data-visual-name="R04g_renamed"]').click();
  await expect(verdict).toHaveAttribute('data-verdict', 'changed', { timeout: 120000 });
  await expect(verdict).toContainText('可視内容がずれています');
  // participant 名は図の上下 2 か所に描かれるので、2 件とも名指しされる
  // (描かれている数をそのまま出す。まとめると「どこが変わったか」が欠ける)。
  const removed = page.locator('#svg-visual-names [data-visual-name-mark="removed"]');
  const added = page.locator('#svg-visual-names [data-visual-name-mark="added"]');
  await expect(removed).toHaveCount(2);
  await expect(removed.first()).toContainText('Spi_Driver');
  await expect(added.first()).toContainText('Spi_Drv');
  // 到達条件その3: 光っているのは増減したものだけ。旧の側に消えた名前、新の側に増えた名前。
  await expect(page.locator('#svg-visual-old [data-visual-mark="removed"]').first())
    .toHaveText('Spi_Driver');
  await expect(page.locator('#svg-visual-new [data-visual-mark="added"]').first())
    .toHaveText('Spi_Drv');
  // 変わっていないものに印は付かない (全部が光ると見分ける作業が戻る)。
  await expect(page.locator('#svg-visual-old [data-visual-mark="added"]')).toHaveCount(0);
  // 到達条件その4: この判定はそのまま指摘文として持ち出せる。
  await expect(page.locator('#svg-visual-report')).toHaveValue(/R04g_renamed/);
  await expect(page.locator('#svg-visual-report')).toHaveValue(/- Spi_Driver/);
});
