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

async function clickOverlayByLine(page, line) {
  await page.locator('#overlay-layer rect[data-line="' + line + '"]').first().click();
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

// BLK-owner-20260924-2135-prune: 参照ペインの相手のフォルダは、FILES「読むだけ」で比較中にしたフォルダ 1 つ。
// パスを打つ欄 (#xf-dir + 🔍 探す) は外した。ツリーの「並べて比較」と同じ関数で比較中にし、
// 並べて比較の枠の相手「別タブの図」から参照ペインを開く (開くと相手のフォルダを読む)。
async function openCrossRef(page, dir) {
  await page.evaluate((d) => window.compareReadonlyFolder(d), dir);
  await page.locator('#senior-target-tabs').click();
  await page.waitForSelector('#compare-pane:not([hidden])');
}

module.exports = {
  openCrossRef,
  gotoApp, loadFixture, getEditorText, getEditorLine, clickOverlayByLine, setDiagramTitle,
  saveDirFor, shotOut, E2E_SAVE_ROOT, pickTool,
};
