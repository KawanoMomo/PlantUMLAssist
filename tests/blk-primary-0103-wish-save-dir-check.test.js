'use strict';
// BLK-primary-20260908-0103-wish の残り: 保存先ディレクトリの欄に打った (貼った) パスを反映する前に確かめる。
// 書式ミス (バックスラッシュ破損) で一覧が無言で空になる事故が起きないよう、直せる崩れは直し、直せない崩れは断る。
// 渡された文面ごと貼る受け口 (fromText / toBlock) は TICKET-owner-20261116-0621-prune で外した。
var assert = require('assert');
var jsdom = require('jsdom');
var prevWindow = global.window;
var prevDocument = global.document;
var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

[
  '../src/core/save-dir-check.js',
].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
  require(p);
});
var SDC = global.window.MA.saveDirCheck;

// ── normalize ──────────────────────────────────────────────────────────────
// 台本どおりバックスラッシュで打たれた Windows 絶対パスを、往復で壊れない
// スラッシュ区切りに寄せる。
assert.strictEqual(SDC.normalize('E:\\01_Loop\\persona-data\\primary'),
  'E:/01_Loop/persona-data/primary');
assert.strictEqual(SDC.normalize('  "E:\\01_Loop\\persona-data\\primary"  '),
  'E:/01_Loop/persona-data/primary');
assert.strictEqual(SDC.normalize('E:/01_Loop/persona-data/primary/'),
  'E:/01_Loop/persona-data/primary');
assert.strictEqual(SDC.normalize('E:\\'), 'E:/');
assert.strictEqual(SDC.normalize('./autosave'), './autosave');
assert.strictEqual(SDC.normalize(''), '');

// ── check: 直せる崩れは直す ────────────────────────────────────────────────
var ok = SDC.check('E:\\01_Loop\\persona-data\\primary');
assert.strictEqual(ok.ok, true);
assert.strictEqual(ok.value, 'E:/01_Loop/persona-data/primary');
assert.ok(ok.notes.join('').indexOf('スラッシュ') >= 0);

var quoted = SDC.check('"E:/01_Loop/persona-data/primary"');
assert.strictEqual(quoted.ok, true);
assert.strictEqual(quoted.value, 'E:/01_Loop/persona-data/primary');
assert.ok(quoted.notes.join('').indexOf('引用符') >= 0);

var plain = SDC.check('E:/01_Loop/persona-data/primary');
assert.strictEqual(plain.ok, true);
assert.strictEqual(plain.changed, false);
assert.deepStrictEqual(plain.notes, []);

// ── check: 直せない崩れは断る (無言で空にしない) ───────────────────────────
// 起票された実際の壊れ値: `\0` が制御文字になり以降のバックスラッシュが消える。
var broken = SDC.check('E:\u0001_Looppersona-dataprimary');
assert.strictEqual(broken.ok, false);
assert.ok(broken.reason.indexOf('バックスラッシュ') >= 0);

// バックスラッシュだけが落ちた値 (制御文字は無い) も反映しない。
var lost = SDC.check('E:01_Looppersona-dataprimary');
assert.strictEqual(lost.ok, false);
assert.ok(lost.reason.indexOf('区切り') >= 0);

var empty = SDC.check('   ');
assert.strictEqual(empty.ok, false);
assert.ok(empty.reason.indexOf(SDC.LABEL) >= 0);

// 外した受け口は口ごと無い (渡された文面を拾う関数を呼べない)。
assert.strictEqual(typeof SDC.fromText, 'undefined');
assert.strictEqual(typeof SDC.toBlock, 'undefined');

global.window = prevWindow;
global.document = prevDocument;
console.log('blk-primary-0103-wish-save-dir-check: ok');
