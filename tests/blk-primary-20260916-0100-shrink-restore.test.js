'use strict';
// BLK-primary-20260916-0100: 指摘の反映で空洞化した図を版に戻そうとすると、一覧の
// 20 行は同じ見た目で並び、新しい方はもう空洞化した後の中身だった。「戻しても直らない」
// で手が止まる。どの版に戻せば直るかは行数で機械的に分かるので、画面が名指しする。
// ここで固定するのは「勧める版の選び方」と「揺れを空洞化と呼ばないこと」。
const assert = require('assert');

if (!global.window) {
  const jsdom = require('jsdom');
  const dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}
try { delete require.cache[require.resolve('../src/core/version-history.js')]; } catch (e) {}
require('../src/core/version-history.js');
const VH = global.window.MA.versionHistory;

// 新しい順。primary の driver_common_class の控えと同じ形。
const ROWS = [
  { stamp: '20260915-140335.1', label: '09/15 23:03', lines: 2 },
  { stamp: '20260915-140335', label: '09/15 23:03', lines: 79 },
  { stamp: '20260914-201005', label: '09/15 05:10', lines: 76 },
  { stamp: '20260914-001159.9', label: '09/14 09:11', lines: 10 },
];

describe('BLK-primary-20260916-0100 空洞化から戻す先', function() {
  test('いまが 4 行なら、79 行の版を勧める', function() {
    const best = VH.bestRestore(ROWS, 4);
    assert.ok(best, '戻す先を選べていない');
    assert.strictEqual(best.stamp, '20260915-140335');
    assert.strictEqual(best.lines, 79);
  });

  test('勧めるのは一番大きい版ではなく、充実している中で一番新しい版', function() {
    // 76 行より 79 行の方が新しいので 79 行。空洞化の直前まで進めた作業を捨てない。
    const best = VH.bestRestore(ROWS, 4);
    assert.strictEqual(best.stamp, '20260915-140335');
  });

  test('空洞化していなければ何も勧めない (1〜2 行の増減は編集の揺れ)', function() {
    assert.strictEqual(VH.bestRestore(ROWS, 78), null);
    assert.strictEqual(VH.isFuller(79, 78), false);
    assert.strictEqual(VH.isFuller(11, 10), false);
  });

  test('行数が分からない版は勧めない', function() {
    assert.strictEqual(VH.bestRestore([{ stamp: 'x', label: 'x', lines: null }], 4), null);
    assert.strictEqual(VH.isFuller(null, 4), false);
    assert.strictEqual(VH.isFuller(79, null), false);
  });

  test('先頭に出す 1 行が、いまの行数と戻す先の行数を両方言う', function() {
    const n = VH.shrinkNotice('driver_common_class', ROWS, 4);
    assert.ok(n, '知らせを作れていない');
    assert.ok(/driver_common_class/.test(n.text));
    assert.ok(/4 行/.test(n.text), 'いまの行数が無い: ' + n.text);
    assert.ok(/79 行/.test(n.text), '戻す先の行数が無い: ' + n.text);
    assert.strictEqual(n.stamp, '20260915-140335');
    assert.ok(/戻す/.test(n.restoreLabel));
  });

  test('空洞化していなければ知らせを出さない', function() {
    assert.strictEqual(VH.shrinkNotice('driver_common_class', ROWS, 78), null);
  });

  test('控えが無い図でも落ちない', function() {
    assert.strictEqual(VH.bestRestore([], 4), null);
    assert.strictEqual(VH.shrinkNotice('x', [], 4), null);
    assert.strictEqual(VH.shrinkNotice('x', null, null), null);
  });
});
