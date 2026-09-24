'use strict';
// BLK-primary-20260908-0103-wish 「保存先設定つきで 1 プロジェクトを渡す」。
//
// 願望: 🕸 参照関係の「書き出す」に保存先ディレクトリの値も含め、受け取った側は
// その値をそのまま貼って反映できる。書式ミス (バックスラッシュ破損) で
// 一覧が無言で空になる事故が起きないよう、反映前に検証して断る。
var assert = require('assert');
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

[
  '../src/core/regex-parts.js',
  '../src/core/dsl-utils.js',
  '../src/core/name-audit.js',
  '../src/core/save-dir-handoff.js',
  '../src/core/xref-graph.js',
].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var SDH = global.window.MA.saveDirHandoff;
var XG = global.window.MA.xrefGraph;

// ── normalize ──────────────────────────────────────────────────────────────
// 台本どおりバックスラッシュで打たれた Windows 絶対パスを、往復で壊れない
// スラッシュ区切りに寄せる。
assert.strictEqual(SDH.normalize('E:\\01_Loop\\persona-data\\primary'),
  'E:/01_Loop/persona-data/primary');
assert.strictEqual(SDH.normalize('  "E:\\01_Loop\\persona-data\\primary"  '),
  'E:/01_Loop/persona-data/primary');
assert.strictEqual(SDH.normalize('E:/01_Loop/persona-data/primary/'),
  'E:/01_Loop/persona-data/primary');
assert.strictEqual(SDH.normalize('E:\\'), 'E:/');
assert.strictEqual(SDH.normalize('./autosave'), './autosave');
assert.strictEqual(SDH.normalize(''), '');

// ── check: 直せる崩れは直す ────────────────────────────────────────────────
var ok = SDH.check('E:\\01_Loop\\persona-data\\primary');
assert.strictEqual(ok.ok, true);
assert.strictEqual(ok.value, 'E:/01_Loop/persona-data/primary');
assert.ok(ok.notes.join('').indexOf('スラッシュ') >= 0);

var plain = SDH.check('E:/01_Loop/persona-data/primary');
assert.strictEqual(plain.ok, true);
assert.strictEqual(plain.changed, false);
assert.deepStrictEqual(plain.notes, []);

// ── check: 直せない崩れは断る (無言で空にしない) ───────────────────────────
// 起票された実際の壊れ値: `\0` が制御文字になり以降のバックスラッシュが消える。
var broken = SDH.check('E:\u0001_Looppersona-dataprimary');
assert.strictEqual(broken.ok, false);
assert.ok(broken.reason.indexOf('バックスラッシュ') >= 0);

// バックスラッシュだけが落ちた値 (制御文字は無い) も反映しない。
var lost = SDH.check('E:01_Looppersona-dataprimary');
assert.strictEqual(lost.ok, false);
assert.ok(lost.reason.indexOf('区切り') >= 0);

var empty = SDH.check('   ');
assert.strictEqual(empty.ok, false);

// ── fromText: xref.md ごと貼られても値だけ拾う ─────────────────────────────
var md = [
  '# 参照関係 (3 枚)',
  '',
  '## 保存先ディレクトリ',
  '',
  '- 保存先ディレクトリ: `E:/01_Loop/persona-data/primary`',
  '- 受け取った側は …',
  '',
  '## 図',
  '- spi (sequence)',
].join('\n');
assert.strictEqual(SDH.fromText(md), 'E:/01_Loop/persona-data/primary');
// パス 1 行だけを貼られた場合。
assert.strictEqual(SDH.fromText('  E:\\01_Loop\\persona-data\\primary \n'),
  'E:\\01_Loop\\persona-data\\primary');
// 保存先の節が無い xref.md からは拾わない (別の値を誤って反映しない)。
assert.strictEqual(SDH.fromText('# 参照関係\n\n## 図\n- spi (sequence)\n'), '');
assert.strictEqual(SDH.fromText(''), '');

// ── toBlock: 渡す側 ────────────────────────────────────────────────────────
var block = SDH.toBlock({ backend: 'file', fileDir: 'E:\\01_Loop\\persona-data\\primary' });
assert.ok(block.join('\n').indexOf('`E:/01_Loop/persona-data/primary`') >= 0,
  '書き出しにはスラッシュ区切りの値が載る');
// 未設定なら「渡せる保存先が無い」ことをそのまま書く。黙って落とさない。
var noDir = SDH.toBlock({ backend: 'localStorage', fileDir: './autosave' }).join('\n');
assert.ok(noDir.indexOf('未設定') >= 0);

// ── toText: 書き出しに保存先が入る ─────────────────────────────────────────
var SPI = '@startuml\nparticipant Spi_Driver\nparticipant DmaCtrl\nSpi_Driver -> DmaCtrl : go\n@enduml';
var CAN = '@startuml\nparticipant Can_Driver\nparticipant DmaCtrl\nCan_Driver -> DmaCtrl : go\n@enduml';
var docs = [
  { id: 'd1', name: 'spi', dsl: SPI, diagramType: 'plantuml-sequence' },
  { id: 'd2', name: 'can', dsl: CAN, diagramType: 'plantuml-sequence' },
];
var graph = XG.build(docs);
var withDir = XG.toText(graph, { backend: 'file', fileDir: 'E:\\01_Loop\\persona-data\\primary' });
assert.ok(withDir.indexOf('## 保存先ディレクトリ') >= 0);
assert.ok(withDir.indexOf('E:/01_Loop/persona-data/primary') >= 0);
assert.ok(withDir.indexOf('DmaCtrl') >= 0, '既存の参照関係もそのまま残る');
// 書き出した md を貼り直せば同じ値が戻る (渡す側と受ける側が噛み合う)。
var round = SDH.check(SDH.fromText(withDir));
assert.strictEqual(round.ok, true);
assert.strictEqual(round.value, 'E:/01_Loop/persona-data/primary');
// BLK-owner-20260924-0852-prune: 貼る先は ⚙設定の「保存先ディレクトリ」(1 行の入力欄)。
// 1 行の欄に貼ると改行が落ちて後ろの節まで同じ行に続くが、それでも値だけを拾う。
var flat = SDH.check(SDH.fromText(withDir.replace(/\r?\n/g, '')));
assert.strictEqual(flat.ok, true);
assert.strictEqual(flat.value, 'E:/01_Loop/persona-data/primary');
// 案内は貼る先 (パンくずのフォルダ名 → ⚙設定の保存先ディレクトリ) を指す。畳んだ 🕸 参照関係は指さない。
var guide = SDH.toBlock({ backend: 'file', fileDir: 'E:/x' }).join('\n');
assert.ok(guide.indexOf('パンくず') >= 0 && guide.indexOf('保存先ディレクトリ」') >= 0, guide);
assert.ok(guide.indexOf('参照関係') < 0, guide);
// cfg 無しの呼び出し (既存の呼び出し側) は保存先の節を出さない。
assert.ok(XG.toText(graph).indexOf('## 保存先ディレクトリ') < 0);

// ── messageFor ─────────────────────────────────────────────────────────────
assert.ok(SDH.messageFor(ok).indexOf('E:/01_Loop/persona-data/primary') >= 0);
assert.ok(SDH.messageFor(broken).indexOf('⚠') === 0);

global.window = prevWindow;
global.document = prevDocument;
console.log('blk-primary-0103-wish-save-dir-handoff: ok');
