const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { gotoApp, saveDirFor } = require('../helpers');

// BLK-reviewer-20260908-1103-wish: 書き出し元の印 (BLK-reviewer-20260908-1103) が付く前に
// 置かれた svg — 保存フォルダの実データ 22 枚がそれ — は、作り直して上書きするまで
// 「未確認」のままで、保存されていた絵が正しかったのかは分からずじまいだった。
// 上書きせずに裏で 1 回描き直してバイト比較し、一覧が「一致 / ずれ」を言い切れることを見る。
const DIR = saveDirFor(__filename);
const ABS = path.join(__dirname, '..', '..', '..', DIR);

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

async function putFile(page, name, dsl) {
  await page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

// 印の付いていない svg を保存フォルダに直接置く。app を通さずに置かれた svg
// (= 印を刻む前からある実データ) を再現するので、server ではなく fs で書く。
async function putRawSvg(page, name, dsl) {
  const svg = await render(page, dsl);
  expect(svg).not.toBeNull();
  // PlantUML が末尾に畳む元の DSL (`<?plantuml-src …?>`) も外す。畳まれた DSL があると
  // 一覧はそれで持ち主と中身を言い切る (BLK-reviewer-20260914-0906) ので、描き直して
  // 比べる対象 (印も畳まれた DSL も無い svg) にならない。
  const bare = svg.replace(/<\?plantuml-src\s+[0-9A-Za-z_-]+\s*\?>/g, '');
  expect(bare).not.toContain('plantuml-src');
  fs.writeFileSync(path.join(ABS, name + '.svg'), bare, 'utf-8');
}

async function clearDir(page) {
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, DIR);
}

// 保存先の一覧は FILES の保存先の右クリック「保存先の一覧を開く」で中央の枠に開く
// (BLK-owner-20260924-0637-1。scenarios/_scenario.js の openFolder と同じ経路)。旧経路 (保存先の
// 見出しを畳んで開き直す) は FILES の節を開くだけで、一覧の枠は見えないまま待ち続けた。
// 開くたびに読み直すので、後から置いたファイルも出る。
async function openFolder(page) {
  await require('../scenarios/_scenario').openFolder(page);
  await page.waitForSelector('#folder-panel.open.is-list .folder-item');
  // 開いた直後は FILES ツリーの読み直しが続けて一覧を 1 回描き直す。その間に押すと
  // 描き直しで消えた古いボタンに当たることがあるので、描き直しが 400ms 止むまで待つ。
  await page.evaluate(() => new Promise((resolve) => {
    const el = document.getElementById('folder-panel');
    let t = null;
    const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, 400); });
    function done() { mo.disconnect(); resolve(); }
    mo.observe(el, { childList: true });
    t = setTimeout(done, 400);
  }));
}

const NOW = '@startuml\nparticipant A\nparticipant B\nA -> B: go\nB -> A: done\n@enduml';
const OLD = '@startuml\nparticipant A\nA -> B: go\n@enduml';

test.describe('BLK-reviewer-1103-wish: 上書きせずに SVG の中身を確かめる', () => {
  test('印を持たない SVG を確かめ、食い違う図だけを名指しする', async ({ page }) => {
    test.setTimeout(180000);
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1103w_a', NOW);
    await putFile(page, 'R1103w_b', NOW);
    await putRawSvg(page, 'R1103w_a', NOW);   // 今の puml の姿
    await putRawSvg(page, 'R1103w_b', OLD);   // 別の内容の puml を描いたまま

    await openFolder(page);
    // 印が無いので、この時点ではどちらも中身では言えない
    await expect(page.locator('#folder-svg-content')).toContainText('未確認 2 枚');
    const verify = page.locator('#folder-svg-verify');
    await expect(verify).toHaveText('SVG の中身を確かめる（2 枚）');
    await verify.click();

    // 確かめ終わると、読める図と食い違う図に分かれる。置いた svg は畳まれた DSL を外してあり
    // 描き直した svg とはその分だけバイトが違うので、今の姿の方は「体裁差のみ」(作り直し不要) になる。
    await expect(page.locator('#folder-svg-content'))
      .toContainText('体裁差のみ 1 枚 / ずれ 1 枚', { timeout: 120000 });
    await expect(page.locator('#folder-svg-verify-note')).toContainText('比べました');
    await expect(page.locator('#folder-panel .folder-item[data-file-name="R1103w_b"] [data-svg-content="differ"]'))
      .toHaveCount(1);
    await expect(page.locator('#folder-panel .folder-item[data-file-name="R1103w_a"] [data-svg-content]'))
      .toHaveAttribute('data-svg-content', 'format');
    await expect(page.locator('#folder-svg-verify')).toHaveText('中身を確かめる SVG はありません');
  });

  test('確かめても SVG は書き換えない (保存されていた絵がそのまま残る)', async ({ page }) => {
    test.setTimeout(180000);
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1103w_keep', NOW);
    await putRawSvg(page, 'R1103w_keep', OLD);
    const before = fs.readFileSync(path.join(ABS, 'R1103w_keep.svg'), 'utf-8');

    await openFolder(page);
    await page.locator('#folder-svg-verify').click();
    await expect(page.locator('#folder-svg-content')).toContainText('ずれ 1 枚', { timeout: 120000 });
    expect(fs.readFileSync(path.join(ABS, 'R1103w_keep.svg'), 'utf-8')).toBe(before);
  });

  test('確かめた後に puml を書き直した図だけ未確認に戻る', async ({ page }) => {
    test.setTimeout(180000);
    await bootWithDir(page);
    await clearDir(page);
    await putFile(page, 'R1103w_x', NOW);
    await putFile(page, 'R1103w_y', NOW);
    await putRawSvg(page, 'R1103w_x', NOW);
    await putRawSvg(page, 'R1103w_y', NOW);

    await openFolder(page);
    await page.locator('#folder-svg-verify').click();
    await expect(page.locator('#folder-svg-content'))
      .toContainText('2 枚とも今の puml から作られています', { timeout: 120000 });

    await putFile(page, 'R1103w_y', OLD);
    await page.locator('#folder-panel .folder-write-refresh').click();
    await expect(page.locator('#folder-svg-content')).toContainText('未確認 1 枚');
    await expect(page.locator('#folder-svg-verify')).toHaveText('SVG の中身を確かめる（1 枚）');
  });
});
