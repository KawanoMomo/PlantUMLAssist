'use strict';
// BLK-junior-20260912-2206: 先輩 (primary) のフォルダにコンポーネント図があるかを
// 「他の保存フォルダを覗く」で確かめるのに、覗き一覧は図名だけで図種の印が無く、
// 30 枚の名前を上から読んで語尾から図種を推測するしかなかった。
// 覗き一覧にも 📂 一覧と同じ印と内訳を出せることを固定する。
const assert = require('assert');
if (!global.window) global.window = global;
['../src/core/saved-kind.js', '../src/core/diagram-kind.js', '../src/core/peek-folder.js']
  .forEach(function(m) { try { delete require.cache[require.resolve(m)]; } catch (e) {} });
require('../src/core/saved-kind.js');
require('../src/core/diagram-kind.js');
var DK = window.MA.diagramKind;
require('../src/core/peek-folder.js');
var PF = window.MA.peekFolder;

// primary のフォルダ (シーケンス・状態遷移・クラスだけ、コンポーネント図は無い)。
var ENTRIES = [
  { name: 'spi_init_sequence', kind: 'sequence', savedKind: 'sequence' },
  { name: 'timer_init_sequence', kind: 'sequence', savedKind: '' },
  { name: 'irq_state', kind: 'state', savedKind: 'state' },
  { name: 'driver_common_class', kind: 'class', savedKind: 'class' },
];

// --- 探しに来た答えが、一覧を読まずに出る ------------------------------------
(function summary() {
  var line = DK.summaryLine(ENTRIES);
  assert.ok(line.indexOf('コンポーネント 0') >= 0,
    '1 枚も無い図種は 0 として出る（30 行読まずに「無い」と分かる）: ' + line);
  assert.ok(line.indexOf('シーケンス 2') >= 0, line);
  assert.ok(line.indexOf('状態遷移 1') >= 0, line);
  assert.ok(line.indexOf('クラス 1') >= 0, line);
})();

// --- 行の印 -----------------------------------------------------------------
(function badges() {
  // 保存したときの図種の控えがあれば、それを印にする (📂 一覧と同じ決め方)。
  var b = PF.kindBadge(ENTRIES[0]);
  assert.strictEqual(b.source, 'saved');
  assert.strictEqual(b.slug, 'sequence');
  assert.ok(b.text.indexOf('シーケンス') >= 0, b.text);
  assert.ok(b.text.indexOf('⇄') >= 0, '印は図種の形で見分ける: ' + b.text);

  // 控えの無い図 (先輩が前の版で保存したもの) は本文からの判定を出す。
  var g = PF.kindBadge(ENTRIES[1]);
  assert.strictEqual(g.source, 'guess');
  assert.strictEqual(g.text, 'シーケンス');

  // どちらも無ければ印を出さない。当てずっぽうの印は、無い図種を有ると読ませる。
  assert.strictEqual(PF.kindBadge({ name: 'diagram1', kind: '', savedKind: '' }), null);
  assert.strictEqual(PF.kindBadge({ name: 'x', kind: 'nope', savedKind: 'nope' }), null);
  assert.strictEqual(PF.kindBadge(null), null);
})();

console.log('blk-junior-2206-peek-kind: ok');
