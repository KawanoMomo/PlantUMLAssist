'use strict';
// BLK-junior-20260916-0046: 指摘反映で 10 ファイルを 1 枚ずつ開いて直して保存すると、
// 保存のたびに上書き確認へ答える手順が枚数だけ続く。答えは既に「他のファイルも
// 同じ扱い」で 1 回に畳まれているが、それでも 1 枚ずつ開いて直す手順そのものが残る
// (10 枚で 20 クリック)。保存フォルダをまたぐ ⇄ 一括置換なら 1 回で済むので、
// 詰まったその場 (確認ダイアログ) からそこへ入れることをここで固定する。
const assert = require('assert');

if (!global.window) {
  const jsdom = require('jsdom');
  const dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
if (!global.window.localStorage || typeof global.window.localStorage.removeItem !== 'function') {
  const mem = {};
  global.window.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
  };
}
try { delete require.cache[require.resolve('../src/core/source-lock.js')]; } catch (e) {}
require('../src/core/source-lock.js');
const SL = global.window.MA.sourceLock;

describe('BLK-junior-20260916-0046 まとめて当てる道', function() {
  test('確認の文言に、保存フォルダへまとめて当てる入口がある', function() {
    const t = SL.askText('spi_sequence');
    assert.ok(t.bulk, 'bulk の文言が無い');
    assert.ok(/まとめて/.test(t.bulk), 'まとめて当てると読めない: ' + t.bulk);
  });

  test('その入口は「1 枚ずつ開き直さずに済む」ことを添える', function() {
    const t = SL.askText('spi_sequence');
    assert.ok(t.bulkNote, 'bulkNote が無い');
    assert.ok(/1 枚ずつ/.test(t.bulkNote), '何が省けるか言っていない: ' + t.bulkNote);
  });

  test('二択の主従は変わらない (まとめて当てる道は既定ではない)', function() {
    const t = SL.askText('spi_sequence');
    assert.strictEqual(t.recommended, 'overwrite');
    assert.notStrictEqual(t.bulk, t.overwrite);
  });

  test('まとめて当てても、このファイルは書き換える側に倒すと言っている', function() {
    const t = SL.askText('spi_sequence');
    assert.ok(/書き換えます/.test(t.bulkNote), '書き先を言っていない: ' + t.bulkNote);
  });
});
