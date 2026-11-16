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

// design 7a/7b: タブ列の既定は「ツールを畳んだ状態」。既存の spec は機能ボタン
// (`#btn-tab-*`) を直接押すので、断らない限りこれまでどおり畳まない状態で開く。
// 既定そのものを見る spec は gotoApp(page, { foldedTools: true }) で開く
// (このとき helper は設定に触らないので、アプリの既定がそのまま出る)。
async function gotoApp(page, opts) {
  if (!(opts && opts.foldedTools)) {
    // 未設定のときだけ書く。test の中で畳み方を切り替えた spec は、その選択が
    // reload をまたいで残る (init script は navigation のたびに走るため)。
    await page.addInitScript(() => {
      try {
        if (window.localStorage.getItem('plantuml-tools-folded') == null) {
          window.localStorage.setItem('plantuml-tools-folded', '0');
        }
      } catch (e) {}
    });
  }
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
// 掴み直して測り直す。何度掴み直しても箱が無いときだけ (枠そのものが無い・大きさが無い) 赤にする。
async function clickOverlayByLine(page, line) {
  const r = page.locator('#overlay-layer rect[data-line="' + line + '"]').first();
  let b = null;
  for (let i = 0; i < 5 && !b; i++) {
    if (i) await page.waitForTimeout(150);
    await r.scrollIntoViewIfNeeded();
    b = await r.boundingBox();
  }
  if (!b) throw new Error('overlay rect for line ' + line + ' has no box');
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
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


// design 9b (BLK-human-20260923-1601): ツール ▾ は左 6 分類・右小見出しの 2 段パネル。
// 目当ての項目はその分類を選ばないと右列に出ないので、分類を選んでから押す。
async function pickTool(page, targetId) {
  const key = await page.evaluate((id) => window.MA.toolMenu.groupOf(id), targetId);
  await page.locator('.tool-menu-cat[data-group="' + key + '"]').click();
  await page.locator('.tool-menu-item[data-target="' + targetId + '"]').click();
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
};
