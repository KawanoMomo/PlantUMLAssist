'use strict';
// BLK-human-20260909-2200: 配布先には Python も Java も PlantUML も入っていない。
// アプリ版 (pywebview + exe) では jar と Java を利用者が入れることになり、保存も
// ブラウザのダウンロードではなくネイティブのダイアログになる。その分岐と文言は
// すべて `/env` の答えから決まるので、答えの形と判定をここで固定する。
const assert = require('assert');
if (!global.window) global.window = global;
try { delete require.cache[require.resolve('../src/core/app-bridge.js')]; } catch (e) {}
require('../src/core/app-bridge.js');
var AB = global.window.MA.appBridge;

// ── isApp ───────────────────────────────────────────────────────────────
// /env をまだ取れていない間は Web 版として振る舞う (保存を止めない)。
assert.strictEqual(AB.isApp(null), false);
assert.strictEqual(AB.isApp({}), false);
assert.strictEqual(AB.isApp({ app: false }), false);
assert.strictEqual(AB.isApp({ app: true }), true);

// setEnv したあとは引数なしでも判定できる (downloadBlob はここから見る)。
AB.setEnv({ app: true });
assert.strictEqual(AB.isApp(), true);
AB.setEnv(null);
assert.strictEqual(AB.isApp(), false);

// ── jarStatus ───────────────────────────────────────────────────────────
// jar があるときは、どこのものを使っているかまで見せる (同梱していないので)。
var have = AB.jarStatus({ jar: true, jarPath: 'C:\tools\plantuml.jar' });
assert.strictEqual(have.ok, true);
assert.ok(have.text.indexOf('C:\tools\plantuml.jar') >= 0, have.text);

// 無いときは「選ぶ」「公式から取得」の 2 つの道をその場で言う。
var missing = AB.jarStatus({ jar: false, canFetchJar: true });
assert.strictEqual(missing.ok, false);
assert.strictEqual(missing.canFetch, true);
assert.ok(missing.text.indexOf('選ぶ') >= 0, missing.text);
assert.ok(missing.text.indexOf('公式から取得') >= 0, missing.text);

// Windows 以外・スクリプトが無い環境では「公式から取得」は押せない。
assert.strictEqual(AB.jarStatus({ jar: false, canFetchJar: false }).canFetch, false);

// ── javaStatus ──────────────────────────────────────────────────────────
var javaOk = AB.javaStatus({ java: { found: true, version: '21.0.2' } });
assert.strictEqual(javaOk.ok, true);
assert.ok(javaOk.text.indexOf('21.0.2') >= 0, javaOk.text);
assert.strictEqual(javaOk.url, '');

// Java が無いときは、案内先 (Temurin) を必ず持たせる。server が言わなくても既定を出す。
var javaNg = AB.javaStatus({ java: { found: false }, javaUrl: 'https://adoptium.net/temurin/releases/' });
assert.strictEqual(javaNg.ok, false);
assert.strictEqual(javaNg.url, 'https://adoptium.net/temurin/releases/');
assert.ok(AB.javaStatus({}).url.indexOf('adoptium.net') >= 0);

// ── saveBody ────────────────────────────────────────────────────────────
// テキストはそのまま、画像などは base64 で渡す。両方あれば base64 が勝つ
// (バイナリを UTF-8 文字列に落として壊さない)。
assert.deepStrictEqual(AB.saveBody('a.puml', { text: '@startuml' }),
  { fileName: 'a.puml', text: '@startuml' });
assert.deepStrictEqual(AB.saveBody('a.png', { base64: 'AAEC' }),
  { fileName: 'a.png', base64: 'AAEC' });
assert.deepStrictEqual(AB.saveBody('a.md', 'text'), { fileName: 'a.md', text: 'text' });
assert.strictEqual(AB.saveBody('a.png', { base64: 'AAEC', text: 'x' }).text, undefined);

// ── nativeSave ──────────────────────────────────────────────────────────
// Web 版では server を叩かずに fallback を返す (従来のダウンロードに落ちる)。
AB.setEnv({ app: false });
var calls = 0;
global.window.fetch = function() { calls++; return Promise.resolve({ ok: true, json: function() { return Promise.resolve({}); } }); };
AB.nativeSave('a.svg', { text: 'x' }).then(function(res) {
  assert.strictEqual(res.fallback, true);
  assert.strictEqual(calls, 0, 'Web 版では /native-save を叩かない');
});

// アプリ版で保存を断られたら canceled。ダウンロードにも落とさない
// (利用者が「やめる」を押したのに勝手にファイルが増えない)。
AB.setEnv({ app: true });
global.window.fetch = function() {
  return Promise.resolve({ ok: true, json: function() { return Promise.resolve({ canceled: true }); } });
};
AB.nativeSave('a.svg', { text: 'x' }).then(function(res) {
  assert.strictEqual(res.canceled, true);
  assert.strictEqual(res.fallback, undefined);
});

// server が 409 (Web 版 / ダイアログ無し) を返したら fallback。
global.window.fetch = function() { return Promise.resolve({ ok: false, json: function() { return Promise.resolve({}); } }); };
AB.nativeSave('a.svg', { text: 'x' }).then(function(res) {
  assert.strictEqual(res.fallback, true);
});

// fetch そのものが落ちても保存の道を塞がない。
global.window.fetch = function() { return Promise.reject(new Error('boom')); };
AB.nativeSave('a.svg', { text: 'x' }).then(function(res) {
  assert.strictEqual(res.fallback, true);
});

delete global.window.fetch;
AB.setEnv(null);
console.log('    ✓ BLK-human-20260909-2200 app-bridge');
