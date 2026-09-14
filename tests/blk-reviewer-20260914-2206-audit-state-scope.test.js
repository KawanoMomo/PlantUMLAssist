'use strict';
// BLK-reviewer-20260914-2206: 前回比較用の控え (.assist-audit-last.json) は CLI を
// 打つ場所に 1 個しか無く、どの対象を渡した回でも同じファイルを上書きしていた。
// `-p primary` → `-p junior,primary` (どちらも reviewer の毎 tick の手順)、あるいは
// テストが一時フォルダを対象に audit.js を回した後に素で叩くと、次の回は「別の対象で
// 採った控え」と比べ、図がバイト無差分でも全枚が「前回控えから変わった図」に出る。
// 対象の組を鍵にして控えを分けて持てば、打つ順序で数字が変わらなくなる。
var assert = require('assert');

var prev = {};
['../src/core/audit-scope.js', '../src/core/audit-state.js'].forEach(function(p) {
  try { delete require.cache[require.resolve(p)]; } catch (e) {}
});
var AS = require('../src/core/audit-state.js');

function rep(targets, files) {
  return { generatedAt: '2026-09-15T00:00:00.000Z', targets: targets, audits: { name: {} }, files: files };
}

// 鍵は「同じフォルダを同じ組で渡した回」だけが一致する。
(function scopeKeyIdentity() {
  var a = ['E:\\data\\primary'];
  assert.strictEqual(AS.scopeKey(a), AS.scopeKey(['E:/data/primary/']), '区切り・末尾スラッシュでは変わらない');
  assert.strictEqual(AS.scopeKey(a), AS.scopeKey(['E:\\DATA\\Primary']), '大文字小文字では変わらない');
  assert.strictEqual(AS.scopeKey(['a', 'b']), AS.scopeKey(['b', 'a']), '渡す順では変わらない');
  assert.notStrictEqual(AS.scopeKey(['a']), AS.scopeKey(['a', 'b']), '組が違えば別の鍵');
})();

// 別の対象の控えは覗かない = 「前回なし」と同じ扱いになる。
(function pickIsScoped() {
  var store = AS.put({ scopes: {} }, ['E:\\data\\primary'], rep(['E:\\data\\primary'], []));
  assert.ok(AS.pick(store, ['E:\\data\\primary']), '同じ対象なら引ける');
  assert.strictEqual(AS.pick(store, ['E:\\data\\junior', 'E:\\data\\primary']), null,
    '対象の組が違う控えは引けない (これを引くと全枚が「変わった図」に出る)');
  assert.strictEqual(AS.pick(store, ['C:\\Temp\\pua-audit-xxxx']), null,
    'テストが一時フォルダで回した控えは素の回に混ざらない');
})();

// 対象を切り替えて打っても、それぞれが自分の前回と比べ続けられる。
(function putKeepsOtherScopes() {
  var P = ['E:\\data\\primary'], JP = ['E:\\data\\junior', 'E:\\data\\primary'];
  var store = AS.put({ scopes: {} }, P, rep(P, [{ name: 'a.puml', hash: 'h1' }]));
  store = AS.put(store, JP, rep(JP, [{ name: 'primary/a.puml', hash: 'h1' }]));
  var back = AS.pick(store, P);
  assert.ok(back, 'junior,primary を挟んでも primary の控えは残る');
  assert.deepStrictEqual(back.report.files, [{ name: 'a.puml', hash: 'h1' }],
    '残っているのは primary の回で採った控えそのもの');
})();

// 控えは増え続けない。古いものから落ちる。
(function putPrunes() {
  var store = { scopes: {} };
  for (var i = 0; i < 6; i++) {
    var t = ['E:\\data\\p' + i];
    store = AS.put(store, t, rep(t, []), '2026-09-15T00:0' + i + ':00.000Z', 3);
  }
  assert.strictEqual(Object.keys(store.scopes).length, 3, '上限まで刈られる');
  assert.ok(AS.pick(store, ['E:\\data\\p5']), '新しいものが残る');
  assert.strictEqual(AS.pick(store, ['E:\\data\\p0']), null, '古いものが落ちる');
})();

// 壊れた控え・対象ごとに分ける前の形。落とさず、移行の回も比較を失わない。
(function readStoreIsForgiving() {
  assert.deepStrictEqual(AS.readStore('{ not json').scopes, {}, '壊れていても落とさない');
  assert.deepStrictEqual(AS.readStore('').scopes, {}, '空でも落とさない');
  assert.deepStrictEqual(AS.readStore('{"a":1}').scopes, {}, 'audits の無い JSON は控えではない');
  var legacy = JSON.stringify(rep(['E:\\data\\primary'], []));
  var st = AS.readStore(legacy);
  assert.ok(AS.pick(st, ['E:\\data\\primary']), '旧い 1 件だけの控えも、その対象の控えとして読める');
  assert.strictEqual(AS.pick(st, ['E:\\data\\junior']), null, '旧い控えも別の対象には使わない');
})();

// 書いたものがそのまま読み戻せる (CLI はこの 2 本でファイルを往復する)。
(function roundTrip() {
  var P = ['E:\\data\\primary'];
  var st = AS.put({ scopes: {} }, P, rep(P, [{ name: 'a.puml', hash: 'h1' }]));
  var back = AS.pick(AS.readStore(AS.serialize(st)), P);
  assert.ok(back && back.report.audits, '往復しても控えとして引ける');
  assert.strictEqual(back.targets[0], 'E:\\data\\primary', '対象も残る');
})();

// 「今の数字が何と比べた数字か」を 1 行で言う。無いときは無いと言う。
(function describeSaysProvenance() {
  var P = ['E:\\data\\primary'];
  var st = AS.put({ scopes: {} }, P, rep(P, []), '2026-09-15T01:23:45.000Z');
  var line = AS.describe(AS.pick(st, P));
  assert.ok(line.indexOf('2026-09-15T01:23:45.000Z') >= 0, 'いつ採った控えかを言う');
  assert.ok(line.indexOf('E:\\data\\primary') >= 0, 'どの対象の控えかを言う');
  assert.ok(AS.describe(null).indexOf('ありません') >= 0, '控えが無い回はそう言う');
})();

console.log('blk-reviewer-20260914-2206-audit-state-scope: ok');
