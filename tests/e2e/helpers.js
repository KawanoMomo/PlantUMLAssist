// @ts-check
const fs = require('fs');
const path = require('path');

// BLK-releaser-20260908-0800 — E2E の保存フォルダはリポジトリ直下ではなく
// test-results/autosave/<spec 名>/ に作る。直下に作ると成果物リポジトリに残骸が溜まり、
// 配布物に混ざる。test-results/ は .gitignore 済みで、全体実行の後に globalTeardown が消す。
const REPO_ROOT = path.join(__dirname, '..', '..');
const E2E_SAVE_ROOT = 'test-results/autosave';

// spec ファイルごとに独立した保存フォルダ。--workers>1 でも spec 同士がぶつからない。
// server には相対パスで渡すので、リポジトリ直下からの './' 付きで返す。
function saveDirFor(specFilename) {
  var name = path.basename(specFilename).replace(/\.spec\.js$/, '');
  return './' + E2E_SAVE_ROOT + '/' + name;
}

// スクリーンショットの既定の置き場。直下に shot*.png を落とさない。
// builder が成果物として撮るときは SHOT_OUT で loop/shots へ向ける。
function shotOut(name) {
  if (process.env.SHOT_OUT) return process.env.SHOT_OUT;
  return path.join(REPO_ROOT, 'test-results', 'shots', name);
}

// 利用者の初回と同じ既定の画面で開く (設定に何も書かない)。タブ列は 図のタブ・＋・ツール ▾ だけ
// (道具のボタンを並べる切り替えは TICKET-owner-20261123-0222-prune で外した)。
// 第 2 引数は以前の呼び方 ({ foldedTools: true }) のまま渡されても読まない。
async function gotoApp(page, opts) {
  await page.goto('/');
  // BLK-builder-20260908-0744-2-red: no hard-coded cap here. 5s was shorter than
  // the time a page load can legitimately take while other workers are rendering,
  // so the app opening a little late failed the test before it had begun.
  // The suite-wide `timeout` in playwright.config.js is the budget that matters.
  await page.waitForSelector('#preview-svg');
  // #preview-svg は HTML の骨格にあり、init (保存先の取り込み /prefs を待って走る) より先に出る。
  // init が終わるまで画面は押せない (html[data-app-ready] が立つまで pointer-events を切ってある)。
  await page.waitForSelector('html[data-app-ready="1"]', { state: 'attached' });
  // local (Java) で描画する。online は DSL を plantuml.com へ送るため使わない。
  await page.evaluate(() => {
    var sel = document.getElementById('render-mode');
    if (sel && sel.value !== 'local') {
      sel.value = 'local';
      sel.dispatchEvent(new Event('change'));
    }
  });
  await page.waitForTimeout(500);
}

async function loadFixture(page, fixtureName) {
  var dsl = fs.readFileSync(path.join(__dirname, '../fixtures/dsl/', fixtureName), 'utf8');
  await page.evaluate((text) => {
    var ed = document.getElementById('editor');
    ed.value = text;
    ed.dispatchEvent(new Event('input'));
  }, dsl);
  await page.waitForTimeout(500);
}

async function getEditorText(page) {
  return page.locator('#editor').inputValue();
}

async function getEditorLine(page, lineNum) {
  var t = await getEditorText(page);
  return t.split('\n')[lineNum - 1];
}

// 実マウスで当たりの真ん中を押す。関係の線は細い当たり (path.link-hit) が枠の rect より手前にあり
// (BLK-migrator-20260925-1032)、locator.click は「別の要素が受ける」と押す前に断る。利用者が押すのと同じく、
// その位置で一番手前の当たりが受ける (線の当たりも同じ関係を選ぶ)。
// TICKET-releaser-20261116-1201-1: 直前の操作 (Undo など) の描き直しが遅れて届くと、枠の層は作り直され、
// 掴んだ枠は外れる。boundingBox は「枠を掴む」と「箱を測る」が別の往復なので、その間に作り直しが入ると
// 外れた枠を測って null になる (全体実行の負荷のときだけ赤になっていた)。利用者は座標を押すので影響は無い。
// TICKET-releaser-20261122-0015-1: 箱が null のときだけ掴み直しても、掴んだ枠が scrollIntoViewIfNeeded の
// 「安定を待つ」往復の間に外れる経路 (Element is not attached) が残っていた。掴む・見える所へ寄せる・測るを
// ページの中の 1 回の評価にまとめ (その間に枠の層は作り直されない)、枠が無い・大きさが無い間は評価ごとやり直す。
// 押すのは測った座標 (作り直された枠も同じ本文なら同じ位置にある)。15 秒たっても箱が無いときだけ赤にする。
async function clickOverlayByLine(page, line) {
  const handle = await page.waitForFunction((ln) => {
    const r = document.querySelector('#overlay-layer rect[data-line="' + ln + '"]');
    if (!r || !r.isConnected) return null;
    // 見えていれば動かさず、見えていなければ真ん中へ寄せる (Playwright の scrollIntoViewIfNeeded と同じ寄せ方)。
    if (typeof r.scrollIntoViewIfNeeded === 'function') r.scrollIntoViewIfNeeded(true);
    else r.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const b = r.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return null;
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, line, { timeout: 15000 }).catch(() => null);
  const p = handle ? await handle.jsonValue() : null;
  if (!p) throw new Error('overlay rect for line ' + line + ' has no box');
  await page.mouse.click(p.x, p.y);
}


// design 2b: Title は無選択ペインではなく「図の設定」タブが持つ。
// 図のタイトルを入れて、Properties タブに戻る。
async function setDiagramTitle(page, title) {
  await page.locator('#props-tab-settings').click();
  await page.locator('#ds-title').fill(title);
  await page.locator('#ds-title').dispatchEvent('change');
  await page.waitForTimeout(500);
  await page.locator('#props-tab-props').click();
  await page.waitForTimeout(200);
}


// TICKET-roadmap-20261115-2114-2: ツール ▾ は残った道具だけの 1 段の一覧 (分類を選ぶ手は無い)。
async function pickTool(page, targetId) {
  await page.locator('#tool-menu .tool-menu-list .tool-menu-item[data-target="' + targetId + '"]').click();
}

// TICKET-owner-20261123-0222-prune: 道具の窓はタブ列の右端の「ツール ▾」の行から開く
// (タブ列の ⇄ 一括置換・✎ 行編集・⟲ 変遷 のボタンは無い)。利用者と同じく実マウスで押す。
async function openTool(page, targetId) {
  await page.locator('#btn-tab-tools').click();
  await pickTool(page, targetId);
}
// ツール ▾「行を書き換える」。窓が開くまで待つ。
async function openLineEdit(page) {
  await openTool(page, 'tool-lines');
  await page.waitForSelector('#lines-panel.open');
}
// ツール ▾「部品名を一括置換する」。窓が開くまで待つ (Ctrl+H でも同じ窓)。
async function openBulkRename(page) {
  await openTool(page, 'tool-rename');
  await page.waitForSelector('#rename-panel.open');
}
// この図の履歴 (FILES のファイルの右クリックと同じ窓)。保存先に置いていない図でも引ける Ctrl+K の行で開く。
async function openVersionHistory(page) {
  await page.keyboard.press('Control+k');
  await page.locator('#cp-input').fill('この図の履歴を見る');
  await page.keyboard.press('Enter');
}

// TICKET-owner-20261115-2141-prune: 参照ペインの入口は「この図の履歴」の行の「比較」1 つになり、
// 相手を「別タブの図」に選び直す口は外した。ペインの中身を見る spec はその開き口 (toggleCompareView) で開く。
async function openCompareTabs(page) {
  await page.waitForFunction(() => typeof window.toggleCompareView === 'function');
  await page.evaluate(() => { window.toggleCompareView(true, 'ref'); });
  await page.waitForSelector('#compare-pane:not([hidden])');
}

// BLK-junior-20260909-0703 / BLK-owner-20260925-0312-2: 白紙のタブで図種を選ぶと、見本は入れず白紙になる。
// 旧 spec の多くは見本 (component WebApp / class User 等) を前提に操作するので、図種を選んだあと
// その図種の見本 (module.template()) を本文に入れて、見本を開いた状態から始める。
async function switchTypeWithSample(page, type) {
  await page.locator('#diagram-type').selectOption(type);
  await page.waitForTimeout(300);
  await page.evaluate((t) => {
    var mods = window.MA.modules || {};
    var mod = null;
    Object.keys(mods).forEach(function(k) { if (mods[k] && mods[k].type === t) mod = mods[k]; });
    if (!mod) throw new Error('no module for ' + t);
    var ed = document.getElementById('editor');
    ed.value = mod.template();
    ed.dispatchEvent(new Event('input'));
  }, type);
  // 見本の描画 (local の Java) が済んで選択枠が張られるまで待つ。枠を押す spec が空振りで skip しないように。
  await page.waitForSelector('#overlay-layer rect', { state: 'attached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
}

module.exports = {
  openCompareTabs,
  gotoApp, loadFixture, getEditorText, getEditorLine, clickOverlayByLine, setDiagramTitle,
  saveDirFor, shotOut, E2E_SAVE_ROOT, pickTool, switchTypeWithSample,
  openTool, openLineEdit, openBulkRename, openVersionHistory,
};
