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
test('手順6 絵が入れ替わった SVG を、相手の図の名前まで名指しできる', () => {
  const { loadMA } = require('../../../tools/audit-runtime');
  const { MA } = loadMA();
  expect(MA.svgCross).toBeTruthy();

  // GET /autosave が返す 1 件の形 ({name, hash, svgSource, ...})。
  // 事故: 2 枚が互いの絵を持ち、3 枚目は無関係な図の絵をもらっている。
  const entries = [
    { name: 'driver_common_class', hash: 'aaa', svgSource: 'bbb' },
    { name: 'plantuml-class', hash: 'bbb', svgSource: 'aaa' },
    { name: 'diagram1', hash: 'ccc', svgSource: 'ddd' },
    { name: 'plantuml-sequence', hash: 'ddd', svgSource: 'ddd' },
    { name: 'gpio_state', hash: 'eee', svgSource: 'eee' },
  ];
  const scan = MA.svgCross.scan(entries);

  // 到達条件 1: 見るべき図が 3 枚に絞られ、無事な 2 枚は出てこない。
  expect(scan.rows.map((r) => r.name).sort())
    .toEqual(['diagram1', 'driver_common_class', 'plantuml-class']);
  // 到達条件 2: 入れ替わりは組として出る (片側だけ書き出し直すと必ず取り違える)。
  expect(scan.pairs).toEqual([['driver_common_class', 'plantuml-class']]);
  // 到達条件 3: 「どの図の絵か」が、render を叩き直さずに読める。
  expect(MA.svgCross.nameOf(scan, 'diagram1').of).toBe('plantuml-sequence');
  expect(MA.svgCross.badge(MA.svgCross.nameOf(scan, 'diagram1')).title)
    .toContain('plantuml-sequence.puml の絵です');
  // 到達条件 4: 一覧の見出し 1 行で、reviewer が指摘に写せる形になっている。
  expect(MA.svgCross.summaryLine(scan))
    .toBe('SVG の出力先クロス: 3 枚（うち入れ替わり 1 組: driver_common_class ⇄ plantuml-class）');
  // 到達条件 5: 保存した本人がその場で気付ける (reviewer の突合を待たない)。
  expect(MA.svgCross.saveLine(scan, 'plantuml-class'))
    .toContain('driver_common_class と入れ替わっています');
});
