'use strict';
// BLK-junior-20260907-2303-wish: 指摘一覧から「この指摘の対象へジャンプ」。
// レイアウトが変わっても、指摘の対象要素を目で探さずに選択できること。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/review-pins.js')]; } catch (e) {}
require('../src/core/review-pins.js');
try { delete require.cache[require.resolve('../src/core/pin-jump.js')]; } catch (e) {}
require('../src/core/pin-jump.js');
var RP = global.window.MA.reviewPins;
var PJ = global.window.MA.pinJump;

var results = [];
function ok(name, cond, detail) {
  results.push({ name: name, pass: !!cond, detail: detail });
}
function eq(name, actual, expected) {
  ok(name, actual === expected, 'expected ' + JSON.stringify(expected) + ' got ' + JSON.stringify(actual));
}

var DSL = [
  '@startuml',
  'title SpiDrv',
  '[*] --> Spi_Idle',
  'Spi_Idle --> Spi_Busy : 送信を開始',
  'Spi_Busy --> Spi_Error : 異常を検知',
  '@enduml',
].join('\n');

// 図の選択候補 (state モジュールの kbdSelectables 相当)。
var CANDS = [
  { type: 'transition', id: 't1', line: 3 },
  { type: 'transition', id: 't2', line: 4 },
  { type: 'transition', id: 't3', line: 5 },
];

// --- normalizeCandidates: line を持たない候補は落ちる、並びは行順 ---
var norm = PJ.normalizeCandidates([
  { type: 'transition', id: 'b', line: 5 },
  { type: 'transition', id: 'a', line: 3 },
  { type: 'transition', id: 'x' },
  null,
  { type: 'transition', line: 4 },
]);
eq('normalize: 有効な候補だけ残る', norm.length, 2);
eq('normalize: 行順に並ぶ', norm[0].id + norm[1].id, 'ab');

// --- candidateAt ---
eq('candidateAt: その行の要素', PJ.candidateAt(CANDS, 4).id, 't2');
eq('candidateAt: 候補が無い行', PJ.candidateAt(CANDS, 2), null);
eq('candidateAt: 数値でない行', PJ.candidateAt(CANDS, null), null);

// --- nearestCandidate: 指摘先が選択候補でない行 (title など) のときの寄せ先 ---
eq('nearest: 近い候補へ寄せる', PJ.nearestCandidate(CANDS, 2).id, 't1');
eq('nearest: 遠すぎれば寄せない', PJ.nearestCandidate(CANDS, 40), null);
eq('nearest: 同距離は上の行', PJ.nearestCandidate([
  { type: 'transition', id: 'up', line: 3 },
  { type: 'transition', id: 'down', line: 5 },
], 4).id, 'up');

// --- plan: 生きている指摘 ---
var withPin = RP.add(DSL, { line: 5, text: '異常検知からの復帰遷移が無い', author: 'junior' });
var pins = RP.list(withPin);
eq('pin が 1 件登録される', pins.length, 1);
var p = PJ.plan(pins[0], CANDS);
ok('plan: 飛べる', p.ok === true && p.stale === false);
eq('plan: 対象行', p.line, 5);
eq('plan: 対象要素', p.item.id, 't3');
eq('plan: 修正フォームを開く', p.openProps, true);
eq('plan: 寄せていない', p.approx, false);
ok('plan: 何が起きるかを 1 行で言う', p.message.indexOf('L5') >= 0 && p.message.indexOf('t3') >= 0, p.message);

// --- plan: 上に行が増えても対象は追従する (anchor 結び付け) ---
var shifted = withPin.replace('title SpiDrv', 'title SpiDrv\nnote "改版 2" as N1');
var shiftedPin = RP.list(shifted)[0];
eq('行が増えても指摘先の行が繰り下がる', shiftedPin.line, 6);
var SHIFTED_CANDS = [
  { type: 'transition', id: 't1', line: 4 },
  { type: 'transition', id: 't2', line: 5 },
  { type: 'transition', id: 't3', line: 6 },
];
eq('繰り下がった行でも同じ要素へ飛ぶ', PJ.plan(shiftedPin, SHIFTED_CANDS).item.id, 't3');

// --- plan: 指摘先の行が書き換わった (迷子) ---
var broken = withPin.replace('Spi_Busy --> Spi_Error : 異常を検知', 'Spi_Busy --> Spi_Fault : 異常を検知');
var brokenPin = RP.list(broken)[0];
ok('迷子の指摘は stale', brokenPin.stale === true);
var bp = PJ.plan(brokenPin, CANDS);
eq('plan: 迷子は飛ばない', bp.ok, false);
eq('plan: 迷子はフォームを開かない', bp.openProps, false);
ok('plan: 迷子は理由を言う', bp.message.indexOf('書き換わ') >= 0, bp.message);
eq('canJump: 迷子は押せない', PJ.canJump(brokenPin), false);
eq('canJump: 生きていれば押せる', PJ.canJump(pins[0]), true);
eq('jumpLabel: 迷子', PJ.jumpLabel(brokenPin), '対象が迷子');

// --- plan: 選べる要素が無い行 ---
var np = PJ.plan({ id: '9', line: 30, stale: false, anchor: 'x' }, CANDS);
eq('plan: 候補が無くても行へは飛べる', np.ok, true);
eq('plan: 候補が無ければ選択しない', np.item, null);
eq('plan: 候補が無ければフォームも開かない', np.openProps, false);

// --- plan: 引数なし ---
eq('plan: pin なし', PJ.plan(null, CANDS).ok, false);

// --- nextOpen: 未読だけを順に辿り、末尾で先頭へ戻る ---
var multi = RP.add(RP.add(DSL, { line: 3, text: 'A' }), { line: 4, text: 'B' });
multi = RP.add(multi, { line: 5, text: 'C' });
var mp = RP.list(multi);
eq('3 件登録される', mp.length, 3);
eq('nextOpen: 現在なしなら先頭', PJ.nextOpen(mp, null).text, 'A');
eq('nextOpen: 次の未読', PJ.nextOpen(mp, PJ.nextOpen(mp, null).id).text, 'B');
var lastId = mp[mp.length - 1].id;
eq('nextOpen: 末尾の次は先頭へ戻る', PJ.nextOpen(mp, lastId).text, 'A');
// 既読は飛ばす。
var readFirst = RP.setState(multi, mp[0].id, 'read');
var rp = RP.list(readFirst);
eq('nextOpen: 既読は飛ばす', PJ.nextOpen(rp, null).text, 'B');
// 全部既読なら次は無い。
var allRead = rp.reduce(function(dsl, x) { return RP.setState(dsl, x.id, 'read'); }, readFirst);
eq('nextOpen: 全部既読なら null', PJ.nextOpen(RP.list(allRead), null), null);
eq('nextOpen: 空なら null', PJ.nextOpen([], null), null);

var failed = results.filter(function(r) { return !r.pass; });
results.forEach(function(r) {
  if (!r.pass) console.log('FAIL: ' + r.name + ' — ' + r.detail);
});
console.log((results.length - failed.length) + '/' + results.length + ' passed');
if (failed.length) process.exit(1);
