// @ts-check
// reviewer 台本 手順1: primary が persona-data\primary に置いた DSL(5 枚以上)を読む。
// 無ければ「今回の業務は成立しない」と run ログに書いて終了する(BLK は起票しない)。
//
// BLK-reviewer-20260914-1806-wish: 読む対象のフォルダには `-編集中` の下書きが混ざる。
// どれが本体でどれが反映待ちかは、これまで ls と diff で毎回目視していた。
// 一覧がファイルごとに「本体 / 差し替え待ち / 削除予定」を出すようにした。
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');
const S = require('./_scenario');

const DIR = S.dirFor(__filename);

test('手順1 読む対象の DSL が 5 枚以上あり、全部が図として読める', () => {
  const names = Object.keys(R.DOCS);
  // 到達条件: 5 枚に満たなければ業務は成立しない。
  expect(names.length).toBeGreaterThanOrEqual(5);
  for (const n of names) {
    expect(R.DOCS[n]).toContain('@startuml');
    expect(R.DOCS[n]).toContain('@enduml');
  }
});
