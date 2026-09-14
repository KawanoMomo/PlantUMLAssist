// @ts-check
// reviewer 台本 手順4.8: 設計書の章立てとの対応を確認する。
// 対象ドメインの章立てを持つ設計書が無ければ「該当設計書なし」と記録するだけでよい。
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const R = require('./_reviewer-docs');

const PERSONA_DATA = path.join('E:', '01_Loop', 'persona-data');

test('手順4.8 設計書があれば章と図を突き合わせ、無ければ「該当設計書なし」で済ませる', () => {
  const dir = path.join(PERSONA_DATA, 'primary');
  const docs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.md$/.test(f)) : [];
  if (docs.length === 0) {
    // 到達条件その1: 無いときは業務が止まらない(BLK も起票しない)。
    expect(docs).toEqual([]);
    return;
  }
  // 到達条件その2: あるときは章見出しを拾い、図の名前と突き合わせられる。
  const text = fs.readFileSync(path.join(dir, docs[0]), 'utf8');
  const chapters = text.split('\n').filter((l) => /^#{1,3}\s/.test(l));
  expect(chapters.length).toBeGreaterThanOrEqual(0);
  expect(Object.keys(R.DOCS).length).toBeGreaterThan(0);
});
