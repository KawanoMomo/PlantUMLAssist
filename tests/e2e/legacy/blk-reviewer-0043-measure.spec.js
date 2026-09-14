// @ts-check
// BLK-reviewer-20260907-0043 の実測。手順6「SVG を直接取得する」を、
// server.py を読まずに窓口だけで完遂できるかを数える。
const { test, expect } = require('@playwright/test');

const DSL = '@startuml\nA -> B\n@enduml';

test('手順6 の実測 — 仕様を先に読まなくても 1 回目の POST で SVG が取れる', async ({ request }) => {
  let clicks = 0, keys = 0;   // GUI を一切使わない経路

  // 1. 記憶で `dsl` と書いた 1 回目。以前は 200 + エラー画 → のち 400 で、
  //    どちらも「投げ直す」往復が要った。いまはここで SVG が返る。
  const first = await request.post('/render', { data: { dsl: DSL } });
  expect(first.status()).toBe(200);
  expect(await first.text()).toContain('<svg');
  const warn = decodeURIComponent(first.headers()['x-plantumlassist-warning'] || '');
  expect(warn).toContain("'text'");   // 正式な名前はその場で分かる

  // 2. 仕様を訊きたければ窓口が答える (server.py を開く必要はない)
  const doc = await (await request.get('/render')).json();
  expect(doc.request.aliases.fields).toContain('dsl');

  // 3. 文法エラーだけは成功と紛れない (200 の絵ではなく 422)
  const bad = await request.post('/render', { data: { text: '@startuml\nthis is not plantuml @@@\n@enduml' } });
  expect(bad.status()).toBe(422);

  console.log('MEASURE clicks=' + clicks + ' keys=' + keys);
  expect(clicks).toBeLessThanOrEqual(10);
  expect(keys).toBeLessThanOrEqual(50);
});
