// @ts-check
// BLK-reviewer-20260907-0043 の実測。手順6「SVG を直接取得する」を、
// server.py を読まずに窓口だけで完遂できるかを数える。
// 入力の名前は text だけ (別名は TICKET-owner-20261123-1322-prune で外した)。測るのは描画の往復。
const { test, expect } = require('@playwright/test');

const DSL = '@startuml\nA -> B\n@enduml';

test('手順6 の実測 — 窓口だけで SVG が取れる', async ({ request }) => {
  let clicks = 0, keys = 0;   // GUI を一切使わない経路

  // 1. text で送れば 1 回目の POST で SVG が返る
  const first = await request.post('/render', { data: { text: DSL } });
  expect(first.status()).toBe(200);
  expect(await first.text()).toContain('<svg');

  // 2. 仕様を訊きたければ窓口が答える (server.py を開く必要はない)
  const doc = await (await request.get('/render')).json();
  expect(doc.request.fields).toHaveProperty('text');

  // 3. 文法エラーだけは成功と紛れない (200 の絵ではなく 422)
  const bad = await request.post('/render', { data: { text: '@startuml\nthis is not plantuml @@@\n@enduml' } });
  expect(bad.status()).toBe(422);

  console.log('MEASURE clicks=' + clicks + ' keys=' + keys);
  expect(clicks).toBeLessThanOrEqual(10);
  expect(keys).toBeLessThanOrEqual(50);
});
