'use strict';
// BLK-junior-20260907-1803-wish:
// 「初期化失敗時の分岐」は題材が変わっても同じ形なのに、毎回
// if の条件・then・else を打ち直している。よく使う分岐パターンを 1 つ選んで
// 「この位置に挿入」できれば、確認するのは条件文言だけになる。
if (!global.window) {
  var jsdom = require('jsdom');
  var dom = new jsdom.JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
}

try { delete require.cache[require.resolve('../src/core/activity-branch-pattern.js')]; } catch (e) {}
require('../src/core/activity-branch-pattern.js');
var BP = global.window.MA.activityBranchPattern;

var PAST = [
  '@startuml',
  'title UartDrv 初期化',
  'start',
  ':クロックを有効化する;',
  'if (ボーレート設定に失敗?) then (はい)',
  '  :E_UART_BAUD を返す;',
  'else (いいえ)',
  '  :送受信を有効化する;',
  '  :初期化完了を記録する;',
  'endif',
  'stop',
  '@enduml',
].join('\n');

// else の無い if は「型」として使えない (異常側が無い)。
var NO_ELSE = [
  '@startuml',
  'start',
  'if (再送する?) then (yes)',
  '  :再送する;',
  'endif',
  'stop',
  '@enduml',
].join('\n');

// 入れ子を含む if は行のかたまりとして持ち込めない。
var NESTED = [
  '@startuml',
  'start',
  'if (外側?) then (yes)',
  '  if (内側?) then (yes)',
  '    :A;',
  '  endif',
  'else (no)',
  '  :B;',
  'endif',
  'stop',
  '@enduml',
].join('\n');

function eq(a, b, msg) {
  var x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error((msg || '') + ' expected ' + y + ' got ' + x);
}
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }

describe('activity-branch-pattern — よく使う分岐パターン (BLK-junior-1803-wish)', function() {

test('組み込みの型に「初期化失敗時の分岐」があり、両枝の中身まで持っている', function() {
  var list = BP.builtins();
  var init = list.filter(function(p) { return p.id === 'init-fail'; })[0];
  ok(init, 'init-fail が無い');
  ok(/初期化/.test(init.cond), '条件が初期化の判定でない');
  ok(init.thenActions.length > 0 && init.elseActions.length > 0, '枝の中身が空');
});

test('過去のアクティビティ図から if…else…endif の型を採れる', function() {
  var got = BP.harvestFrom(PAST, 'UartDrv 初期化');
  eq(got.length, 1, '採れた型の数');
  eq(got[0].cond, 'ボーレート設定に失敗?');
  eq(got[0].thenLabel, 'はい');
  eq(got[0].thenActions, ['E_UART_BAUD を返す']);
  eq(got[0].elseLabel, 'いいえ');
  eq(got[0].elseActions, ['送受信を有効化する', '初期化完了を記録する']);
  eq(got[0].from, 'UartDrv 初期化');
});

test('else が無い if と入れ子の if は型として採らない', function() {
  eq(BP.harvestFrom(NO_ELSE, 'x').length, 0, 'else 無し');
  eq(BP.harvestFrom(NESTED, 'x').length, 0, '入れ子');
});

test('patterns は組み込みの後に過去図の型を並べ、編集中の図は見ない', function() {
  var docs = [
    { id: 'me', name: 'CanDrv 初期化', diagramType: 'plantuml-activity', dsl: PAST },
    { id: 'sen', name: 'UartDrv 初期化', diagramType: 'plantuml-activity', dsl: PAST },
    { id: 'seq', name: '関係ない図', diagramType: 'plantuml-sequence', dsl: PAST },
  ];
  var all = BP.patterns(docs, 'me');
  eq(all.slice(0, 4).map(function(p) { return p.id; }),
     ['init-fail', 'param-check', 'state-check', 'timeout'], '組み込みが先頭');
  var past = all.filter(function(p) { return p.from; });
  eq(past.length, 1, '過去図の型は重複を落として 1 件');
  eq(past[0].from, 'UartDrv 初期化');
  // 編集中の図しか無ければ過去図の型は出ない
  eq(BP.patterns([docs[0]], 'me').filter(function(p) { return p.from; }).length, 0);
});

test('linesFor が条件・両枝ラベル・枝の中身まで入った行を返す', function() {
  var p = BP.builtins()[0];
  var got = BP.linesFor(p, '  ');
  eq(got[0], '  if (' + p.cond + ') then (' + p.thenLabel + ')');
  eq(got[1], '    :' + p.thenActions[0] + ';');
  eq(got[2], '  else (' + p.elseLabel + ')');
  eq(got[got.length - 1], '  endif');
  ok(got.indexOf('    :;') < 0, '空アクションが残っている');
});

test('枝の中身が空の型は空の枝のまま入り、空行も空アクションも書かない', function() {
  // BLK-owner-20260927-0745-1: 利用者が入れていない `:;` を書かない (PlantUML は空の枝を描く)
  var got = BP.linesFor({ cond: 'c?', thenLabel: '', thenActions: [], elseLabel: '', elseActions: [] }, '');
  eq(got, ['if (c?) then (yes)', 'else (no)', 'endif']);
});

test('signature は枝ラベルの揺れでは変わらず、中身が違えば変わる', function() {
  var a = { cond: 'c?', thenLabel: 'yes', thenActions: ['A'], elseLabel: 'no', elseActions: ['B'] };
  var b = { cond: 'c?', thenLabel: 'はい', thenActions: ['A'], elseLabel: 'いいえ', elseActions: ['B'] };
  var c = { cond: 'c?', thenLabel: 'yes', thenActions: ['A'], elseLabel: 'no', elseActions: ['C'] };
  eq(BP.signature(a), BP.signature(b), 'ラベル違いは同じ型');
  ok(BP.signature(a) !== BP.signature(c), '中身違いは別の型');
});

test('byId で選んだ型を取り出せる', function() {
  var p = BP.byId([], null, 'timeout');
  ok(p && /タイムアウト/.test(p.cond), 'timeout の型が取れない');
  eq(BP.byId([], null, 'nope'), null);
});

});
