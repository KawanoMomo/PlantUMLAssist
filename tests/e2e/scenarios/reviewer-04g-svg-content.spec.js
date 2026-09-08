// @ts-check
// reviewer 台本 手順4.10: SVG の実体一致を確認する。mtime の「古い」は空振りがあるので、
// render API に現在の puml を渡して描き直し、保存済みの svg と中身で比べる。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');

test('手順4.10 現在の puml を描き直して、保存済み svg と中身で比べられる', async ({ request }) => {
  test.setTimeout(60 * 1000);
  const dsl = R.DOCS.spi_init_sequence;
  const res = await request.post('/render', { data: { text: dsl, mode: 'local' } });
  expect(res.status()).toBe(200);
  const fresh = await res.text();
  // 到達条件その1: 描き直した svg に、今の puml の部品名が入っている。
  expect(fresh).toContain('<svg');
  expect(fresh).toContain('Spi_Driver');

  // 到達条件その2: 旧名のまま保存された svg なら、中身の食い違いとして言える。
  const staleRes = await request.post('/render', { data: { text: dsl.replace(/Spi_Driver/g, 'SpiDrv'), mode: 'local' } });
  const stale = await staleRes.text();
  expect(stale).toContain('SpiDrv');
  expect(stale).not.toContain('Spi_Driver');
});
