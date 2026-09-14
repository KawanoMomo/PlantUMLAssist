// @ts-check
// reviewer 台本 手順6: 各図の SVG を render API で取得し、レイアウトが読める状態か(重なり・切れ)確認する。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');

test('手順6 描いた SVG に切れ・空描画が無いことを確かめられる', async ({ request }) => {
  test.setTimeout(90 * 1000);
  for (const name of ['spi_init_sequence', 'spi_state', 'driver_common_class']) {
    const res = await request.post('/render', { data: { text: R.DOCS[name], mode: 'local' } });
    expect(res.status(), name).toBe(200);
    const svg = await res.text();
    // 到達条件その1: 図が実際に描かれている(空の svg ではない)。
    const m = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg)
      || /width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/.exec(svg);
    expect(m, name + ' に寸法が無い').not.toBeNull();
    expect(Number(m[1])).toBeGreaterThan(50);
    expect(Number(m[2])).toBeGreaterThan(50);
    // 到達条件その2: PlantUML の構文エラー画になっていない。
    expect(svg).not.toContain('Syntax Error');
  }
});

// BLK-reviewer-20260914-0906-wish: 手順6 の前段で 5 枚ぶん render API を手打ちして
// 保存済み svg と見比べていたのは、一覧が「今の puml の絵ではない」までしか
// 言えなかったため。driver_common_class.svg と plantuml-class.svg のように絵が
// 丸ごと入れ替わっている場合、どちらの絵かは plantuml-src 埋め込みをデコードして
// 初めて分かった。svg に刻まれた印 (@pua-source-sha1) は「どの puml から書き出したか」
// そのものなので、同じフォルダの他の図の sha1 と突き合わせれば相手を名指しできる。
// 手順6 を「警告が出ている図だけ見る」に変えられることを到達条件にする。
// 差し戻し 1 回目 (reviewer run=20260914-1006): この到達条件は entries を手で組み立てて
// 判定だけを見ていたため、実物の svg では svgSource が埋まらず一覧に何も出ていない
// あいだも緑のままだった。事故そのものを保存フォルダに作り、📂一覧を開いて読む形にする。
const fs = require('fs');
const path = require('path');
const { gotoApp, saveDirFor } = require('../helpers');

const X_DIR = saveDirFor(__filename) + '-cross';
const X_ABS = path.join(__dirname, '..', '..', '..', X_DIR.replace(/^\.\//, ''));

const X_A = '@startuml\ntitle Driver_Common_Class\nclass Driver_Common\n@enduml';
const X_B = '@startuml\nclass Spi_Driver\nclass Can_Driver\n@enduml';

test('手順6 絵が入れ替わった SVG を、相手の図の名前まで名指しできる', async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript((d) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem('plantuml-autosave-config', JSON.stringify({
        enabled: true, debounceMs: 200, restoreMode: 'auto', backend: 'file', fileDir: d,
      }));
    } catch (e) {}
  }, X_DIR);
  await gotoApp(page);
  await page.evaluate(async (d) => {
    await fetch('/autosave?dir=' + encodeURIComponent(d), { method: 'DELETE' });
  }, X_DIR);

  const put = (name, dsl) => page.evaluate(async (a) => {
    await fetch('/autosave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: a.name, dir: a.dir, dsl: a.dsl }),
    });
  }, { name, dsl, dir: X_DIR });
  const render = (dsl) => page.evaluate(async (d) => {
    const r = await fetch('/render', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: d, mode: 'local' }),
    });
    return r.ok ? r.text() : null;
  }, dsl);

  await put('driver_common_class', X_A);
  await put('plantuml-class', X_B);

  // 事故そのもの: 書き出し先が入れ替わり、A.svg に B の絵、B.svg に A の絵が入る。
  // 印 (@pua-source-sha1) は付かず、畳まれた元の DSL はコメントに包まれた形
  // (`<!--?plantuml-src …?-->`) で残る — reviewer が実際に踏んだ形。
  const svgA = await render(X_A);
  const svgB = await render(X_B);
  expect(svgA).not.toBeNull();
  expect(svgB).not.toBeNull();
  const wrap = (s) => s.replace(/<\?(plantuml-src\s+[0-9A-Za-z_-]+\s*)\?>/g, '<!--?$1?-->');
  expect(wrap(svgA)).toContain('<!--?plantuml-src');
  fs.writeFileSync(path.join(X_ABS, 'driver_common_class.svg'), wrap(svgB), 'utf-8');
  fs.writeFileSync(path.join(X_ABS, 'plantuml-class.svg'), wrap(svgA), 'utf-8');

  // 手順6 の操作はこれだけ — 📂一覧を開く。
  await page.locator('#btn-tab-folder').click();
  await page.waitForSelector('#folder-panel.open .folder-item');

  const a = page.locator('#folder-panel .folder-item[data-file-name="driver_common_class"]');
  const b = page.locator('#folder-panel .folder-item[data-file-name="plantuml-class"]');

  // 到達条件 1: 両方に印が付き、render を叩き直さずに「今の puml の絵ではない」と読める。
  await expect(a.locator('[data-svg-content="differ"]')).toHaveText('内容ずれ');
  await expect(b.locator('[data-svg-content="differ"]')).toHaveText('内容ずれ');
  // 到達条件 2: 入れ替わりは組として出る (片側だけ書き出し直すと必ず取り違える)。
  await expect(a.locator('.folder-svg-cross')).toHaveText('絵が入れ替わり');
  await expect(b.locator('.folder-svg-cross')).toHaveText('絵が入れ替わり');
  // 到達条件 3: 「どの図の絵か」が相手の名前で出る。
  await expect(a.locator('.folder-svg-cross')).toHaveAttribute('data-svg-cross-of', 'plantuml-class');
  await expect(b.locator('.folder-svg-cross')).toHaveAttribute('data-svg-cross-of', 'driver_common_class');
  // 到達条件 4: 見出し 1 行で、reviewer が指摘にそのまま写せる。
  await expect(page.locator('#folder-svg-cross-summary'))
    .toHaveText('SVG の出力先クロス: 2 枚（うち入れ替わり 1 組: driver_common_class ⇄ plantuml-class）');
  // 到達条件 5: 一覧が「未確認」に落ちていない (落ちると結局 1 枚ずつ確かめに戻る)。
  await expect(page.locator('#folder-svg-unstamped')).toHaveCount(0);
});

// 判定そのもの (どの組を入れ替わりと呼ぶか) は、実物を用意しにくい形も含めて純関数で守る。
test('手順6 保存した本人にも、その場で相手の名前が出る', () => {
  const { loadMA } = require('../../../tools/audit-runtime');
  const { MA } = loadMA();
  expect(MA.svgCross).toBeTruthy();
  const scan = MA.svgCross.scan([
    { name: 'driver_common_class', hash: 'aaa', svgSource: 'bbb' },
    { name: 'plantuml-class', hash: 'bbb', svgSource: 'aaa' },
    { name: 'diagram1', hash: 'ccc', svgSource: 'ddd' },
    { name: 'plantuml-sequence', hash: 'ddd', svgSource: 'ddd' },
    { name: 'gpio_state', hash: 'eee', svgSource: 'eee' },
  ]);
  expect(scan.pairs).toEqual([['driver_common_class', 'plantuml-class']]);
  expect(MA.svgCross.nameOf(scan, 'diagram1').of).toBe('plantuml-sequence');
  // 保存の直後に出る 1 行。reviewer の突合を待たずに書き出し直せる。
  expect(MA.svgCross.saveLine(scan, 'plantuml-class'))
    .toContain('driver_common_class と入れ替わっています');
});
