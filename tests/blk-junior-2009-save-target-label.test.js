'use strict';
// BLK-junior-20260907-2009: 保存先はサーバ側に覚えられているのに画面のどこにも
// 出ないので、「設定済みであること」に気づけず ⚙設定 → ファイル → パス再入力 → OK を
// 図種を変えるたびに打ち直していた。上部バーに常時出す文字列をここで固定する。
const assert = require('assert');
if (!global.window) global.window = global;
try { delete require.cache[require.resolve('../src/core/save-target.js')]; } catch (e) {}
require('../src/core/save-target.js');
var st = global.window.MA.saveTarget;

// ── 末尾のフォルダ名 ──────────────────────────────────────────────────────
// 上部バーは狭いので、どの置き場所かが分かる 1 語だけを出す。
assert.strictEqual(st.tailOf('E:\\01_Loop\\persona-data\\junior'), 'junior');
assert.strictEqual(st.tailOf('E:/01_Loop/persona-data/junior/'), 'junior');
assert.strictEqual(st.tailOf('/var/data/out'), 'out');
// 相対指定の '.' / '..' は 1 語にすると意味が消えるので、そのまま出す。
assert.strictEqual(st.tailOf('./'), '.');
assert.strictEqual(st.tailOf('..'), '..');
assert.strictEqual(st.tailOf(''), '');
assert.strictEqual(st.tailOf(null), '');

// ── 保存先の表示 ──────────────────────────────────────────────────────────
var file = st.label({ backend: 'file', fileDir: 'E:\\01_Loop\\persona-data\\junior' });
assert.strictEqual(file.mode, 'file');
assert.strictEqual(file.configured, true, '設定済みだと分かる');
assert.strictEqual(file.text, '📁 junior');
// 「もう設定されている」ことと、次にやるべき操作を title で言い切る。
assert.ok(/保存先は設定済みです/.test(file.title));
assert.ok(/E:\\01_Loop\\persona-data\\junior/.test(file.title), 'フルパスは title に残す');
// BLK-junior-20260913-0306: 保存の入口が Ctrl+K の「ファイルを保存」から、
// このチップの隣の [💾 保存] ボタンに変わった。案内先もそちらにする。
assert.ok(/💾 保存/.test(file.title), '次にどこを押せば保存されるかを伝える');
assert.ok(!/Ctrl\+K/.test(file.title), '無くなった経路を案内しない');

// fileDir が空でも backend が file なら既定の保存先を出す (無表示にしない)。
assert.strictEqual(st.label({ backend: 'file' }).text, '📁 autosave');

// 未設定はダウンロードになることを先に言う (保存して初めて気づく状態を作らない)。
var dl = st.label({ backend: 'localStorage', fileDir: './autosave' });
assert.strictEqual(dl.mode, 'download');
assert.strictEqual(dl.configured, false);
assert.strictEqual(dl.text, '⬇ ダウンロード');
assert.ok(/未設定/.test(dl.title));

// 設定そのものが読めない環境でも表示は出す。
assert.strictEqual(st.label(null).mode, 'download');
assert.strictEqual(st.label(undefined).configured, false);

// ── 既存の判定は変わらない ────────────────────────────────────────────────
global.window.MA.workspace = { isValidName: function(n) { return /^[A-Za-z0-9_.-]+$/.test(n || ''); } };
var t = st.decide({ backend: 'file', fileDir: 'E:\\out' }, { name: 'can_usecase' });
assert.strictEqual(t.mode, 'file');
assert.strictEqual(t.dir, 'E:\\out');

console.log('blk-junior-2009-save-target-label: ok');
