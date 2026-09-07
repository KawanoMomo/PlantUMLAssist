// @ts-check
// BLK-reviewer-20260907-0043 の実測。手順6「SVG を直接取得する」を、
// server.py を読まずに窓口だけで完遂できるかを数える。
const { test, expect } = require('@playwright/test');

test('手順6 の実測 — 仕様は窓口が答えるので GUI 操作は要らない', async ({ request }) => {
  let clicks = 0, keys = 0;   // GUI を一切使わない経路

  // 1. 仕様を訊く (server.py を開く必要がない)
  const doc = await (await request.get('/render')).json();
  expect(doc.request.fields).toHaveProperty('text');

  // 2. 仕様どおりに投げる
  const ok = await request.post('/render', {
    data: { text: '@startuml\nA -> B\n@enduml', mode: 'local' },
  });
  expect(ok.status()).toBe(200);
  expect(await ok.text()).toContain('<svg');

  // 3. 間違えた形は成功と紛れない (以前は 200 + エラー画だった)
  const wrong = await request.post('/render', { data: { dsl: '@startuml\nA -> B\n@enduml' } });
  expect(wrong.status()).toBe(400);

  console.log('MEASURE clicks=' + clicks + ' keys=' + keys);
  expect(clicks).toBeLessThanOrEqual(10);
  expect(keys).toBeLessThanOrEqual(50);
});
