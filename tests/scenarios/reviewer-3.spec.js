// @ts-check
// reviewer 台本 手順 3:
//   after の .puml が描けているかを、SVG の要素数と before の差で確かめる (増減が操作と合わなければ指摘)。
// 操作 (primary 手順 2 と同じ): 参加者 SpiDrv を Spi_Driver に改名し、メッセージを 2 本足した。
// 期待: before / after とも同梱の plantuml.jar で描け、after の SVG は
//   参加者の数が同じ (改名は増減しない)・メッセージが 2 本増え、新しい名前が出て古い名前は出ない。
const { test, expect } = require('@playwright/test');
const H = require('./_helpers');

// 本文から参加者の宣言とメッセージのラベルを拾う (reviewer が差分を読んで数えるのと同じ粒度)。
function elementsOf(dsl) {
  const parts = [], labels = [];
  for (const l of dsl.split(/\r?\n/)) {
    let m = l.match(/^\s*(participant|actor|boundary|control|entity|database|collections|queue)\s+(\S+)\s*$/);
    if (m) { parts.push(m[2]); continue; }
    m = l.match(/^\s*\S+\s*-+>+\s*\S+\s*:\s*(.+?)\s*$/);
    if (m) labels.push(m[1]);
  }
  return { parts, labels };
}

// 同梱の jar で描いた SVG の text を数える (外へは送らない: mode=local)。
async function renderTexts(page, dsl) {
  const r = await page.evaluate(async (text) => {
    const res = await fetch('/render', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, mode: 'local' }),
    });
    return { status: res.status, body: await res.text() };
  }, dsl);
  expect(r.status, 'render status').toBe(200);
  let svg = r.body;
  try { const j = JSON.parse(r.body); svg = j.svg || r.body; } catch (e) {}
  expect(svg).toContain('<svg');
  return page.evaluate((s) => {
    const doc = new DOMParser().parseFromString(s, 'image/svg+xml');
    return Array.from(doc.querySelectorAll('text')).map((t) => (t.textContent || '').trim());
  }, svg);
}

function count(texts, word) {
  return texts.filter((t) => t === word).length;
}

test('reviewer 手順3 after の .puml が描け、SVG の要素数が before からの操作と合う', async ({ page }, testInfo) => {
  const before = H.fixture('reviewer-3-before.puml');
  const after = H.fixture('reviewer-3-after.puml');
  await H.bootWith(page, null);

  const eb = elementsOf(before), ea = elementsOf(after);
  // 本文の差: 参加者は同数 (改名 1)、メッセージは 2 本増。
  expect(ea.parts.length).toBe(eb.parts.length);
  expect(ea.labels.length - eb.labels.length).toBe(2);
  H.annotate(testInfo, 'diffLines', H.diffLines(before, after));

  const t0 = Date.now();
  const tb = await renderTexts(page, before);
  const ta = await renderTexts(page, after);
  H.annotate(testInfo, 'renderMs', Date.now() - t0);

  // 参加者: どの名前も頭と足の 2 か所に描かれる。after では新しい名前が出て、古い名前は消える。
  for (const p of eb.parts) expect(count(tb, p), 'before ' + p).toBeGreaterThan(0);
  for (const p of ea.parts) expect(count(ta, p), 'after ' + p).toBeGreaterThan(0);
  expect(count(ta, 'SpiDrv')).toBe(0);
  expect(count(ta, 'Spi_Driver')).toBe(count(tb, 'SpiDrv'));
  // メッセージ: ラベルが本文の本数だけ描かれ、after は before より 2 本多い。
  const drawnLabels = (texts, labels) => labels.filter((l) => texts.indexOf(l) >= 0).length;
  expect(drawnLabels(tb, eb.labels)).toBe(eb.labels.length);
  expect(drawnLabels(ta, ea.labels)).toBe(ea.labels.length);
  expect(drawnLabels(ta, ea.labels) - drawnLabels(tb, eb.labels)).toBe(2);
});
