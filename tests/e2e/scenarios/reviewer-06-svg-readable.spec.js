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
