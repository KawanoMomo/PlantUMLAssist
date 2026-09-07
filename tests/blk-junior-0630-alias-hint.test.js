'use strict';
// BLK-junior-20260908-0630: Usecase 追加フォームの Alias 欄に日本語名を打つと、
// 識別子は U1 に自動採番され、打った名前は表示名に回る。図は正しく描けるので
// 打った本人はそれに気付けず、あとで関係の To を選び直すときプルダウンの表示と
// DSL の実体が同じものか確信が持てなかった。
// 打っている最中の 1 行ヒントと、プルダウンの「ラベル (id)」併記を固定する。
const assert = require('assert');
if (!global.window) global.window = global;
try { delete require.cache[require.resolve('../src/core/id-normalizer.js')]; } catch (e) {}
try { delete require.cache[require.resolve('../src/core/alias-hint.js')]; } catch (e) {}
require('../src/core/id-normalizer.js');
require('../src/core/alias-hint.js');
var AH = global.window.MA.aliasHint;

// ── hintFor ────────────────────────────────────────────────────────────
// 空欄では何も言わない (打つ前から警告を出さない)。
var empty = AH.hintFor('', {}, 'U');
assert.strictEqual(empty.kind, 'empty');
assert.strictEqual(empty.text, '');
assert.strictEqual(AH.hintFor('   ', {}, 'U').kind, 'empty');

// ASCII をそのまま打ったときは、それが識別子になると言う。
var ascii = AH.hintFor('Login', {}, 'U');
assert.strictEqual(ascii.kind, 'ascii');
assert.strictEqual(ascii.id, 'Login');
assert.ok(ascii.text.indexOf('Login') >= 0, ascii.text);
assert.ok(ascii.text.indexOf('Label') >= 0, ascii.text);

// junior が実際に打った名前。自動採番されることを、押す前に言う。
var jp = AH.hintFor('GPIOエラー回復', {}, 'U');
assert.strictEqual(jp.kind, 'auto');
assert.strictEqual(jp.id, 'U1');
assert.strictEqual(jp.label, 'GPIOエラー回復');
assert.ok(jp.text.indexOf('GPIOエラー回復') >= 0, jp.text);
assert.ok(jp.text.indexOf('U1') >= 0, jp.text);
assert.ok(jp.text.indexOf('表示名') >= 0, jp.text);
// 実際に書かれる DSL の形をそのまま見せる。
assert.ok(jp.text.indexOf('"GPIOエラー回復" as U1') >= 0, jp.text);

// 既に埋まっている識別子は避ける。ヒントの番号と実際の採番は同じ経路 (idNormalizer)。
var jp2 = AH.hintFor('GPIOエラー回復', { U1: true, U2: true }, 'U');
assert.strictEqual(jp2.id, 'U3');
assert.ok(jp2.text.indexOf('U3') >= 0, jp2.text);
// prefix は図種ごと。Actor 側は A。
assert.strictEqual(AH.hintFor('開発者', {}, 'A').id, 'A1');

// ヒントが名乗る id は、実際の normalize() の結果と必ず一致する
// (文言だけが古くなる事故を止める)。
['GPIOエラー回復', 'Login', '診断 実行', 'U1', ''].forEach(function(raw) {
  var taken = { U1: true };
  var h = AH.hintFor(raw, taken, 'U');
  var n = global.window.MA.idNormalizer.normalize(raw, taken, 'U');
  assert.strictEqual(h.id, n.valid ? n.id : '', raw);
  assert.strictEqual(h.label, n.valid ? n.label : '', raw);
});

// ── optionLabel ────────────────────────────────────────────────────────
// ラベルと識別子がずれているときだけ併記する。
assert.strictEqual(AH.optionLabel('U1', 'GPIOエラー回復'), 'GPIOエラー回復 (U1)');
// 同じなら重ねない (Login (Login) にしない)。
assert.strictEqual(AH.optionLabel('Login', 'Login'), 'Login');
// ラベルが無ければ識別子だけ。
assert.strictEqual(AH.optionLabel('U1', ''), 'U1');
assert.strictEqual(AH.optionLabel('U1', null), 'U1');
// 識別子が無ければラベルだけ。
assert.strictEqual(AH.optionLabel('', 'ラベル'), 'ラベル');

console.log('blk-junior-0630-alias-hint: OK');
