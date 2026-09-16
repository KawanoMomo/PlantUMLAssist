'use strict';
// BLK-human-20260915-1201: 初回起動は plantuml.jar が無い。設定で jar を入れても
// 画面は「jar がない」と言ったままで、アプリを起動し直すまで描けなかった。
// 「入った瞬間に描き直す」判定と、取得中 / 完了 / 失敗の文言をここで固定する。
const assert = require('assert');
if (!global.window) global.window = global;
try { delete require.cache[require.resolve('../src/core/app-bridge.js')]; } catch (e) {}
require('../src/core/app-bridge.js');
var AB = global.window.MA.appBridge;

// ── jarReady ────────────────────────────────────────────────────────────
// /env の答えが無い間は「まだ描けない」扱い (無い図を描きに行かない)。
assert.strictEqual(AB.jarReady(null), false);
assert.strictEqual(AB.jarReady({}), false);
assert.strictEqual(AB.jarReady({ jar: false }), false);
assert.strictEqual(AB.jarReady({ jar: true }), true);

// ── jarTurnedReady ──────────────────────────────────────────────────────
// 再描画するのは「無い → ある」に変わった 1 回だけ。設定を開くたびに
// 描き直すと、jar が元からある機械で無駄な往復が増える。
assert.strictEqual(AB.jarTurnedReady({ jar: false }, { jar: true }), true);
assert.strictEqual(AB.jarTurnedReady(null, { jar: true }), true);
assert.strictEqual(AB.jarTurnedReady({ jar: true }, { jar: true }), false);
assert.strictEqual(AB.jarTurnedReady({ jar: false }, { jar: false }), false);

// ── phaseOf ─────────────────────────────────────────────────────────────
assert.strictEqual(AB.phaseOf({ jarPath: 'C:/p/plantuml.jar', env: { jar: true } }), 'done');
assert.strictEqual(AB.phaseOf({ canceled: true }), 'canceled');
assert.strictEqual(AB.phaseOf({ error: '取れません' }), 'error');
assert.strictEqual(AB.phaseOf(null), 'error');

// ── engineProgress ──────────────────────────────────────────────────────
// 取得中: 押した直後に「進んでいる」と分かり、その間は押し直せない。
var fetching = AB.engineProgress('fetching');
assert.strictEqual(fetching.phase, 'fetching');
assert.strictEqual(fetching.busy, true);
assert.strictEqual(fetching.retry, false);
assert.ok(fetching.text.indexOf('取得しています') >= 0, fetching.text);

var picking = AB.engineProgress('picking');
assert.strictEqual(picking.busy, true);

// 完了: どこの jar を使うかと、再起動が要らないことを言う。
var done = AB.engineProgress('done', { jarPath: 'C:/tools/plantuml.jar', env: { jar: true } });
assert.strictEqual(done.phase, 'done');
assert.strictEqual(done.bad, false);
assert.strictEqual(done.busy, false);
assert.strictEqual(done.retry, false);
assert.ok(done.text.indexOf('C:/tools/plantuml.jar') >= 0, done.text);
assert.ok(done.text.indexOf('再起動せず') >= 0, done.text);

// 失敗: 理由と、次に何をすればよいかを同じ 1 行に出し、再試行の入口を出す。
var failed = AB.engineProgress('error', { error: 'HTTP 403 (取得元に届きません)' });
assert.strictEqual(failed.phase, 'error');
assert.strictEqual(failed.bad, true);
assert.strictEqual(failed.retry, true);
assert.strictEqual(failed.busy, false);
assert.ok(failed.text.indexOf('HTTP 403') >= 0, failed.text);
assert.ok(failed.text.indexOf('もう一度') >= 0, failed.text);

// 理由が返ってこなかったときも黙って消えない。
assert.ok(AB.engineProgress('error', {}).text.indexOf('理由が分かりません') >= 0);

// 取り消し: 失敗ではないが、まだ jar は入っていないので入口は残す。
var canceled = AB.engineProgress('canceled', {});
assert.strictEqual(canceled.bad, false);
assert.strictEqual(canceled.retry, true);

// ── Java が無いときの案内は残っている ───────────────────────────────────
var noJava = AB.javaStatus({ jar: true, java: { found: false } });
assert.strictEqual(noJava.ok, false);
assert.ok(noJava.url.indexOf('adoptium.net') >= 0, noJava.url);

console.log('blk-human-1201-jar-live: ok');
