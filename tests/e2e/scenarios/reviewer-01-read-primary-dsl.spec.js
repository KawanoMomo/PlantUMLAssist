// @ts-check
// reviewer 台本 手順1: primary が persona-data\primary に置いた DSL(5 枚以上)を読む。
// 無ければ「今回の業務は成立しない」と run ログに書いて終了する(BLK は起票しない)。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');

test('手順1 読む対象の DSL が 5 枚以上あり、全部が図として読める', () => {
  const names = Object.keys(R.DOCS);
  // 到達条件: 5 枚に満たなければ業務は成立しない。
  expect(names.length).toBeGreaterThanOrEqual(5);
  for (const n of names) {
    expect(R.DOCS[n]).toContain('@startuml');
    expect(R.DOCS[n]).toContain('@enduml');
  }
});
