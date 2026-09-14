'use strict';
// BLK-primary-20260912-2103-wish: 変更サマリボードは開いている図しか並べず、
// いつもの 14 枚に入らない雑多な図 (別件で開き直して書き出した diagram1) は
// 会議の一覧から黙って抜け落ちていた。保存フォルダで基準より後に更新された
// ファイルを機械的に拾えることをここで固定する。
const assert = require('assert');
if (!global.window) global.window = global;
try { delete require.cache[require.resolve('../src/core/change-board.js')]; } catch (e) {}
require('../src/core/change-board.js');
var CB = global.window.MA.changeBoard;

var SINCE = '2026-09-12T09:00:00Z';

var OPEN_DOCS = [
  { id: 'd1', name: 'spi_init_sequence', dsl: '@startuml\nA -> B : Spi_Init\n@enduml' },
];

var FILE_DOCS = [
  // 開いている図と同名。フォルダ側から二重に載せない
  { name: 'spi_init_sequence', dsl: '@startuml\nA -> B : Spi_Init\n@enduml', mtime: '2026-09-12T10:00:00Z' },
  // 14 枚の外。今日エクスポートし直した図 = 会議で見せたい分
  { name: 'diagram1', dsl: '@startuml\nclass Foo\n@enduml', mtime: '2026-09-12T10:30:00Z' },
  // 基準より前。今日触っていないので載せない
  { name: 'old_notes', dsl: '@startuml\nclass Old\n@enduml', mtime: '2026-09-01T10:00:00Z' },
  // mtime が無い = いつ更新されたか言えないので載せない
  { name: 'unknown_time', dsl: '@startuml\nclass X\n@enduml', mtime: null },
];

// --- 拾う範囲 ---------------------------------------------------------------
(function extras() {
  var ex = CB.folderExtras(FILE_DOCS, OPEN_DOCS, { since: SINCE });
  assert.deepStrictEqual(ex.map(function(e) { return e.name; }), ['diagram1'],
    '基準より後に更新された、開いていない図だけを拾う');
  assert.strictEqual(ex[0].id, 'file:diagram1');
  assert.strictEqual(ex[0].origin, 'folder');
  assert.strictEqual(ex[0].mtime, '2026-09-12T10:30:00Z');

  // since を渡さなければフォルダの未オープン分を全部
  var all = CB.folderExtras(FILE_DOCS, OPEN_DOCS, {});
  assert.deepStrictEqual(all.map(function(e) { return e.name; }).sort(),
    ['diagram1', 'old_notes', 'unknown_time']);

  // 新しい順 (会議はさっき直した分から話す)
  var two = CB.folderExtras([
    { name: 'a', dsl: 'x', mtime: '2026-09-12T09:10:00Z' },
    { name: 'b', dsl: 'y', mtime: '2026-09-12T11:10:00Z' },
  ], [], { since: SINCE });
  assert.deepStrictEqual(two.map(function(e) { return e.name; }), ['b', 'a']);

  // 基準はミリ秒まで、mtime は秒まで。同じ秒は落とさずに載せる
  // (会議の一覧から黙って消えるより、1 枚余分に並ぶほうがよい)。
  var edge = CB.folderExtras([{ name: 'edge', dsl: 'z', mtime: '2026-09-12T09:00:00Z' }], [],
    { since: '2026-09-12T09:00:00.512Z' });
  assert.deepStrictEqual(edge.map(function(e) { return e.name; }), ['edge']);
  var older = CB.folderExtras([{ name: 'older', dsl: 'z', mtime: '2026-09-12T08:59:59Z' }], [],
    { since: '2026-09-12T09:00:00.512Z' });
  assert.deepStrictEqual(older, [], '1 秒でも前なら載せない');

  assert.deepStrictEqual(CB.folderExtras(null, null, {}), [], '入力が無くても落ちない');
})();

// --- ボードに載る -----------------------------------------------------------
(function board() {
  var baselines = {
    spi_init_sequence: { dsl: '@startuml\nA -> B : Spi_Init\n@enduml', at: SINCE },
  };
  function baselineOf(name) { return baselines[name] || null; }

  var docs = OPEN_DOCS.concat(CB.folderExtras(FILE_DOCS, OPEN_DOCS, { since: SINCE }));
  var b = CB.build(docs, baselineOf, {});

  var names = b.entries.map(function(e) { return e.name; });
  assert.deepStrictEqual(names, ['diagram1'],
    '開いている図は基準どおりなので出ず、フォルダで更新された図だけが並ぶ');
  assert.strictEqual(b.entries[0].origin, 'folder');
  assert.strictEqual(b.entries[0].status, 'new', '基準が無いフォルダの図は新規として並ぶ');
  assert.strictEqual(b.folderCount, 1);
  assert.ok(CB.summaryText(b).indexOf('保存フォルダ 1 枚') >= 0,
    '見出しで「14 枚の外にも今日直した図がある」と分かる');

  // 従来どおり開いている図だけなら folderCount は 0、見出しも従来の文言
  var only = CB.build(OPEN_DOCS.concat([
    { id: 'd2', name: 'can_init_sequence', dsl: '@startuml\nA -> B : Can_Init2\n@enduml' },
  ]), baselineOf, {});
  assert.strictEqual(only.folderCount, 0);
  assert.strictEqual(only.entries[0].origin, 'open');
  assert.strictEqual(only.summaryText, undefined);
  assert.ok(CB.summaryText(only).indexOf('保存フォルダ') < 0);
})();

console.log('blk-primary-2103-wish-change-board-folder: ok');
